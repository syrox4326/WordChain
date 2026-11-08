const WebSocket = require('ws'), fs = require('fs'), zlib = require('zlib');
const R = __dirname + '/../';
const DATA = JSON.parse(zlib.gunzipSync(fs.readFileSync(R + 'data/sorular.bin')));
const MAP = JSON.parse(fs.readFileSync(R + 'public/harita.json'));
const ANS = new Map(DATA.q.map((x) => [x[1], x[3]]));
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK   ' : 'HATA ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stats = { lockedRejects: 0, atkChangeRejects: 0, attacks: 0, lockedSeen: 0, leaks: 0, badSum: 0, flagSent: 0, defNoPick: 0 };
function client(name, acc, mode) {
  const c = { name, acc, mode: mode || 'auto', state: null, me: null, token: null, rejects: [], pickedRounds: new Set(), last: Date.now(), phases: [] };
  const conn = () => {
    c.ws = new WebSocket('ws://localhost:3111');
    c.ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.t === 'state') { c.state = m; c.last = Date.now(); check(c); react(c); }
      else if (m.t === 'joined') { c.me = m.you; c.token = m.token; }
      else if (m.t === 'reject') c.rejects.push(m);
    });
    c.open = new Promise((r) => c.ws.on('open', r));
  };
  c.reconnect = () => { conn(); return c.open.then(() => c.send({ t: 'join', code: c.state.code, token: c.token })); };
  conn();
  c.send = (o) => { if (c.ws.readyState === 1) c.ws.send(JSON.stringify(o)); };
  return c;
}
function check(c) {
  const s = c.state; if (s.game !== 'conquest') return;
  const q = s.cq;
  const owned = q.owner.filter((o) => o >= 0).length;
  const sum = s.players.reduce((a, p) => a + p.cities, 0);
  if (owned !== sum) stats.badSum++;
  if (q.phase !== 'reveal' && q.phase !== 'end' && JSON.stringify(q).includes('"correct"')) stats.leaks++;
  if (q.phase === 'pick' && q.me && q.me.locked) { stats.lockedSeen++; if (q.me.pick >= 0) stats.defNoPick++; }
}
function react(c) {
  const s = c.state; if (c.mode !== 'auto' || s.game !== 'conquest') return;
  const q = s.cq;
  const idx = s.players.findIndex((p) => p.id === c.me);
  if (q.phase === 'pick' && q.me) {
    if (q.me.locked && !c.triedLocked) {
      c.triedLocked = true; const before = c.rejects.length;
      c.send({ t: 'pick', city: 0 });
      setTimeout(() => { if (c.rejects.length > before) stats.lockedRejects++; }, 150);
    }
    if (!c.pickedRounds.has(q.round) && !q.me.locked && !q.me.skip) {
      const mine = new Set(); q.owner.forEach((o, i) => { if (o === idx) mine.add(i); });
      const fr = new Set(); for (const i of mine) for (const y of MAP.kom[i]) if (!mine.has(y)) fr.add(y);
      if (fr.size) {
        c.pickedRounds.add(q.round);
        const arr = [...fr]; const en = arr.filter((i) => q.owner[i] >= 0);
        const city = (en.length && Math.random() < 0.8) ? en[Math.floor(Math.random() * en.length)] : arr[Math.floor(Math.random() * arr.length)];
        setTimeout(() => {
          c.send({ t: 'pick', city });
          if (q.owner[city] >= 0) {
            stats.attacks++;
            const before = c.rejects.length;
            const other = arr.find((i) => i !== city);
            if (other !== undefined) setTimeout(() => { c.send({ t: 'pick', city: other }); setTimeout(() => { if (c.rejects.length > before) stats.atkChangeRejects++; }, 150); }, 50);
          }
        }, Math.random() * 400);
      }
    }
  }
  if (q.phase !== 'pick') c.triedLocked = false;
  if (q.phase === 'ask' && q.me && q.me.gid && !q.me.answered && !c['a' + q.round + ':' + q.step]) {
    c['a' + q.round + ':' + q.step] = 1;
    const g = q.groups.find((x) => x.id === q.me.gid);
    const right = ANS.get(g.q.t);
    const pick = Math.random() < c.acc ? right : (right + 1) % 4;
    setTimeout(() => c.send({ t: 'answer', i: pick }), 10 + Math.random() * 200);
    if (Math.random() < 0.05) { c.send({ t: 'flag', gid: g.id }); stats.flagSent++; }
  }
}
async function until(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await sleep(30); } return false; }
async function room(n, target) {
  const cs = []; const A = client('P0', 0.75); cs.push(A); await A.open;
  A.send({ t: 'create', game: 'conquest', name: 'P0', max: n, target, level: 'mix', avatar: 'owl' });
  await until(() => A.state);
  for (let i = 1; i < n; i++) { const B = client('P' + i, 0.5 + Math.random() * 0.4); cs.push(B); await B.open; B.send({ t: 'join', code: A.state.code, name: 'P' + i, avatar: 'fox' }); await until(() => B.state && B.me); B.send({ t: 'ready', value: true }); }
  await until(() => A.state.players.every((p) => p.id === A.state.hostId || p.ready));
  return cs;
}
async function fullGame(n, target) {
  const cs = await room(n, target); const A = cs[0];
  A.send({ t: 'start' });
  let stall = false; const t0 = Date.now();
  while (Date.now() - t0 < 170000) {
    if (A.state.status === 'finished') break;
    if (Date.now() - A.last > 6000) { stall = true; break; }
    await sleep(100);
  }
  const fin = A.state.status === 'finished';
  const r = A.state.cq.result;
  ok(fin && !stall, n + ' oyuncu: oyun bitti, takılma yok (' + Math.round((Date.now() - t0) / 1000) + ' sn, tur ' + A.state.cq.round + ', faz ' + A.state.cq.phase + ')');
  if (fin) ok(r && r.winnerIds.length >= 1, n + ' oyuncu: kazanan var ' + JSON.stringify(r.counts ? Object.values(r.counts) : null));
  cs.forEach((c) => c.ws.close());
}
(async () => {
  await Promise.all([fullGame(2, 10), fullGame(3, 10), fullGame(4, 10), fullGame(5, 10), fullGame(6, 10)]);
  console.log(JSON.stringify(stats));
  ok(stats.leaks === 0, 'cevap sızıntısı yok');
  ok(stats.badSum === 0, 'il sayıları tutarlı');
  ok(stats.defNoPick === 0, 'kilitli savunmacı seçim yapamadı');
  ok(stats.attacks > 0, 'saldırılar oldu: ' + stats.attacks);
  ok(stats.lockedSeen > 0, 'saldırıya uğrayan kilitlendi: ' + stats.lockedSeen);
  ok(stats.lockedRejects >= stats.lockedSeen * 0.5, 'kilitli seçim reddi: ' + stats.lockedRejects);
  ok(stats.atkChangeRejects >= stats.attacks * 0.5, 'saldırı kararı değiştirilemedi: ' + stats.atkChangeRejects);

  // ayrılma ve kopma senaryoları
  { const cs = await room(3, 12); const [A, B, C] = cs; A.send({ t: 'start' });
    await until(() => A.state.cq.phase === 'pick', 4000);
    B.mode = 'off'; C.mode = 'off';
    B.ws.close(); // kopma: seçim erken bitmeli
    A.send({ t: 'pick', city: (() => { const idx = A.state.players.findIndex((p) => p.id === A.me); const o = A.state.cq.owner; const fr = []; o.forEach((x, i) => { if (x === idx) MAP.kom[i].forEach((y) => { if (o[y] !== idx) fr.push(y); }); }); return fr[0]; })() });
    const t = Date.now();
    ok(await until(() => A.state.cq.phase !== 'pick', 6000), 'kopan oyuncu seçimi beklemeden oyun ilerledi (C hâlâ seçmedi, süre dolunca)');
    C.send({ t: 'leave' });
    ok(await until(() => A.state.players.find((p) => p.id === C.me).left, 3000), 'ayrılan oyuncu left');
    ok(await until(() => A.state.cq.phase === 'pick' || A.state.cq.phase === 'ask' || A.state.cq.phase === 'reveal', 3000), 'oyun sürüyor');
    await B.reconnect();
    ok(await until(() => B.state && B.state.cq && B.state.cq.me, 3000), 'kopan oyuncu token ile geri döndü');
    A.send({ t: 'leave' }); B.send({ t: 'leave' }); await sleep(500);
    ok(B.state.status === 'finished' || B.state.cq.phase === 'end', 'herkes çıkınca oyun bitti');
    cs.forEach((c) => c.ws.close()); }
  console.log(fails ? fails + ' hata' : 'Tüm kontroller geçti');
  process.exit(fails ? 1 : 0);
})();
