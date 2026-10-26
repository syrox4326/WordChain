'use strict';
// Ses efektleri: hepsi tarayıcıda üretilir (ses dosyası yok), bu yüzden ek indirme ve lisans yoktur.
(function () {
  var ctx = null, master = null, muted = false, lastAt = {};
  try { muted = localStorage.getItem('wordchain:muted') === '1'; } catch (e) { /* yoksay */ }

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      var comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
    } catch (e) { ctx = null; }
    return ctx;
  }
  function unlock() {
    var c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }
  ['pointerdown', 'keydown', 'touchend'].forEach(function (ev) {
    window.addEventListener(ev, unlock, { passive: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (ctx && !document.hidden && ctx.state === 'suspended') ctx.resume();
  });

  // freq: Hz, at: saniye sonra, dur: süre, type: dalga, vol: 0-1, to: kayma hedefi (Hz)
  function tone(freq, at, dur, type, vol, to) {
    var t0 = ctx.currentTime + at;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }

  var N = { C4: 261.6, E4: 329.6, G4: 392, A4: 440, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5, E6: 1318.5 };

  var SOUNDS = {
    tap: function () { tone(520, 0, 0.05, 'sine', 0.07, 420); },
    join: function () { tone(N.E5, 0, 0.12, 'triangle', 0.16); tone(N.A5, 0.09, 0.18, 'triangle', 0.16); },
    leave: function () { tone(N.A4, 0, 0.12, 'triangle', 0.12); tone(N.E4, 0.09, 0.16, 'triangle', 0.12); },
    ready: function () { tone(N.C6, 0, 0.1, 'sine', 0.16); tone(N.E6, 0.07, 0.14, 'sine', 0.12); },
    beep: function () { tone(N.A4, 0, 0.16, 'square', 0.09); },
    go: function () { tone(N.A5, 0, 0.35, 'square', 0.09); tone(N.E6, 0, 0.35, 'triangle', 0.12); },
    myturn: function () { tone(N.G5, 0, 0.12, 'triangle', 0.2); tone(N.C6, 0.1, 0.22, 'triangle', 0.22); },
    send: function () { tone(520, 0, 0.12, 'triangle', 0.18, 980); },
    pop: function () { tone(440, 0, 0.09, 'sine', 0.11, 330); },
    buzz: function () { tone(170, 0, 0.22, 'sawtooth', 0.12, 120); tone(165, 0.0, 0.22, 'square', 0.05, 115); },
    tick: function () { tone(1250, 0, 0.035, 'square', 0.06); },
    out: function () { tone(N.G4, 0, 0.14, 'triangle', 0.16); tone(N.E4, 0.12, 0.14, 'triangle', 0.16); tone(N.C4, 0.24, 0.26, 'triangle', 0.16); },
    outMe: function () { tone(N.A4, 0, 0.18, 'sawtooth', 0.1, N.G4); tone(N.G4, 0.16, 0.2, 'sawtooth', 0.1, N.E4); tone(N.E4, 0.34, 0.45, 'sawtooth', 0.1, 150); },
    win: function () {
      [N.C5, N.E5, N.G5, N.C6].forEach(function (f, i) { tone(f, i * 0.11, 0.3, 'triangle', 0.2); });
      tone(N.G5, 0.5, 0.7, 'triangle', 0.15); tone(N.C6, 0.5, 0.7, 'triangle', 0.15); tone(N.E6, 0.5, 0.7, 'sine', 0.1);
    },
    coin: function () { tone(N.E6, 0, 0.09, 'square', 0.07); tone(1760, 0.07, 0.3, 'square', 0.07); tone(N.E6, 0.07, 0.3, 'triangle', 0.1); },
    item: function () { tone(300, 0, 0.14, 'triangle', 0.13, 700); tone(900, 0.1, 0.08, 'sine', 0.08); },
    finish: function () { tone(N.E5, 0, 0.2, 'triangle', 0.15); tone(N.C5, 0.18, 0.4, 'triangle', 0.15); },
  };
  // Aynı sesin üst üste çalmasını engelleyen en kısa aralık (ms)
  var GAP = { tap: 40, tick: 300, pop: 60, buzz: 150, item: 200, coin: 150 };

  window.Sfx = {
    play: function (name) {
      if (muted || !SOUNDS[name]) return;
      var c = ensure();
      if (!c) return;
      if (c.state === 'suspended') { c.resume(); }
      if (c.state !== 'running') return; // henüz dokunulmadıysa tarayıcı sesi açmaz
      var now = Date.now(), gap = GAP[name] || 0;
      if (gap && lastAt[name] && now - lastAt[name] < gap) return;
      lastAt[name] = now;
      try { SOUNDS[name](); } catch (e) { /* yoksay */ }
    },
    isMuted: function () { return muted; },
    setMuted: function (m) {
      muted = !!m;
      try { localStorage.setItem('wordchain:muted', muted ? '1' : '0'); } catch (e) { /* yoksay */ }
      if (!muted) { unlock(); setTimeout(function () { window.Sfx.play('ready'); }, 60); }
    },
  };
})();
