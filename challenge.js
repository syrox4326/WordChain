'use strict';

// 20 TL Challenge: iki oyuncu, birer 20 TL, seçenekler 1 TL'den başlayan artırmayla alınır.
// Konu içerikleri data/konular.bin içinde (sıkıştırılmış). Seçenekler istemciye topluca gönderilmez,
// oyun sırasında yalnızca o an ortada olan seçenek ve satın alınanlar görünür.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const START_MONEY = 20;
const DECK_SIZE = 20;
const MIN_DECIDE_S = Number(process.env.MIN_DECIDE_S) || 10;
const MAX_DECIDE_S = 90;
const DEFAULT_DECIDE_S = 30;
const SOLD_DELAY_MS = process.env.SOLD_DELAY_MS !== undefined ? Number(process.env.SOLD_DELAY_MS) : 2600;
const OFFLINE_DECIDE_MS = 3000;

let TOPICS = [];
try {
  TOPICS = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(__dirname, 'data', 'konular.bin'))).toString('utf8'));
} catch (e) {
  console.log('Uyarı: data/konular.bin okunamadı, 20 TL Challenge kullanılamaz.');
}
const byId = new Map(TOPICS.map((t) => [t.id, t]));
if (TOPICS.length) console.log('20 TL Challenge: ' + TOPICS.length + ' konu yüklendi');

let api = { broadcast() {}, fail() {}, send() {}, startDelay: 3500 };
function init(a) { api = Object.assign(api, a); }

function publicTopics() {
  return TOPICS.map((t) => ({ id: t.id, title: t.title, emoji: t.emoji, desc: t.desc, base: t.base || '' }));
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

// Havuzdan 20 seçenek: 5-7 tanesi bomba.
function buildDeck(t) {
  const bombs = 5 + crypto.randomInt(3);
  const bad = shuffle(t.bad.slice()).slice(0, Math.min(bombs, t.bad.length));
  const good = shuffle(t.good.slice()).slice(0, DECK_SIZE - bad.length);
  return shuffle(bad.concat(good));
}

function parseConfig(msg) {
  if (!TOPICS.length) return { error: 'Bu oyun şu an kullanılamıyor.' };
  const topic = msg.topic === 'random' ? 'random' : String(msg.topic || '');
  if (topic !== 'random' && !byId.has(topic)) return { error: 'Önce bir konu seç.' };
  const picks = Math.min(8, Math.max(3, parseInt(msg.picks, 10) || 5));
  let d = parseInt(msg.decide, 10);
  if (!Number.isFinite(d)) d = DEFAULT_DECIDE_S;
  d = Math.min(MAX_DECIDE_S, Math.max(MIN_DECIDE_S, d));
  return { cfg: { topic, picks, decideMs: d * 1000 } };
}

function setup(room, cfg) {
  room.game = 'challenge';
  room.max = 2;
  room.ch = {
    cfg,
    topicId: null,
    deck: [],
    idx: -1,
    phase: 'lobby', // lobby | countdown | bid | sold | vote
    item: null,
    bid: 0,
    bidderId: null,
    turnId: null,
    turnEndsAt: 0,
    turnNo: 0,
    starterIdx: 0,
    sold: null,
    log: [],
    votes: {},
    lastSplit: null,
    splits: 0,
    result: null,
  };
}

/* ---------- yardımcılar ---------- */

function opponent(room, p) { return room.players.find((x) => x !== p); }
function itemsOf(p) { return p.items || (p.items = []); }
function moneyOf(p) { return typeof p.money === 'number' ? p.money : START_MONEY; }
function eligible(room, p) { return itemsOf(p).length < room.ch.cfg.picks && moneyOf(p) >= 1; }
function canRaise(room, p, bid) { return itemsOf(p).length < room.ch.cfg.picks && moneyOf(p) >= bid + 1; }

function topicInfo(room) {
  const ch = room.ch;
  if (ch.topicId && (room.status !== 'lobby')) {
    const t = byId.get(ch.topicId);
    return t ? { id: t.id, title: t.title, emoji: t.emoji, base: t.base || '' } : null;
  }
  if (ch.cfg.topic === 'random') return { id: 'random', title: 'Rastgele konu', emoji: '🎲', base: '' };
  const t = byId.get(ch.cfg.topic);
  return t ? { id: t.id, title: t.title, emoji: t.emoji, base: t.base || '' } : null;
}

function snapshot(room) {
  const ch = room.ch;
  const voted = {};
  for (const id of Object.keys(ch.votes)) voted[id] = true;
  return {
    t: 'state',
    game: 'challenge',
    code: room.code,
    max: 2,
    status: room.status,
    hostId: room.hostId,
    now: Date.now(),
    startAt: room.startAt || 0,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      ready: p.ready,
      connected: !!p.ws,
      money: moneyOf(p),
      items: itemsOf(p).slice(),
      left: !!p.left,
    })),
    settings: { topic: topicInfo(room), randomTopic: ch.cfg.topic === 'random', picks: ch.cfg.picks, decideMs: ch.cfg.decideMs },
    ch: {
      phase: ch.phase,
      round: Math.max(0, ch.idx + 1),
      rounds: ch.cfg.picks * 2,
      item: ch.phase === 'bid' || ch.phase === 'sold' ? ch.item : null,
      bid: ch.bid,
      bidderId: ch.bidderId,
      turnId: ch.turnId,
      turnEndsAt: ch.turnEndsAt,
      sold: ch.sold,
      log: ch.log.slice(-12),
      voted,
      lastSplit: ch.lastSplit,
      splits: ch.splits,
      result: ch.result,
    },
  };
}

