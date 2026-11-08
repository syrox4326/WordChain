'use strict';

// Veni, Vidi, Vici: Türkiye haritasında soru bilerek il fethetme (2-6 oyuncu).
// Herkes aynı anda komşu bir il seçer, sorular sunucudan gelir, doğru cevaplar il kazandırır.
// Sorular data/sorular.bin, harita ve komşuluk public/harita.json içinde.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const PICK_MS = Number(process.env.CQ_PICK_MS) || 20000;
const ANSWER_MS = Number(process.env.CQ_ANSWER_MS) || 30000;
const REVEAL_MS = Number(process.env.CQ_REVEAL_MS) || 8000;
const MAX_STEPS = 6;
const MAX_ROUNDS = 45;
const TARGETS = [10, 12, 15];
const LEVELS = { easy: [0, 60, 40, 0], mix: [0, 40, 40, 20], hard: [0, 0, 40, 60] };

let DATA = { cats: [], q: [] };
let MAP = null;
try {
  DATA = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'sorular.bin'))).toString('utf8'));
  MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'harita.json'), 'utf8'));
} catch (e) {
  console.log('Uyarı: Veni, Vidi, Vici için soru veya harita dosyası okunamadı.');
}
const N = MAP ? MAP.il.length : 0;
const KOM = MAP ? MAP.kom : [];
if (MAP) console.log('Veni, Vidi, Vici: ' + DATA.q.length + ' soru, ' + N + ' il yüklendi');

// il -> il en kısa yol uzunluğu
const DIST = [];
for (let s = 0; s < N; s++) {
  const d = new Array(N).fill(99);
  d[s] = 0;
  const q = [s];
  for (let h = 0; h < q.length; h++) for (const y of KOM[q[h]]) if (d[y] === 99) { d[y] = d[q[h]] + 1; q.push(y); }
  DIST.push(d);
}

let api = { broadcast() {}, fail() {}, send() {}, startDelay: 3500 };
function init(a) { api = Object.assign(api, a); }

function parseConfig(msg) {
  if (!N || !DATA.q.length) return { error: 'Bu oyun şu an kullanılamıyor.' };
  let target = parseInt(msg.target, 10);
  if (!TARGETS.includes(target)) target = 12;
  const level = LEVELS[msg.level] ? msg.level : 'mix';
  return { cfg: { target, level } };
}

function setup(room, cfg) {
  room.game = 'conquest';
  room.cq = freshState(cfg);
}

function freshState(cfg) {
  return {
    cfg,
    phase: 'lobby', // lobby | countdown | pick | ask | reveal | end
    round: 0,
    step: 0,
    steps: [],
    owner: new Array(N).fill(null),
    picks: {},
    locked: {},
    pickEndsAt: 0,
    endsAt: 0,
    stepStart: 0,
    skip: {},
    used: new Set(),
    lastCap: {},
    reveal: null,
    changes: [],
    phaseNo: 0,
    result: null,
  };
}

/* ---------- yardımcılar ---------- */

function active(room) { return room.players.filter((p) => !p.left); }
function cityCount(room, p) { let c = 0; for (const o of room.cq.owner) if (o === p.id) c++; return c; }
function frontier(room, p) {
  const own = room.cq.owner;
  const set = new Set();
  for (let i = 0; i < N; i++) if (own[i] === p.id) for (const y of KOM[i]) if (own[y] !== p.id) set.add(y);
  return set;
}
function pickEligible(room, p) {
  return !p.left && room.cq.skip[p.id] !== room.cq.round && frontier(room, p).size > 0;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}

function startCities(k) {
  if (process.env.CQ_TEST_ADJ) { const c = 34; return [c].concat(KOM[c].slice(0, k - 1)); } // yalnızca testler için
  const cand = [];
  for (let i = 0; i < N; i++) if (KOM[i].length >= 3) cand.push(i);
  for (const minD of [4, 3, 2]) {
    for (let tries = 0; tries < 3000; tries++) {
      const s = shuffle(cand.slice()).slice(0, k);
      let ok = true;
      for (let a = 0; a < k && ok; a++) for (let b = a + 1; b < k; b++) if (DIST[s[a]][s[b]] < minD) { ok = false; break; }
      if (ok) return s;
    }
  }
  return shuffle(cand.slice()).slice(0, k);
}

