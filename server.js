'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const challenge = require('./challenge');

const PORT = Number(process.env.PORT) || 3000;
const MIN_TURN_S = Number(process.env.MIN_TURN_S) || 30; // testlerde küçültülebilir
const MAX_TURN_S = 180;
const DEFAULT_TURN_S = 45;
const START_DELAY_MS = process.env.START_DELAY_MS !== undefined ? Number(process.env.START_DELAY_MS) : 3500;
const MAX_ROOMS = 500;
const LOBBY_GRACE_MS = 20000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const INDEX_FILE = path.join(PUBLIC_DIR, 'index.html');
const AVATAR_DIR = path.join(PUBLIC_DIR, 'avatars');

const rooms = new Map();

// Sözlük (words.txt). Dosya yoksa sözlük kontrolü kapalı kalır.
const dictionary = require('./dictionary').load();
if (dictionary) console.log('Sözlük yüklendi: ' + dictionary.size + ' kök kelime');
else console.log('Uyarı: words.txt bulunamadı, sözlük kontrolü kullanılamaz.');

// Avatarlar public/avatars klasöründeki .svg dosyalarıdır.
let AVATARS = [];
try {
  AVATARS = fs.readdirSync(AVATAR_DIR).filter((f) => /^[a-z0-9-]+\.svg$/.test(f)).map((f) => f.slice(0, -4)).sort();
} catch (e) { /* klasör yoksa avatarsız çalışır */ }

/* ---------- küçük yardımcılar ---------- */

const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
const FOLD = { 'â': 'a', 'î': 'i', 'û': 'u' };
const WORD_RE = /^[abcçdefgğhıijklmnoöprsştuüvyzâîû]{2,30}$/;

function makeCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

function cleanName(s) {
  return String(s || '')
    .replace(/[\u0000-\u001f\u007f<>​-‏‪-‮⁦-⁩]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);
}

function sameName(a, b) {
  return a.toLocaleLowerCase('tr-TR') === b.toLocaleLowerCase('tr-TR');
}

function norm(s) {
  return String(s || '').trim().toLocaleLowerCase('tr-TR');
}

function fold(w) {
  return w.replace(/[âîû]/g, (c) => FOLD[c]);
}

// Son harf "ğ" ise bir önceki harf istenir (ğ ile başlayan kelime yok).
function requiredLetter(word) {
  const w = fold(word);
  let i = w.length - 1;
  if (w[i] === 'ğ' && i > 0) i--;
  return w[i];
}

function upper(s) {
  return s.toLocaleUpperCase('tr-TR');
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function fail(ws, code, msg, fatal) {
  send(ws, { t: 'error', code, msg, fatal: !!fatal });
}

function clampTurnSeconds(v) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return DEFAULT_TURN_S;
  return Math.min(MAX_TURN_S, Math.max(MIN_TURN_S, n));
}

// İstenen avatar geçerliyse onu, değilse odada kullanılmayan ilk avatarı verir.
function pickAvatar(room, wanted, selfId) {
  if (AVATARS.length === 0) return '';
  if (AVATARS.includes(wanted)) return wanted;
  const used = new Set(room.players.filter((p) => p.id !== selfId).map((p) => p.avatar));
  const free = AVATARS.filter((a) => !used.has(a));
  const pool = free.length ? free : AVATARS;
  return pool[crypto.randomInt(pool.length)];
}

/* ---------- oda ---------- */

