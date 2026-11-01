'use strict';
// Veni, Vidi, Vici: ekranlar. Çekirdek (app.js) window.WC üzerinden paylaşılır.
(function () {
  var WC = window.WC;
  var $ = WC.$, el = WC.el, avEl = WC.avEl;
  var COLORS = ['#E8344E', '#1F6FE0', '#2DB04B', '#FFB81C', '#9B3FD6', '#14B8A6'];
  var COLNAMES = ['Kırmızı', 'Mavi', 'Yeşil', 'Sarı', 'Mor', 'Turkuaz'];
  var LETTERS = ['A', 'B', 'C', 'D'];
  var NS = 'http://www.w3.org/2000/svg';

  /* ---------- harita verisi ---------- */
  var H = null;
  fetch('/harita.json').then(function (r) { return r.json(); }).then(function (j) {
    H = j;
    var s = WC.state();
    if (s && s.game === 'conquest') { mainMap = null; render(WC.state() && playerMe()); }
  }).catch(function () { /* yoksay */ });

  function svgEl(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }

  /* ---------- ayarlar ---------- */
  var createCfg = { max: 4, target: 12, level: 'mix' };
  try {
    var sv = JSON.parse(WC.store('get', 'wordchain:cqcfg') || 'null');
    if (sv) {
      if (sv.max >= 2 && sv.max <= 6) createCfg.max = sv.max;
      if ([10, 12, 15].indexOf(sv.target) >= 0) createCfg.target = sv.target;
      if (['easy', 'mix', 'hard'].indexOf(sv.level) >= 0) createCfg.level = sv.level;
    }
  } catch (e) { /* yoksay */ }

  function chipField(title, hint, opts, cur, onPick) {
    var f = el('fieldset', 'field');
    f.appendChild(el('legend', null, title));
    var chips = el('div', 'chips c3');
    opts.forEach(function (o) {
      var b = el('button', null, o[1]);
      b.type = 'button';
      b.setAttribute('aria-pressed', cur === o[0] ? 'true' : 'false');
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(chips.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        onPick(o[0]);
      });
      chips.appendChild(b);
    });
    f.appendChild(chips);
    if (hint) f.appendChild(el('p', 'hint', hint));
    return f;
  }

  function renderCfg(box, cfg, onChange, withMax) {
    box.replaceChildren();
    if (withMax) {
      var f0 = el('div', 'field');
      f0.appendChild(el('label', null, 'Kaç kişi oynayacak?'));
      var st = el('div', 'stepper');
      var minus = el('button', null, '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Azalt');
      var plus = el('button', null, '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Artır');
      var out = el('output');
      var paint = function () { out.innerHTML = cfg.max + '<small>kişi</small>'; };
      minus.addEventListener('click', function () { cfg.max = Math.max(2, cfg.max - 1); paint(); if (onChange) onChange(cfg); });
      plus.addEventListener('click', function () { cfg.max = Math.min(6, cfg.max + 1); paint(); if (onChange) onChange(cfg); });
      paint();
      st.appendChild(minus); st.appendChild(out); st.appendChild(plus);
      f0.appendChild(st);
      box.appendChild(f0);
    }
    box.appendChild(chipField('Oyun ne kadar sürsün?', 'İlk ulaşan kazanır. Kısa oyun yaklaşık 5, uzun oyun yaklaşık 10 dakika.',
      [[10, '10 il'], [12, '12 il'], [15, '15 il']], cfg.target, function (v) { cfg.target = v; if (onChange) onChange(cfg); }));
    box.appendChild(chipField('Soru zorluğu', null,
      [['easy', 'Kolay'], ['mix', 'Karışık'], ['hard', 'Zor']], cfg.level, function (v) { cfg.level = v; if (onChange) onChange(cfg); }));
  }
  function persist(c) { WC.store('set', 'wordchain:cqcfg', JSON.stringify({ max: c.max, target: c.target, level: c.level })); }
  renderCfg($('cqCfgCreate'), createCfg, persist, true);

  $('cqForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameCq').value.trim();
    if (!name) { $('nameCq').focus(); return; }
    WC.connect({ t: 'create', game: 'conquest', name: name, avatar: WC.avatar(), max: createCfg.max, target: createCfg.target, level: createCfg.level });
  });

  var lobbyCfg = null;
  $('cfgBtn').addEventListener('click', function () {
    var s = WC.state();
    if (!s || s.game !== 'conquest') return;
    lobbyCfg = { target: s.settings.target, level: s.settings.level };
    renderCfg($('cfgBody'), lobbyCfg, null, false);
    $('cfgSave').dataset.game = 'conquest';
    $('cfgSheet').hidden = false;
  });
  $('cfgSave').addEventListener('click', function () {
    var s = WC.state();
    if (!s || s.game !== 'conquest' || !lobbyCfg) return;
    WC.send({ t: 'config', target: lobbyCfg.target, level: lobbyCfg.level });
    $('cfgSheet').hidden = true;
    WC.toast('Ayarlar güncellendi. Herkesin yeniden "Hazırım" demesi gerekiyor.');
  });

  /* ---------- yardımcılar ---------- */
  var seen;
  function reset() {
    seen = { key: '', flash: '', ansKey: '', myAns: -1, tick: 0, result: '', picked: '' };
    $('cqResult').hidden = true;
  }
  reset();

  function playerMe() {
    var s = WC.state(), me = WC.me();
    return s ? s.players.filter(function (p) { return p.id === me; })[0] : null;
  }
  function byId(s, id) { return s.players.filter(function (p) { return p.id === id; })[0]; }
  function nm(s, id) { var p = byId(s, id); return p ? (p.id === WC.me() ? 'Sen' : p.name) : '?'; }
  function ilName(i) { return H && H.il[i] ? H.il[i].ad : '#' + i; }
  function col(i) { return i >= 0 ? COLORS[i % COLORS.length] : '#E6DFF5'; }

  function myFrontier(s, myIdx) {
    var set = {};
    if (!H || myIdx < 0) return set;
    var own = s.cq.owner;
    for (var i = 0; i < own.length; i++) if (own[i] === myIdx) H.kom[i].forEach(function (y) { if (own[y] !== myIdx) set[y] = true; });
    return set;
  }

  /* ---------- harita ---------- */
  var mainMap = null;
  function buildMap(host, clickable) {
    host.replaceChildren();
    var svg = svgEl('svg', { viewBox: '0 0 ' + H.w + ' ' + H.h, preserveAspectRatio: 'xMidYMid meet', focusable: 'false' });
    var g = svgEl('g');
    var paths = [];
    H.il.forEach(function (il, i) {
      var p = svgEl('path', { d: il.d, class: 'il' });
      p.dataset.i = String(i);
      g.appendChild(p);
      paths.push(p);
    });
    svg.appendChild(g);
    var lg = svgEl('g');
    svg.appendChild(lg);
    host.appendChild(svg);
    var m = { svg: svg, paths: paths, labels: lg };
    if (clickable) svg.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.i !== undefined && onTapCity) onTapCity(parseInt(t.dataset.i, 10));
    });
    return m;
  }
  var onTapCity = null;

  function setView(m, box) {
    var aspect = 1.6;
    var x0, y0, w, h;
    if (!box) { w = H.w; h = w / aspect; x0 = 0; y0 = H.h / 2 - h / 2; }
    else {
      w = Math.max(box.maxx - box.minx + 110, 300);
      h = w / aspect;
      var hh = box.maxy - box.miny + 70;
      if (hh > h) { h = hh; w = h * aspect; }
      x0 = (box.minx + box.maxx) / 2 - w / 2; y0 = (box.miny + box.maxy) / 2 - h / 2;
      if (w > H.w) { w = H.w; h = w / aspect; }
      x0 = Math.max(-20, Math.min(H.w - w + 20, x0));
      y0 = Math.max(H.h / 2 - h / 2 - 40, Math.min(H.h / 2 + h / 2 - h + 40, y0));
    }
    m.svg.setAttribute('viewBox', x0.toFixed(1) + ' ' + y0.toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1));
    m.vbw = w;
  }

  function paintMap(m, owner, extra) {
    extra = extra || {};
    m.paths.forEach(function (p, i) {
      var o = owner[i];
      var cls = 'il' + (o >= 0 ? ' o' + (o % 6) : '');
      if (extra.fr && extra.fr[i]) cls += ' fr';
      if (extra.pk === i) cls += ' pk';
      if (extra.fl && extra.fl[i]) cls += ' fl';
      if (p.getAttribute('class') !== cls) p.setAttribute('class', cls);
    });
    m.labels.replaceChildren();
    if (extra.lbl) {
      var fs = (m.vbw || H.w) * 0.034;
      Object.keys(extra.lbl).forEach(function (k) {
        var il = H.il[k];
        var t = svgEl('text', { x: il.x, y: il.y, class: 'lbl', 'font-size': fs.toFixed(1) });
        t.textContent = il.ad;
        m.labels.appendChild(t);
      });
    }
  }

  var zoomed = true;
  $('cqZoom').addEventListener('click', function () { zoomed = !zoomed; if (WC.state()) render(playerMe()); });

  /* ---------- ana çizim ---------- */
  function render(meP) {
    var s = WC.state();
    if (!s || !s.cq) return;
    var cq = s.cq, me = WC.me();
    WC.show('cq');
    $('cqCode').textContent = s.code;

    if (cq.phase === 'countdown') {
      var f = document.createDocumentFragment();
      f.appendChild(el('span', null, 'Veni, Vidi, Vici'));
      WC.setCountdown(true, f);
    } else WC.setCountdown(false);

    var myIdx = -1;
    s.players.forEach(function (p, i) { if (p.id === me) myIdx = i; });

    paintScore(s, myIdx);
    $('cqRound').textContent = cq.round ? 'Tur ' + cq.round + (cq.steps > 1 && (cq.phase === 'ask' || cq.phase === 'reveal') ? ' · Soru ' + (cq.step + 1) + '/' + cq.steps : '') : '';

    if (H) paintMapAll(s, myIdx);
    paintPanel(s, myIdx);

    if (cq.phase === 'end') renderResult(s, myIdx); else { $('cqResult').hidden = true; seen.result = ''; }
  }

  function paintScore(s, myIdx) {
    var ul = $('cqScore');
    ul.replaceChildren();
    s.players.forEach(function (p, i) {
      var li = el('li', (p.id === WC.me() ? 'me ' : '') + (p.left || !p.connected ? 'off' : ''));
      li.style.setProperty('--pc', col(i));
      li.appendChild(avEl(p.avatar, 26));
      li.appendChild(el('span', 'dot'));
      li.appendChild(el('span', 'nm', p.id === WC.me() ? 'Sen' : p.name));
      var n = el('span', 'n', String(p.cities));
      n.appendChild(el('small', null, '/' + s.settings.target));
      li.appendChild(n);
      if (p.skip && s.cq.phase !== 'end') li.appendChild(el('span', 'sk', 'pas'));
      ul.appendChild(li);
    });
  }

  function paintMapAll(s, myIdx) {
    var cq = s.cq;
    if (!mainMap) { mainMap = buildMap($('cqMap'), true); }
    var fr = {};
    var picking = cq.phase === 'pick' && cq.me && myIdx >= 0 && !playerMe().left;
    var canPick = picking && !playerMe().skip;
    if (canPick) fr = myFrontier(s, myIdx);
    var flash = {};
    var lbl = {};
    var fkey = cq.round + ':' + cq.step + ':' + cq.phase;
    if (cq.phase === 'reveal') {
      (cq.changes || []).forEach(function (c) { flash[c.city] = true; lbl[c.city] = true; });
      cq.groups.forEach(function (g) { lbl[g.city] = true; });
    }
    if (cq.phase === 'ask') cq.groups.forEach(function (g) { lbl[g.city] = true; });
    var pk = cq.me && cq.me.pick >= 0 && cq.phase === 'pick' ? cq.me.pick : -1;
    if (pk >= 0) lbl[pk] = true;
    if (canPick) Object.keys(fr).forEach(function (k) { lbl[k] = true; });
    if (seen.flash === fkey) flash = {};
    else if (cq.phase === 'reveal') seen.flash = fkey;

    // görünüm: yakınlaştırma
    var box = null;
    if (zoomed && myIdx >= 0 && (cq.phase === 'pick' || cq.phase === 'ask' || cq.phase === 'reveal')) {
      var ids = [];
      cq.owner.forEach(function (o, i) { if (o === myIdx) ids.push(i); });
      if (cq.phase === 'pick') Object.keys(fr).forEach(function (k) { ids.push(+k); });
      cq.groups.forEach(function (g) { if (g.att.indexOf(WC.me()) >= 0 || g.def === WC.me()) ids.push(g.city); });
      if (ids.length) {
        box = { minx: 1e9, miny: 1e9, maxx: -1e9, maxy: -1e9 };
        ids.forEach(function (i) {
          var il = H.il[i];
          box.minx = Math.min(box.minx, il.x); box.maxx = Math.max(box.maxx, il.x);
          box.miny = Math.min(box.miny, il.y); box.maxy = Math.max(box.maxy, il.y);
        });
      }
    }
    setView(mainMap, box);
    $('cqZoom').textContent = box ? 'Tüm harita' : 'Bölgeme yakınlaş';
    $('cqZoom').hidden = myIdx < 0 || (cq.phase !== 'pick' && cq.phase !== 'ask' && cq.phase !== 'reveal');
    if (!box) lbl = (cq.phase === 'pick' && canPick) ? lbl : lbl;
    paintMap(mainMap, cq.owner, { fr: fr, pk: pk, fl: flash, lbl: box || cq.phase !== 'pick' ? lbl : {} });

    onTapCity = function (i) {
      if (!canPick || !fr[i]) return;
      doPick(i);
    };
  }

  function doPick(i) {
    WC.sfx('send');
    WC.send({ t: 'pick', city: i });
  }

  /* ---------- alt panel ---------- */
  function paintPanel(s, myIdx) {
    var cq = s.cq, panel = $('cqPanel'), me = WC.me();
    var meP = playerMe();
    panel.replaceChildren();
    seen.secEl = null; seen.secEnd = 0;

    function head(title, endsAt) {
      var h = el('div', 'cqhead');
      h.appendChild(el('b', null, title));
      if (endsAt) { var sec = el('span', 'sec', ''); h.appendChild(sec); seen.secEl = sec; seen.secEnd = endsAt; }
      panel.appendChild(h);
    }

    if (cq.phase === 'countdown' || cq.phase === 'lobby') {
      head('Hazırlanıyor…');
      panel.appendChild(el('p', 'sub', 'Başlangıç ilin haritada rengine boyandı. Önce komşu illerden birini seçeceksin.'));
      var mine = [];
      cq.owner.forEach(function (o, i) { if (o === myIdx) mine.push(ilName(i)); });
      if (mine.length) panel.appendChild(el('p', 'sub', 'Başlangıç ilin: ' + mine.join(', ') + ' (' + COLNAMES[myIdx] + ')'));
      return;
    }

    if (cq.phase === 'pick') {
      var np = s.players.filter(function (p) { return !p.left; }).length;
      var cnt = Object.keys(cq.picked).length;
      var fr = myFrontier(s, myIdx);
      var frIds = Object.keys(fr).map(Number);
      var skipped = cq.me && cq.me.skip;
      if (!meP || meP.left) { head('İzliyorsun', cq.pickEndsAt); panel.appendChild(el('p', 'sub', cnt + ' kişi il seçti.')); return; }
      if (skipped) { head('Bu tur pasın', cq.pickEndsAt); panel.appendChild(el('p', 'sub', 'Yanlış saldırının cezası: bu tur il seçemezsin. Diğerlerini izle.')); return; }
      if (!frIds.length) { head('Bu tur seçeneğin yok', cq.pickEndsAt); panel.appendChild(el('p', 'sub', 'Çevrende alınabilecek il kalmadı.')); return; }
      head('Hangi ili alacaksın?', cq.pickEndsAt);
      panel.appendChild(el('p', 'sub', 'Parlayan komşu illere haritadan dokun ya da aşağıdan seç. Süre bitmeden değiştirebilirsin.'));
      var list = el('div', 'frlist');
      frIds.sort(function (a, b) { return ilName(a).localeCompare(ilName(b), 'tr'); });
      frIds.forEach(function (i) {
        var o = cq.owner[i];
        var b = el('button', 'frbtn');
        b.type = 'button';
        b.style.setProperty('--pc', col(o));
        b.setAttribute('aria-pressed', cq.me.pick === i ? 'true' : 'false');
        var dot = el('span', 'dot'); if (o >= 0) dot.style.background = col(o);
        b.appendChild(dot);
        var tx = el('span');
        tx.appendChild(document.createTextNode(ilName(i)));
        tx.appendChild(el('small', null, o >= 0 ? s.players[o].name + ' (saldırı)' : 'boş il'));
        b.appendChild(tx);
        b.addEventListener('click', function () { doPick(i); });
        list.appendChild(b);
      });
      panel.appendChild(list);
      panel.appendChild(el('p', 'sub', cq.me.pick >= 0 ? 'Seçtin: ' + ilName(cq.me.pick) + ' · ' + cnt + '/' + np + ' kişi seçti' : cnt + '/' + np + ' kişi seçti'));
      if (cq.changes && cq.changes.length && seen.picked !== String(cq.round)) { seen.picked = String(cq.round); }
      return;
    }

    if (cq.phase === 'ask' || cq.phase === 'reveal') {
      var reveal = cq.phase === 'reveal';
      var mg = cq.groups.filter(function (g) { return g.att.indexOf(me) >= 0 || (g.def === me && !g.defAbsent); })[0];
      var show = mg || cq.groups[0];
      if (!show) { head('Sırada…'); return; }
      var key = cq.round + ':' + cq.step;
      if (seen.ansKey !== key) { seen.ansKey = key; seen.myAns = -1; seen.revKey = ''; }

      if (!reveal) head(mg ? 'Soruyu cevapla' : 'Başkaları yarışıyor', cq.endsAt);
      else head('Sonuç', cq.endsAt);

      panel.appendChild(duelLine(s, show));
      panel.appendChild(el('span', 'qcat', show.q.cat));
      panel.appendChild(el('p', 'qtext', show.q.t));
      var opts = el('div', 'opts');
      var myAnswered = !!(cq.me && cq.me.answered);
      var myRes = reveal && show.res && show.res.ans ? show.res.ans[me] : null;
      show.q.o.forEach(function (t, i) {
        var b = el('button', 'opt');
        b.type = 'button';
        b.appendChild(el('i', null, LETTERS[i]));
        b.appendChild(el('span', null, t));
        if (reveal) {
          b.disabled = true;
          if (i === show.correct) b.classList.add('ok');
          else if (myRes && myRes.i === i) b.classList.add('bad');
        } else {
          b.disabled = !mg || myAnswered || (meP && meP.left);
          if (seen.myAns === i || (myAnswered && seen.myAns === i)) b.classList.add('sel');
          b.addEventListener('click', function () {
            if (b.disabled) return;
            seen.myAns = i;
            WC.sfx('send');
            WC.send({ t: 'answer', i: i });
            Array.prototype.forEach.call(opts.children, function (x, k) { x.disabled = true; if (k === i) x.classList.add('sel'); });
          });
        }
        opts.appendChild(b);
      });
      panel.appendChild(opts);

      if (!reveal) {
        var answeredN = cq.groups.reduce(function (a, g) { return a; }, 0);
        var who = Object.keys(cq.answered).length;
        panel.appendChild(el('p', 'sub', mg ? (myAnswered ? 'Cevabın alındı. Diğerleri bekleniyor…' : 'Hızlı ve doğru cevaplayan kazanır.') : 'Sen bu soruda yoksun. Sıran gelince haber vereceğiz.'));
        if (who) panel.appendChild(el('p', 'sub', who + ' kişi cevapladı.'));
      } else {
        var rl = el('div', 'rvlist');
        cq.groups.forEach(function (g) { rl.appendChild(resultLine(s, g, me)); });
        panel.appendChild(rl);
        var rk = key;
        if (seen.revKey !== rk) {
          seen.revKey = rk;
          var iwon = (cq.changes || []).some(function (c) { return c.to === myIdx; });
          var ilost = (cq.changes || []).some(function (c) { return c.from === myIdx; });
          WC.sfx(iwon ? 'coin' : ilost ? 'buzz' : 'pop');
        }
      }
      var fb = el('button', 'qflag', 'Soru hatalı mı?');
      fb.type = 'button';
      fb.addEventListener('click', function () { WC.send({ t: 'flag', q: show.id }); WC.toast('Bildirimin için teşekkürler.'); fb.hidden = true; });
      panel.appendChild(fb);
      return;
    }

    head('Oyun bitti');
  }

  function duelLine(s, g) {
    var d = el('div', 'duel');
    g.att.forEach(function (id, k) {
      if (k) d.appendChild(el('span', 'vs', '&'.replace('&', 've')));
      var w = el('span', 'who');
      var p = byId(s, id);
      if (p) w.appendChild(avEl(p.avatar, 24));
      w.appendChild(document.createTextNode(nm(s, id)));
      d.appendChild(w);
    });
    d.appendChild(el('span', 'vs', g.kind === 'attack' ? '→ saldırıyor:' : '→ alıyor:'));
    d.appendChild(el('b', null, ilName(g.city)));
    if (g.kind === 'attack' && g.def) {
      var o = byId(s, g.def);
      d.appendChild(el('span', 'vs', g.defAbsent ? '(savunan yok)' : '(savunan: ' + (o ? (o.id === WC.me() ? 'sen' : o.name) : '?') + ')'));
    }
    return d;
  }

  function resultLine(s, g, me) {
    var r = g.res || { type: 'none', ans: {}, penalty: [] };
    var cls = 'rvline';
    var mark = '•', text;
    var winner = r.winnerId ? nm(s, r.winnerId) : '';
    if (r.type === 'captured') {
      text = ilName(g.city) + ': ' + (r.winnerId === me ? 'sen aldın' : winner + ' aldı');
      if (r.winnerId === me) { cls += ' win'; mark = '✓'; }
    } else if (r.type === 'held') {
      var d = byId(s, g.def);
      text = ilName(g.city) + ': ' + (g.def === me ? 'savundun' : (d ? d.name : '?') + ' savundu');
      if (g.def === me) { cls += ' win'; mark = '🛡'; }
    } else text = ilName(g.city) + ': kimse alamadı';
    var details = [];
    g.att.concat(g.def && !g.defAbsent ? [g.def] : []).forEach(function (id) {
      var a = r.ans && r.ans[id];
      var t = nm(s, id) + (a ? (a.ok ? ' ✓' : ' ✗') + (a.ok ? ' ' + (a.ms / 1000).toFixed(1) + ' sn' : '') : ' —');
      details.push(t);
    });
    var pen = (r.penalty || []).filter(function (id) { return id === me; }).length;
    if (r.penalty && r.penalty.length) {
      details.push('Yanlış saldırı: ' + r.penalty.map(function (id) { return nm(s, id); }).join(', ') + ' bir tur pas');
      if (pen) { cls += ' pen'; mark = '⏸'; }
    }
    var box = el('div', cls);
    box.appendChild(el('span', 'mark', mark));
    var tx = el('span');
    tx.appendChild(el('b', null, text));
    tx.appendChild(document.createElement('br'));
    tx.appendChild(document.createTextNode(details.join(' · ')));
    box.appendChild(tx);
    return box;
  }

  /* ---------- süre sayacı ---------- */
  function tick(now) {
    if (seen && seen.secEl && seen.secEnd) {
      var rem = Math.max(0, seen.secEnd - now);
      var sec = Math.ceil(rem / 1000);
      if (seen.secEl.textContent !== String(sec)) seen.secEl.textContent = String(sec);
      var s = WC.state();
      if (s && s.cq && s.cq.phase === 'ask' && rem > 0 && rem <= 5000 && s.cq.me && s.cq.me.gid !== null && !s.cq.me.answered) {
        if (sec !== seen.tick) { seen.tick = sec; WC.sfx('tick'); }
      } else seen.tick = 0;
    }
  }

  /* ---------- sonuç ---------- */
  var resMap = null;
  function renderResult(s, myIdx) {
    var cq = s.cq, res = cq.result, me = WC.me();
    var box = $('cqResult');
    var wasHidden = box.hidden;
    box.hidden = false;
    var winners = res ? res.winnerIds : [];
    var iWon = winners.indexOf(me) >= 0;
    var title, sub;
    if (res && res.forfeitBy) { title = iWon ? 'Rakipler ayrıldı, kazandın!' : 'Oyun bitti'; sub = 'Kazanan: ' + (winners[0] ? nm(s, winners[0]) : ''); }
    else if (res && res.draw) { title = 'Berabere!'; sub = winners.map(function (id) { return nm(s, id); }).join(' ve ') + ' aynı anda hedefe ulaştı.'; }
    else if (winners.length) { title = iWon ? 'Kazandın! Veni, Vidi, Vici!' : nm(s, winners[0]) + ' kazandı!'; sub = (s.settings.target) + ' ile ilk ulaşan.'; }
    else { title = 'Oyun bitti'; sub = ''; }
    $('cqrTitle').textContent = title;
    $('cqrSub').textContent = sub;
    if (H) {
      if (!resMap || !$('cqrMap').firstChild) resMap = buildMap($('cqrMap'), false);
      setView(resMap, null);
      paintMap(resMap, cq.owner, {});
    }
    var ol = $('cqrRank');
    ol.replaceChildren();
    var order = s.players.map(function (p, i) { return { p: p, i: i, n: res && res.counts ? (res.counts[p.id] || 0) : p.cities }; });
    order.sort(function (a, b) { return b.n - a.n; });
    order.forEach(function (o) {
      var li = el('li');
      li.appendChild(avEl(o.p.avatar, 34));
      var d = el('span', 'dot'); d.style.background = col(o.i); li.appendChild(d);
      li.appendChild(el('span', 'nm', o.p.id === me ? o.p.name + ' (sen)' : o.p.name));
      li.appendChild(el('b', 'sc', o.n + ' il'));
      if (winners.indexOf(o.p.id) >= 0) li.appendChild(el('span', null, ' 🏆'));
      ol.appendChild(li);
    });
    var host = s.hostId === me;
    $('cqrRematch').hidden = !host;
    $('cqrWait').hidden = host;
    var key = JSON.stringify(res);
    if (seen.result !== key) {
      seen.result = key;
      if (iWon) { WC.sfx('win'); WC.confetti(); } else if (res && res.draw) WC.sfx('ready'); else WC.sfx('finish');
    }
    if (wasHidden) box.scrollTop = 0;
  }
  $('cqrRematch').addEventListener('click', function () { WC.send({ t: 'rematch' }); });
  $('cqrLeave').addEventListener('click', function () { WC.leave(); });

  WC.conquest = { render: render, tick: tick, reset: reset };
})();
