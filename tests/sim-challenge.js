process.env.SOLD_DELAY_MS = '0';
const ch = require('../challenge.js');
const STRATS = ['max', 'rand', 'pass', 'half', 'greedy'];
let free = 0, games = 0, incomplete = 0, stuck = 0, examples = [];
function runGame(picks, sa, sb, topic) {
  return new Promise((resolve) => {
    const mk = (id, strat) => ({ id, name: id, ws: {}, ready: true, strat });
    const A = mk('A', sa), B = mk('B', sb);
    const room = { code: 'X', players: [A, B], hostId: 'A', status: 'lobby', max: 2, timer: null };
    ch.init({ startDelay: 0, send() {}, fail() {}, broadcast: (r) => setImmediate(() => drive(r)) });
    ch.setup(room, { topic, picks, decideMs: 60000 });
    let done = false;
    const finish = (why) => { if (done) return; done = true; clearTimeout(room.timer); resolve({ room, why }); };
    function drive(r) {
      if (done) return;
      const s = r.ch;
      if (r.status === 'finished') return finish('ok');
      if (s.phase !== 'bid') return;
      const p = r.players.find((x) => x.id === s.turnId); if (!p) return;
      const roll = Math.random();
      const want = p.strat === 'max' ? 'raise' : p.strat === 'pass' ? 'pass' : p.strat === 'half' ? (roll < 0.5 ? 'raise' : 'pass') : p.strat === 'greedy' ? (s.bid < 12 ? 'raise' : 'pass') : (roll < 0.35 ? 'raise' : 'pass');
      ch.act(r, p, { t: want });
    }
    ch.start(room, A);
    setTimeout(() => finish('timeout'), 4000);
  });
}
(async () => {
  const topics = ['yemekler', 'filmler', 'sehirler'];
  for (let picks = 3; picks <= 8; picks++) for (const sa of STRATS) for (const sb of STRATS) for (let k = 0; k < 6; k++) {
    const { room, why } = await runGame(picks, sa, sb, topics[k % 3]);
    games++;
    if (why !== 'ok') { stuck++; continue; }
    const n = room.players.map((p) => p.items.length);
    if (room.ch.log.some((l) => l.price === 0)) free = (typeof free === 'number' ? free : 0) + 1; if (n.some((x) => x < picks)) { incomplete++; if (examples.length < 5) examples.push({ picks, sa, sb, items: n, money: room.players.map((p) => p.money), rounds: room.ch.idx + 1 }); }
  }
  console.log(JSON.stringify({ free, games, incomplete, stuck, examples }, null, 1));
  process.exit(0);
})();