function createRoom(max, useDict, turnSeconds) {
  const room = {
    code: makeCode(),
    max,
    dict: !!(useDict && dictionary),
    turnMs: turnSeconds * 1000,
    hostId: null,
    players: [],
    status: 'lobby',
    words: new Map(),
    feed: [],
    last: null,
    turnIdx: -1,
    turnNo: 0,
    turnEndsAt: 0,
    startAt: 0,
    timer: null,
    winnerId: null,
    created: Date.now(),
    touched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function addPlayer(room, name, avatar, ws) {
  const p = {
    id: crypto.randomBytes(4).toString('hex'),
    token: crypto.randomBytes(16).toString('hex'),
    name,
    avatar: '',
    ready: false,
    alive: true,
    place: null,
    ws,
    removeTimer: null,
  };
  p.avatar = pickAvatar(room, avatar, p.id);
  room.players.push(p);
  if (!room.hostId) room.hostId = p.id;
  return p;
}

function nextAliveIdx(room, from) {
  const n = room.players.length;
  for (let i = 1; i < n; i++) {
    const idx = (from + i) % n;
    if (room.players[idx].alive) return idx;
  }
  return -1;
}

function snapshot(room) {
  const cur = room.status === 'playing' ? room.players[room.turnIdx] : null;
  const nIdx = cur ? nextAliveIdx(room, room.turnIdx) : -1;
  const nxt = nIdx >= 0 ? room.players[nIdx] : null;
  return {
    t: 'state',
    code: room.code,
    max: room.max,
    dict: room.dict,
    status: room.status,
    hostId: room.hostId,
    now: Date.now(),
    turnMs: room.turnMs,
    startAt: room.startAt,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      ready: p.ready,
      alive: p.alive,
      place: p.place,
      connected: !!p.ws,
    })),
    turnId: cur ? cur.id : null,
    nextId: nxt ? nxt.id : null,
    turnEndsAt: room.status === 'playing' ? room.turnEndsAt : 0,
    last: room.last,
    feed: room.feed.slice(-60),
    winnerId: room.winnerId,
    wordCount: room.words.size,
  };
}

function broadcast(room) {
  room.touched = Date.now();
  const snap = room.game === 'challenge' ? challenge.snapshot(room) : snapshot(room);
  for (const p of room.players) send(p.ws, snap);
}

function startTurn(room) {
  clearTimeout(room.timer);
  room.turnNo++;
  // İlk turda geri sayım (3-2-1) bitene kadar süre başlamaz.
  const begin = Math.max(Date.now(), room.startAt || 0);
  room.turnEndsAt = begin + room.turnMs;
  const no = room.turnNo;
  room.timer = setTimeout(() => {
    if (room.status === 'playing' && room.turnNo === no) {
      knockOut(room, room.players[room.turnIdx], 'timeout');
    }
  }, room.turnEndsAt - Date.now() + 400);
}

function finish(room, winner) {
  clearTimeout(room.timer);
  room.status = 'finished';
  if (winner) winner.place = 1;
  room.winnerId = winner ? winner.id : null;
  room.turnEndsAt = 0;
  broadcast(room);
}

function knockOut(room, p, reason) {
  if (!p || !p.alive) return;
  // Elenen oyuncunun sırası: o an hayatta olanların sayısı (4 kişiden ilk eleneni 4.).
  p.place = room.players.filter((x) => x.alive).length;
  p.alive = false;
  room.feed.push({ k: 'out', who: p.name, avatar: p.avatar, reason, place: p.place });
  const alive = room.players.filter((x) => x.alive);
  if (alive.length <= 1) return finish(room, alive[0]);
  const wasCurrent = room.players[room.turnIdx] === p;
  if (wasCurrent) {
    room.turnIdx = nextAliveIdx(room, room.turnIdx);
    startTurn(room);
  }
  broadcast(room);
}

challenge.init({ broadcast, fail, send, startDelay: START_DELAY_MS });

function reject(p, msg, kind) {
  send(p.ws, { t: 'reject', msg, kind: kind || 'rule' });
}

function submitWord(room, p, raw) {
  if (room.status !== 'playing') return;
  if (room.players[room.turnIdx] !== p) return reject(p, 'Sıra sende değil.');
  if (Date.now() < room.startAt) return reject(p, 'Oyun birazdan başlıyor.');
  if (Date.now() > room.turnEndsAt + 400) return;

  const w = norm(raw);
  if (!WORD_RE.test(w)) {
    if (/[qwx]/.test(w)) return reject(p, 'Türkçe alfabede q, w ve x harfleri yok.');
    return reject(p, 'Sadece harf kullan, en az 2 harf yaz.');
  }
  if (room.last) {
    const need = requiredLetter(room.last.word);
    if (fold(w)[0] !== need) {
      return reject(p, 'Kelime ' + upper(need) + ' harfiyle başlamalı.');
    }
  }
  const key = fold(w);
  // Daha önce yazılmış kelime elemez: oyuncu uyarılır ve süresi bitene kadar yeniden dener.
  const prev = room.words.get(key);
  if (prev) {
    return reject(p, '"' + upper(w) + '" daha önce yazıldı (yazan: ' + prev.by + '). Başka bir kelime dene.', 'repeat');
  }
  if (room.dict && !dictionary.has(w)) {
    return reject(p, 'Bu kelime sözlükte bulunamadı. Çekimsiz, sözlükteki haliyle yaz (fiiller -mek/-mak ile biter).', 'dict');
  }

  room.words.set(key, { word: w, by: p.name });
  room.last = { word: w, by: p.name, avatar: p.avatar };
  room.feed.push({ k: 'word', word: w, by: p.name, avatar: p.avatar });
  room.turnIdx = nextAliveIdx(room, room.turnIdx);
  startTurn(room);
  broadcast(room);
}