function pickQuestion(room) {
  const cq = room.cq;
  const w = LEVELS[cq.cfg.level];
  let r = crypto.randomInt(100), d = 1;
  for (let i = 1; i <= 3; i++) { if (r < w[i]) { d = i; break; } r -= w[i]; }
  let pool = [];
  for (let i = 0; i < DATA.q.length; i++) if (DATA.q[i][4] === d && !cq.used.has(i)) pool.push(i);
  if (!pool.length) {
    cq.used.clear();
    for (let i = 0; i < DATA.q.length; i++) if (DATA.q[i][4] === d) pool.push(i);
  }
  const idx = pool[crypto.randomInt(pool.length)];
  cq.used.add(idx);
  const x = DATA.q[idx];
  return { id: idx, cat: DATA.cats[x[0]].title, t: x[1], o: x[2], a: x[3], d: x[4] };
}

/* ---------- görünüm ---------- */

function publicGroup(g, reveal) {
  const out = {
    id: g.id, city: g.city, kind: g.kind,
    att: g.att.slice(), def: g.def, defAbsent: !!g.defAbsent,
    q: { cat: g.q.cat, t: g.q.t, o: g.q.o, d: g.q.d },
  };
  if (reveal) { out.correct = g.q.a; out.res = g.res; }
  return out;
}

function snapshot(room, viewer) {
  const cq = room.cq;
  const idxOf = new Map(room.players.map((p, i) => [p.id, i]));
  const stepGroups = (cq.phase === 'ask' || cq.phase === 'reveal') ? (cq.steps[cq.step] || []) : [];
  let me = null;
  if (viewer) {
    me = { pick: cq.picks[viewer.id] === undefined ? -1 : cq.picks[viewer.id], gid: null, answered: false, ansI: -1, skip: cq.skip[viewer.id] === cq.round, locked: !!cq.locked[viewer.id] && cq.picks[viewer.id] === undefined, attackedBy: [] };
    if (cq.phase === 'pick') {
      for (const pid of Object.keys(cq.picks)) {
        const c = cq.picks[pid];
        if (cq.owner[c] === viewer.id) {
          let e = me.attackedBy.find((x) => x.city === c);
          if (!e) me.attackedBy.push(e = { city: c, by: [] });
          e.by.push(room.players.findIndex((x) => x.id === pid));
        }
      }
    }
    for (const g of stepGroups) {
      if (g.att.includes(viewer.id) || (g.def === viewer.id && !g.defAbsent)) {
        me.gid = g.id;
        me.answered = !!g.ans[viewer.id];
        me.ansI = g.ans[viewer.id] ? g.ans[viewer.id].i : -1;
      }
    }
  }
  const answered = {};
  for (const g of stepGroups) for (const id of Object.keys(g.ans)) answered[id] = true;
  const picked = {};
  for (const id of Object.keys(cq.picks)) picked[id] = true;
  return {
    t: 'state',
    game: 'conquest',
    code: room.code,
    max: room.max,
    status: room.status,
    hostId: room.hostId,
    now: Date.now(),
    startAt: room.startAt || 0,
    players: room.players.map((p, i) => ({
      id: p.id, name: p.name, avatar: p.avatar, ready: p.ready, connected: !!p.ws, left: !!p.left,
      color: typeof p.color === 'number' ? p.color : i,
      cities: cityCount(room, p),
      skip: cq.skip[p.id] === cq.round + 1 || (cq.skip[p.id] === cq.round && cq.phase !== 'lobby'),
    })),
    settings: { target: cq.cfg.target, level: cq.cfg.level },
    cq: {
      phase: cq.phase,
      round: cq.round,
      step: cq.step,
      steps: cq.steps.length,
      owner: cq.owner.map((id) => (id === null ? -1 : idxOf.get(id))),
      pickEndsAt: cq.pickEndsAt,
      endsAt: cq.endsAt,
      picked,
      answered,
      groups: stepGroups.map((g) => publicGroup(g, cq.phase === 'reveal')),
      changes: cq.phase === 'reveal' || cq.phase === 'pick' ? cq.changes : [],
      me,
      result: cq.result,
    },
  };
}

/* ---------- akış ---------- */

function setTimer(room, ms, fn) {
  const cq = room.cq;
  const no = ++cq.phaseNo;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => { if (room.status === 'playing' && cq.phaseNo === no) fn(); }, ms);
}