/* ---------- oyun akışı ---------- */

function start(room, p) {
  if (room.status !== 'lobby' || p.id !== room.hostId) return;
  if (room.players.length < 2) return api.fail(p.ws, 'start', 'Başlamak için bir rakibin odaya katılması gerekiyor.');
  if (room.players.some((x) => x.id !== room.hostId && !x.ready)) return api.fail(p.ws, 'start', 'Rakibin hazır olması bekleniyor.');
  if (room.players.some((x) => !x.ws)) return api.fail(p.ws, 'start', 'Bağlantısı kopan bir oyuncu var, biraz bekle.');
  const ch = room.ch;
  const tid = ch.cfg.topic === 'random' ? TOPICS[crypto.randomInt(TOPICS.length)].id : ch.cfg.topic;
  ch.topicId = tid;
  ch.deck = buildDeck(byId.get(tid));
  ch.idx = -1;
  ch.item = null;
  ch.bid = 0;
  ch.bidderId = null;
  ch.turnId = null;
  ch.turnEndsAt = 0;
  ch.sold = null;
  ch.log = [];
  ch.votes = {};
  ch.lastSplit = null;
  ch.splits = 0;
  ch.result = null;
  ch.starterIdx = crypto.randomInt(2);
  for (const x of room.players) { x.money = START_MONEY; x.items = []; x.left = false; }
  room.status = 'playing';
  ch.phase = 'countdown';
  room.startAt = Date.now() + api.startDelay;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => nextRound(room), api.startDelay + 100);
  api.broadcast(room);
}

function endGame(room) {
  const ch = room.ch;
  clearTimeout(room.timer);
  room.status = 'finished';
  ch.phase = 'vote';
  ch.item = null;
  ch.turnId = null;
  ch.turnEndsAt = 0;
  api.broadcast(room);
}

function nextRound(room) {
  const ch = room.ch;
  if (room.status !== 'playing') return;
  clearTimeout(room.timer);
  ch.idx++;
  const pl = room.players;
  const allFull = pl.every((p) => itemsOf(p).length >= ch.cfg.picks);
  if (allFull || !pl.some((p) => eligible(room, p)) || ch.idx >= ch.deck.length) return endGame(room);

  ch.item = ch.deck[ch.idx];
  ch.sold = null;
  const first = pl[(ch.starterIdx + ch.idx) % 2];
  const starter = eligible(room, first) ? first : opponent(room, first);
  const other = opponent(room, starter);
  ch.bid = 1;
  ch.bidderId = starter.id;
  if (canRaise(room, other, 1)) {
    ch.phase = 'bid';
    armTimer(room, other);
    api.broadcast(room);
  } else {
    sell(room, starter, 1);
  }
}

function armTimer(room, resp) {
  const ch = room.ch;
  const no = ++ch.turnNo;
  const ms = resp.ws ? ch.cfg.decideMs : Math.min(OFFLINE_DECIDE_MS, ch.cfg.decideMs);
  ch.turnId = resp.id;
  ch.turnEndsAt = Date.now() + ms;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => {
    if (room.status === 'playing' && ch.phase === 'bid' && ch.turnNo === no) pass(room, resp, true);
  }, ms + 300);
}