function startGame(room, p) {
  if (room.status !== 'lobby' || p.id !== room.hostId) return;
  if (room.players.length < 2) return fail(p.ws, 'start', 'Başlamak için en az 2 kişi gerekli.');
  if (room.players.some((x) => x.id !== room.hostId && !x.ready)) {
    return fail(p.ws, 'start', 'Herkes hazır olunca başlatabilirsin.');
  }
  if (room.players.some((x) => !x.ws)) {
    return fail(p.ws, 'start', 'Bağlantısı kopan bir oyuncu var, biraz bekle.');
  }
  room.words.clear();
  room.feed = [];
  room.last = null;
  room.winnerId = null;
  for (const x of room.players) { x.alive = true; x.place = null; }
  room.status = 'playing';
  room.startAt = Date.now() + START_DELAY_MS;
  room.turnIdx = crypto.randomInt(room.players.length);
  startTurn(room);
  broadcast(room);
}

function rematch(room, p) {
  if (room.status !== 'finished' || p.id !== room.hostId) return;
  clearTimeout(room.timer);
  room.status = 'lobby';
  room.words.clear();
  room.feed = [];
  room.last = null;
  room.winnerId = null;
  room.turnIdx = -1;
  room.startAt = 0;
  for (const x of room.players) {
    x.alive = true;
    x.place = null;
    x.ready = false;
  }
  broadcast(room);
}

function removePlayer(room, p) {
  clearTimeout(p.removeTimer);
  const i = room.players.indexOf(p);
  if (i < 0) return;
  room.players.splice(i, 1);
  if (room.players.length === 0) {
    clearTimeout(room.timer);
    rooms.delete(room.code);
    return;
  }
  if (room.hostId === p.id) room.hostId = room.players[0].id;
  broadcast(room);
}

function leaveGame(room, p) {
  if (room.game === 'challenge') return challenge.leave(room, p, removePlayer);
  if (room.status === 'lobby') return removePlayer(room, p);
  if (!p.alive) return;
  if (room.status === 'playing') knockOut(room, p, 'left');
}

/* ---------- bağlantılar ---------- */

function attach(ws, room, p) {
  if (p.ws && p.ws !== ws) {
    p.ws.ctx = null;
    try { p.ws.close(); } catch (e) { /* yoksay */ }
  }
  clearTimeout(p.removeTimer);
  p.ws = ws;
  ws.ctx = { room, p };
  send(ws, { t: 'joined', game: room.game || 'kelime', you: p.id, token: p.token, code: room.code, name: p.name, avatar: p.avatar });
  broadcast(room);
}

function handleCreate(ws, msg) {
  if (ws.ctx) return;
  const name = cleanName(msg.name);
  if (!name) return fail(ws, 'name', 'Önce adını yaz.');
  if (rooms.size >= MAX_ROOMS) return fail(ws, 'busy', 'Şu an çok fazla oda var, biraz sonra dene.');
  if (msg.game === 'challenge') {
    const r = challenge.parseConfig(msg);
    if (r.error) return fail(ws, 'config', r.error);
    const room = createRoom(2, false, DEFAULT_TURN_S);
    challenge.setup(room, r.cfg);
    return attach(ws, room, addPlayer(room, name, String(msg.avatar || ''), null));
  }
  const max = Math.min(6, Math.max(2, parseInt(msg.max, 10) || 2));
  const room = createRoom(max, msg.dict !== false, clampTurnSeconds(msg.turn));
  const p = addPlayer(room, name, String(msg.avatar || ''), null);
  attach(ws, room, p);
}