function start(room, p) {
  if (room.status !== 'lobby' || p.id !== room.hostId) return;
  if (room.players.length < 2) return api.fail(p.ws, 'start', 'Başlamak için en az 2 kişi gerekli.');
  if (room.players.some((x) => x.id !== room.hostId && !x.ready)) return api.fail(p.ws, 'start', 'Herkes hazır olunca başlatabilirsin.');
  if (room.players.some((x) => !x.ws)) return api.fail(p.ws, 'start', 'Bağlantısı kopan bir oyuncu var, biraz bekle.');
  const cq = freshState(room.cq.cfg);
  room.cq = cq;
  const starts = startCities(room.players.length);
  room.players.forEach((x, i) => { x.color = i; x.left = false; cq.owner[starts[i]] = x.id; });
  room.status = 'playing';
  cq.phase = 'countdown';
  room.startAt = Date.now() + api.startDelay;
  setTimer(room, api.startDelay + 100, () => startRound(room));
  api.broadcast(room);
}

function startRound(room) {
  const cq = room.cq;
  if (room.status !== 'playing') return;
  cq.round++;
  cq.picks = {};
  cq.locked = {};
  cq.steps = [];
  cq.step = 0;
  cq.reveal = null;
  cq.phase = 'pick';
  cq.pickEndsAt = Date.now() + PICK_MS;
  const elig = room.players.filter((p) => pickEligible(room, p));
  setTimer(room, PICK_MS + 200, () => endPick(room));
  api.broadcast(room);
  if (!elig.length) setTimer(room, 1200, () => endPick(room));
}

function maybeEarlyEnd(room) {
  const cq = room.cq;
  if (room.status !== 'playing' || cq.phase !== 'pick') return;
  const elig = room.players.filter((x) => pickEligible(room, x) && x.ws && !cq.locked[x.id]);
  if (Object.keys(cq.picks).length && elig.every((x) => cq.picks[x.id] !== undefined)) {
    setTimer(room, 700, () => endPick(room));
  }
}

function pick(room, p, city) {
  const cq = room.cq;
  if (room.status !== 'playing' || cq.phase !== 'pick') return;
  if (Date.now() > cq.pickEndsAt + 300) return;
  if (!pickEligible(room, p)) return api.send(p.ws, { t: 'reject', msg: cq.skip[p.id] === cq.round ? 'Bu tur oynayamazsın.' : 'Seçebileceğin il yok.' });
  const cur = cq.picks[p.id];
  if (cur === undefined && cq.locked[p.id]) return api.send(p.ws, { t: 'reject', msg: 'Sana saldırılıyor, savunmaya hazırlan.' });
  if (cur !== undefined && cq.owner[cur] && city !== cur) return api.send(p.ws, { t: 'reject', msg: 'Saldırı kararını değiştiremezsin.' });
  if (city === -1) delete cq.picks[p.id];
  else {
    if (!Number.isInteger(city) || city < 0 || city >= N) return;
    if (!frontier(room, p).has(city)) return api.send(p.ws, { t: 'reject', msg: 'Sadece sınırındaki illeri seçebilirsin.' });
    cq.picks[p.id] = city;
    // Saldırıya uğrayan, henüz seçmediyse seçim yapamaz: doğrudan savunmaya geçer.
    const o = cq.owner[city];
    if (o && cq.picks[o] === undefined) cq.locked[o] = true;
  }
  maybeEarlyEnd(room);
  api.broadcast(room);
}

function endPick(room) {
  const cq = room.cq;
  if (room.status !== 'playing' || cq.phase !== 'pick') return;
  const byCity = new Map();
  for (const p of room.players) {
    const c = cq.picks[p.id];
    if (c === undefined || p.left) continue;
    if (!byCity.has(c)) byCity.set(c, []);
    byCity.get(c).push(p.id);
  }
  const groups = [];
  let gid = 0;
  for (const city of Array.from(byCity.keys()).sort((a, b) => a - b)) {
    const owner = cq.owner[city];
    const ownerP = owner ? room.players.find((x) => x.id === owner) : null;
    groups.push({
      id: ++gid, city, kind: owner ? 'attack' : 'claim', att: byCity.get(city), def: ownerP && !ownerP.left ? owner : null,
      defAbsent: !!(ownerP && (ownerP.left || !ownerP.ws)), ans: {}, res: null, q: null,
    });
  }
  // Aynı anda bir oyuncu tek soru çözer: çakışan gruplar sonraki adıma kayar.
  const steps = [];
  const place = (g, useDef) => {
    const ids = g.att.concat(useDef && g.def && !g.defAbsent ? [g.def] : []);
    for (let s = 0; s < MAX_STEPS; s++) {
      if (!steps[s]) steps[s] = { groups: [], used: new Set() };
      if (ids.every((id) => !steps[s].used.has(id))) {
        ids.forEach((id) => steps[s].used.add(id));
        steps[s].groups.push(g);
        return true;
      }
    }
    return false;
  };
  for (const g of groups) {
    if (!place(g, true)) {
      g.defAbsent = true; // savunan başka sorularda meşgul
      if (!place(g, false)) { steps[0].groups.push(g); }
    }
  }
  cq.steps = steps.filter(Boolean).map((s) => s.groups).filter((l) => l.length);
  for (const list of cq.steps) for (const g of list) g.q = pickQuestion(room);
  if (!cq.steps.length) {
    cq.changes = [];
    return setTimer(room, 900, () => endRound(room));
  }
  startStep(room, 0);
}