function sell(room, buyer, price) {
  const ch = room.ch;
  buyer.money = moneyOf(buyer) - price;
  itemsOf(buyer).push(ch.item);
  ch.sold = { item: ch.item, toId: buyer.id, price };
  ch.log.push({ item: ch.item, to: buyer.name, avatar: buyer.avatar, price });
  ch.phase = 'sold';
  ch.turnId = null;
  ch.turnEndsAt = 0;
  clearTimeout(room.timer);
  room.timer = setTimeout(() => nextRound(room), SOLD_DELAY_MS);
  api.broadcast(room);
}

function pass(room, p, timedOut) {
  const ch = room.ch;
  if (room.status !== 'playing' || ch.phase !== 'bid' || ch.turnId !== p.id) return;
  const buyer = room.players.find((x) => x.id === ch.bidderId);
  if (!buyer) return;
  if (timedOut) ch.sold = null;
  sell(room, buyer, ch.bid);
}

function raise(room, p) {
  const ch = room.ch;
  if (room.status !== 'playing' || ch.phase !== 'bid' || ch.turnId !== p.id) return;
  if (!canRaise(room, p, ch.bid)) return api.send(p.ws, { t: 'reject', msg: itemsOf(p).length >= ch.cfg.picks ? 'Ürün hakkın doldu.' : 'Teklifi artıracak paran yok.' });
  ch.bid += 1;
  ch.bidderId = p.id;
  const other = opponent(room, p);
  if (other && canRaise(room, other, ch.bid)) {
    armTimer(room, other);
    api.broadcast(room);
  } else {
    sell(room, p, ch.bid);
  }
}

function vote(room, p, target) {
  const ch = room.ch;
  if (room.status !== 'finished' || ch.result) return;
  const ids = room.players.filter((x) => !x.left).map((x) => x.id);
  if (!ids.includes(p.id)) return;
  if (target !== 'draw' && !ids.includes(target)) return;
  ch.votes[p.id] = target;
  if (ids.length === 2 && ids.every((id) => ch.votes[id])) {
    const a = ch.votes[ids[0]], b = ch.votes[ids[1]];
    if (a === b) {
      ch.result = { winnerId: a === 'draw' ? null : a, draw: a === 'draw' };
    } else {
      ch.splits++;
      ch.lastSplit = Object.assign({}, ch.votes);
      ch.votes = {};
    }
  }
  api.broadcast(room);
}

function config(room, p, msg) {
  if (room.status !== 'lobby' || p.id !== room.hostId) return;
  const r = parseConfig(msg);
  if (r.error) return api.fail(p.ws, 'config', r.error);
  room.ch.cfg = r.cfg;
  for (const x of room.players) if (x.id !== room.hostId) x.ready = false;
  api.broadcast(room);
}

function rematch(room, p) {
  if (room.status !== 'finished' || p.id !== room.hostId) return;
  const ch = room.ch;
  clearTimeout(room.timer);
  room.players = room.players.filter((x) => !x.left);
  if (!room.players.includes(p)) return;
  room.status = 'lobby';
  ch.phase = 'lobby';
  ch.topicId = null;
  ch.deck = [];
  ch.idx = -1;
  ch.item = null;
  ch.sold = null;
  ch.log = [];
  ch.votes = {};
  ch.lastSplit = null;
  ch.result = null;
  room.startAt = 0;
  for (const x of room.players) { x.money = START_MONEY; x.items = []; x.ready = false; }
  api.broadcast(room);
}

// Oyuncu "odadan çık" dedi. removePlayer sunucudaki ortak fonksiyondur.
function leave(room, p, removePlayer) {
  if (room.status === 'playing') {
    const other = opponent(room, p);
    clearTimeout(room.timer);
    p.left = true;
    room.status = 'finished';
    room.ch.phase = 'vote';
    room.ch.item = null;
    room.ch.turnId = null;
    room.ch.turnEndsAt = 0;
    room.ch.result = { winnerId: other ? other.id : null, draw: false, forfeitBy: p.name };
    return;
  }
  removePlayer(room, p);
}

function act(room, p, msg) {
  switch (msg.t) {
    case 'raise': raise(room, p); break;
    case 'pass': pass(room, p, false); break;
    case 'vote': vote(room, p, String(msg.for || '')); break;
    case 'config': config(room, p, msg); break;
    default: break;
  }
}

module.exports = { init, publicTopics, parseConfig, setup, snapshot, start, rematch, leave, act };