function handleJoin(ws, msg) {
  if (ws.ctx) return;
  const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const room = rooms.get(code);
  if (!room) return fail(ws, 'no_room', 'Bu oda bulunamadı. Linki kontrol et.', true);

  if (msg.token) {
    const old = room.players.find((x) => x.token === String(msg.token));
    if (old) return attach(ws, room, old);
  }
  if (room.status !== 'lobby') return fail(ws, 'started', 'Oyun çoktan başladı, bu odaya artık girilemiyor.');
  if (room.players.length >= room.max) return fail(ws, 'full', 'Oda dolu.');
  const name = cleanName(msg.name);
  if (!name) return fail(ws, 'name', 'Önce adını yaz.');
  if (room.players.some((x) => sameName(x.name, name))) {
    return fail(ws, 'name', 'Bu isim odada alınmış, başka bir isim dene.');
  }
  attach(ws, room, addPlayer(room, name, String(msg.avatar || ''), null));
}

function handleMessage(ws, msg) {
  if (!msg || typeof msg.t !== 'string') return;
  if (msg.t === 'create') return handleCreate(ws, msg);
  if (msg.t === 'join') return handleJoin(ws, msg);
  const c = ws.ctx;
  if (!c) return;
  const { room, p } = c;
  switch (msg.t) {
    case 'ready':
      if (room.status === 'lobby' && p.id !== room.hostId) {
        p.ready = !!msg.value;
        broadcast(room);
      }
      break;
    case 'avatar':
      if (room.status === 'lobby' && AVATARS.includes(msg.id)) {
        p.avatar = msg.id;
        broadcast(room);
      }
      break;
    case 'start': if (room.game === 'challenge') challenge.start(room, p); else startGame(room, p); break;
    case 'word': submitWord(room, p, msg.word); break;
    case 'rematch': if (room.game === 'challenge') challenge.rematch(room, p); else rematch(room, p); break;
    case 'raise': case 'pass': case 'vote': case 'config':
      if (room.game === 'challenge') challenge.act(room, p, msg);
      break;
    case 'leave':
      ws.ctx = null;
      p.ws = null;
      leaveGame(room, p);
      if (rooms.has(room.code)) broadcast(room);
      try { ws.close(); } catch (e) { /* yoksay */ }
      break;
    default: break;
  }
}

/* ---------- http + websocket ---------- */

const web = require('./web').create({ publicDir: PUBLIC_DIR, rooms, avatars: AVATARS, topics: challenge.publicTopics });
const server = http.createServer(web);

const wss = new WebSocketServer({ server, maxPayload: 2048 });

wss.on('connection', (ws) => {
  ws.ctx = null;
  ws.isAlive = true;
  ws.winStart = Date.now();
  ws.cnt = 0;

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - ws.winStart > 5000) { ws.winStart = now; ws.cnt = 0; }
    if (++ws.cnt > 30) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    try { handleMessage(ws, msg); } catch (e) { console.error('hata:', e); }
  });

  ws.on('close', () => {
    const c = ws.ctx;
    if (!c) return;
    const { room, p } = c;
    if (p.ws !== ws) return;
    p.ws = null;
    if (room.status === 'lobby') {
      p.removeTimer = setTimeout(() => {
        if (!p.ws && room.status === 'lobby') removePlayer(room, p);
      }, LOBBY_GRACE_MS);
    }
    if (rooms.has(room.code)) broadcast(room);
  });
});

setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) { /* yoksay */ }
  }
}, 25000);

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const nobody = room.players.every((p) => !p.ws);
    if ((nobody && now - room.touched > 10 * 60 * 1000) || now - room.created > 8 * 60 * 60 * 1000) {
      clearTimeout(room.timer);
      for (const p of room.players) { clearTimeout(p.removeTimer); if (p.ws) p.ws.close(); }
      rooms.delete(code);
    }
  }
}, 60000);

server.listen(PORT, () => {
  console.log('WordChain hazır: http://localhost:' + PORT);
});

function shutdown() {
  console.log('Kapatılıyor…');
  for (const ws of wss.clients) { try { ws.close(1001, 'sunucu yeniden başlıyor'); } catch (e) { /* yoksay */ } }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
process.on('unhandledRejection', (e) => console.error('beklenmeyen hata:', e));