function startStep(room, s) {
  const cq = room.cq;
  cq.step = s;
  cq.phase = 'ask';
  cq.stepStart = Date.now();
  cq.endsAt = cq.stepStart + ANSWER_MS;
  cq.changes = [];
  // Bağlantısı kopmuş oyuncuyu bekleme: cevapsız sayılır.
  for (const g of cq.steps[s]) {
    for (const id of g.att.concat(g.def && !g.defAbsent ? [g.def] : [])) {
      const pl = room.players.find((x) => x.id === id);
      if (!pl || pl.left || !pl.ws) g.ans[id] = { i: -1, ms: ANSWER_MS, off: true };
    }
  }
  setTimer(room, ANSWER_MS + 400, () => endAsk(room));
  api.broadcast(room);
  checkAllAnswered(room);
}

function participants(g) { return g.att.concat(g.def && !g.defAbsent ? [g.def] : []); }

function checkAllAnswered(room) {
  const cq = room.cq;
  if (cq.phase !== 'ask') return;
  const done = cq.steps[cq.step].every((g) => participants(g).every((id) => g.ans[id]));
  if (done) setTimer(room, 700, () => endAsk(room));
}

function answer(room, p, i) {
  const cq = room.cq;
  if (room.status !== 'playing' || cq.phase !== 'ask') return;
  if (!Number.isInteger(i) || i < 0 || i > 3) return;
  const g = cq.steps[cq.step].find((x) => participants(x).includes(p.id));
  if (!g || g.ans[p.id]) return;
  const now = Date.now();
  if (now > cq.endsAt + 300) return;
  g.ans[p.id] = { i, ms: Math.max(0, now - cq.stepStart) };
  api.broadcast(room);
  checkAllAnswered(room);
}

function endAsk(room) {
  const cq = room.cq;
  if (room.status !== 'playing' || cq.phase !== 'ask') return;
  const changes = [];
  for (const g of cq.steps[cq.step]) {
    const ok = (id) => g.ans[id] && g.ans[id].i === g.q.a;
    const ms = (id) => (g.ans[id] ? g.ans[id].ms : ANSWER_MS);
    const okAtt = g.att.filter(ok).sort((a, b) => ms(a) - ms(b));
    const defOk = g.def && !g.defAbsent && ok(g.def);
    const res = { winnerId: null, type: 'none', penalty: [] };
    if (g.kind === 'claim') {
      if (okAtt.length) { res.winnerId = okAtt[0]; res.type = 'captured'; }
    } else if (okAtt.length) {
      const fastest = okAtt[0];
      if (defOk && ms(g.def) <= ms(fastest)) res.type = 'held';
      else { res.winnerId = fastest; res.type = 'captured'; }
    } else {
      res.type = defOk ? 'held' : 'none';
    }
    if (g.kind === 'attack' && defOk) {
      for (const id of g.att) if (!ok(id)) { res.penalty.push(id); cq.skip[id] = cq.round + 1; }
    }
    if (res.winnerId) {
      const from = cq.owner[g.city];
      cq.owner[g.city] = res.winnerId;
      cq.lastCap[res.winnerId] = ms(res.winnerId);
      changes.push({ city: g.city, to: room.players.findIndex((x) => x.id === res.winnerId), from: from ? room.players.findIndex((x) => x.id === from) : -1 });
    }
    g.res = {
      winnerId: res.winnerId, type: res.type, penalty: res.penalty,
      ans: Object.fromEntries(Object.keys(g.ans).map((id) => [id, { i: g.ans[id].i, ok: !!ok(id), ms: g.ans[id].ms }])),
    };
  }
  cq.changes = changes;
  cq.phase = 'reveal';
  cq.endsAt = Date.now() + REVEAL_MS;
  setTimer(room, REVEAL_MS, () => {
    if (cq.step + 1 < cq.steps.length) startStep(room, cq.step + 1);
    else endRound(room);
  });
  api.broadcast(room);
}

function endRound(room) {
  const cq = room.cq;
  if (room.status !== 'playing') return;
  const pl = active(room);
  const counts = pl.map((p) => ({ p, c: cityCount(room, p) }));
  const top = Math.max(...counts.map((x) => x.c));
  if (top >= cq.cfg.target || cq.round >= MAX_ROUNDS) {
    let lead = counts.filter((x) => x.c === top);
    if (lead.length > 1) {
      const best = Math.min(...lead.map((x) => (cq.lastCap[x.p.id] === undefined ? 1e9 : cq.lastCap[x.p.id])));
      if (best < 1e9) lead = lead.filter((x) => cq.lastCap[x.p.id] === best);
    }
    return finish(room, lead.map((x) => x.p.id), null);
  }
  startRound(room);
}

function finish(room, winnerIds, forfeitBy) {
  const cq = room.cq;
  clearTimeout(room.timer);
  cq.phaseNo++;
  room.status = 'finished';
  cq.phase = 'end';
  const counts = {};
  for (const p of room.players) counts[p.id] = cityCount(room, p);
  cq.result = { winnerIds, draw: winnerIds.length > 1, counts, forfeitBy };
  cq.picks = {};
  api.broadcast(room);
}

function config(room, p, msg) {
  if (room.status !== 'lobby' || p.id !== room.hostId) return;
  const r = parseConfig(msg);
  if (r.error) return api.fail(p.ws, 'config', r.error);
  room.cq.cfg = r.cfg;
  for (const x of room.players) if (x.id !== room.hostId) x.ready = false;
  api.broadcast(room);
}

function rematch(room, p) {
  if (room.status !== 'finished' || p.id !== room.hostId) return;
  clearTimeout(room.timer);
  room.players = room.players.filter((x) => !x.left);
  if (!room.players.includes(p)) return;
  room.status = 'lobby';
  room.startAt = 0;
  room.cq = freshState(room.cq.cfg);
  for (const x of room.players) { x.ready = false; x.left = false; }
  api.broadcast(room);
}

function flag(room, p, msg) {
  const g = room.cq.steps.flat().find((x) => x.id === parseInt(msg.gid, 10));
  if (g) console.log('[SORU-BILDIRIMI] ' + room.code + ' | ' + g.q.cat + ' | ' + g.q.t + ' | ' + g.q.o.join(' / ') + ' | doğru=' + g.q.a);
}

function leave(room, p, removePlayer) {
  const cq = room.cq;
  if (room.status === 'playing') {
    p.left = true;
    delete cq.picks[p.id];
    for (let i = 0; i < N; i++) if (cq.owner[i] === p.id) cq.owner[i] = null;
    const rest = active(room);
    if (room.hostId === p.id && rest.length) room.hostId = rest[0].id;
    if (rest.length < 2) return finish(room, rest.map((x) => x.id), p.name);
    if (cq.phase === 'pick') maybeEarlyEnd(room);
    if (cq.phase === 'ask') {
      for (const g of cq.steps[cq.step]) if (participants(g).includes(p.id) && !g.ans[p.id]) g.ans[p.id] = { i: -1, ms: ANSWER_MS, off: true };
      checkAllAnswered(room);
    }
    return;
  }
  if (room.status === 'finished') {
    p.left = true;
    if (room.hostId === p.id) { const rest = active(room); if (rest.length) room.hostId = rest[0].id; }
    return;
  }
  removePlayer(room, p);
}

function act(room, p, msg) {
  switch (msg.t) {
    case 'pick': pick(room, p, parseInt(msg.city, 10)); break;
    case 'answer': answer(room, p, parseInt(msg.i, 10)); break;
    case 'config': config(room, p, msg); break;
    case 'flag': flag(room, p, msg); break;
    default: break;
  }
}

function disconnected(room) {
  if (room.status === 'playing' && room.cq.phase === 'pick') maybeEarlyEnd(room);
}

module.exports = { disconnected, init, parseConfig, setup, snapshot, start, rematch, leave, act };
