'use strict';
// 20 TL Challenge: ekranlar. Çekirdek (app.js) window.WC üzerinden paylaşılır.
(function () {
  var WC = window.WC;
  var $ = WC.$, el = WC.el, avEl = WC.avEl;

  var topics = [];
  fetch('/topics.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (l) { if (Array.isArray(l)) topics = l; }).catch(function () { /* yoksay */ });

  var createCfg = { topic: '', picks: 5, decide: 30 };
  try {
    var saved = JSON.parse(WC.store('get', 'wordchain:chcfg') || 'null');
    if (saved) {
      if (typeof saved.topic === 'string') createCfg.topic = saved.topic;
      if (saved.picks >= 3 && saved.picks <= 8) createCfg.picks = saved.picks;
      if ([15, 30, 60].indexOf(saved.decide) >= 0) createCfg.decide = saved.decide;
    }
  } catch (e) { /* yoksay */ }

  function topicLabel(id) {
    if (id === 'random') return { emoji: '🎲', title: 'Rastgele konu', desc: 'Oyun başlayınca konu sürpriz olarak seçilir.' };
    var t = topics.filter(function (x) { return x.id === id; })[0];
    return t ? { emoji: t.emoji, title: t.title, desc: t.desc } : null;
  }

  /* ---------- konu seçici ---------- */
  var topicPick = null, topicCurrent = '';
  function openTopics(current, onPick) {
    topicPick = onPick;
    topicCurrent = current;
    $('topicSearch').value = '';
    paintTopics(current, '');
    $('topicSheet').hidden = false;
    setTimeout(function () { try { $('topicSearch').blur(); } catch (e) { /* yoksay */ } }, 0);
  }
  function closeTopics() { $('topicSheet').hidden = true; topicPick = null; }
  function paintTopics(current, q) {
    var list = $('topicList');
    list.replaceChildren();
    var query = q.toLocaleLowerCase('tr-TR').trim();
    var rows = [{ id: 'random', emoji: '🎲', title: 'Rastgele konu', desc: 'Oyun başlayınca konu sürpriz olarak seçilir.' }].concat(topics);
    var shown = 0;
    rows.forEach(function (t) {
      if (query && t.title.toLocaleLowerCase('tr-TR').indexOf(query) < 0) return;
      shown++;
      var b = el('button', 'titem');
      b.type = 'button';
      b.setAttribute('aria-pressed', t.id === current ? 'true' : 'false');
      b.appendChild(el('span', 'te', t.emoji));
      var box = el('span');
      box.appendChild(el('b', null, t.title));
      box.appendChild(el('small', null, t.desc));
      b.appendChild(box);
      b.addEventListener('click', function () { var f = topicPick; closeTopics(); if (f) f(t.id); });
      list.appendChild(b);
    });
    if (!shown) list.appendChild(el('p', 'tempty', 'Bu aramayla eşleşen konu yok.'));
  }
  $('topicSearch').addEventListener('input', function () {
    paintTopics(topicCurrent, this.value);
  });
  $('topicClose').addEventListener('click', closeTopics);
  $('topicSheet').addEventListener('click', function (e) { if (e.target === $('topicSheet')) closeTopics(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('topicSheet').hidden) closeTopics(); });

  /* ---------- ayar denetimleri (oda kurarken ve lobide) ---------- */
  function renderCfg(box, cfg, onChange) {
    box.replaceChildren();

    var f1 = el('div', 'field');
    f1.appendChild(el('label', null, 'Konu'));
    var tb = el('button', 'topicbtn');
    tb.type = 'button';
    var lab = topicLabel(cfg.topic);
    tb.appendChild(el('span', 'te', lab ? lab.emoji : '❓'));
    var tx = el('span');
    tx.appendChild(el('b', null, lab ? lab.title : 'Konu seç'));
    tx.appendChild(el('small', null, lab ? 'Değiştirmek için dokun' : '55 konu arasından seç'));
    tb.appendChild(tx);
    tb.appendChild(el('span', 'go', '›'));
    tb.addEventListener('click', function () {
      openTopics(cfg.topic, function (id) { cfg.topic = id; renderCfg(box, cfg, onChange); if (onChange) onChange(cfg); });
    });
    f1.appendChild(tb);
    box.appendChild(f1);

    var f2 = el('div', 'field');
    f2.appendChild(el('label', null, 'Kaç ürün alınacak?'));
    var st = el('div', 'stepper');
    var minus = el('button', null, '−'); minus.type = 'button'; minus.setAttribute('aria-label', 'Azalt');
    var plus = el('button', null, '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Artır');
    var out = el('output');
    function paint() { out.innerHTML = cfg.picks + '<small>ürün</small>'; }
    minus.addEventListener('click', function () { cfg.picks = Math.max(3, cfg.picks - 1); paint(); if (onChange) onChange(cfg); });
    plus.addEventListener('click', function () { cfg.picks = Math.min(8, cfg.picks + 1); paint(); if (onChange) onChange(cfg); });
    paint();
    st.appendChild(minus); st.appendChild(out); st.appendChild(plus);
    f2.appendChild(st);
    f2.appendChild(el('p', 'hint', 'İkiniz de bu kadar ürün alınca oyun biter.'));
    box.appendChild(f2);

    var f3 = el('fieldset', 'field');
    f3.appendChild(el('legend', null, 'Karar süresi'));
    var chips = el('div', 'chips c3');
    [15, 30, 60].forEach(function (n) {
      var b = el('button', null, n + ' sn');
      b.type = 'button';
      b.setAttribute('aria-pressed', cfg.decide === n ? 'true' : 'false');
      b.addEventListener('click', function () {
        cfg.decide = n;
        Array.prototype.forEach.call(chips.children, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        if (onChange) onChange(cfg);
      });
      chips.appendChild(b);
    });
    f3.appendChild(chips);
    box.appendChild(f3);
  }

  function persist(cfg) { WC.store('set', 'wordchain:chcfg', JSON.stringify({ topic: cfg.topic, picks: cfg.picks, decide: cfg.decide })); }
  renderCfg($('chCfgCreate'), createCfg, persist);

  $('chForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameCh').value.trim();
    if (!name) { $('nameCh').focus(); return; }
    if (!createCfg.topic) { WC.toast('Önce bir konu seç.'); return; }
    WC.connect({ t: 'create', game: 'challenge', name: name, avatar: WC.avatar(), topic: createCfg.topic, picks: createCfg.picks, decide: createCfg.decide });
  });

  // lobide kurucunun ayarları değiştirmesi
  var lobbyCfg = null;
  $('cfgBtn').addEventListener('click', function () {
    var s = WC.state();
    if (!s || !s.settings) return;
    lobbyCfg = { topic: s.settings.randomTopic ? 'random' : (s.settings.topic ? s.settings.topic.id : ''), picks: s.settings.picks, decide: Math.round(s.settings.decideMs / 1000) };
    if ([15, 30, 60].indexOf(lobbyCfg.decide) < 0) lobbyCfg.decide = 30;
    renderCfg($('cfgBody'), lobbyCfg, null);
    $('cfgSheet').hidden = false;
  });
  $('cfgClose').addEventListener('click', function () { $('cfgSheet').hidden = true; });
  $('cfgSheet').addEventListener('click', function (e) { if (e.target === $('cfgSheet')) $('cfgSheet').hidden = true; });
  $('cfgSave').addEventListener('click', function () {
    if (!lobbyCfg || !lobbyCfg.topic) { WC.toast('Önce bir konu seç.'); return; }
    WC.send({ t: 'config', topic: lobbyCfg.topic, picks: lobbyCfg.picks, decide: lobbyCfg.decide });
    $('cfgSheet').hidden = true;
    WC.toast('Ayarlar güncellendi. Rakibin yeniden "Hazırım" demesi gerekiyor.');
  });

  /* ---------- oyun ---------- */
  var seen = {};
  function reset() { seen = { item: null, round: -1, bid: 0, turnKey: '', soldKey: '', owned: {}, result: '', tick: 0, splits: 0 }; $('cgResult').hidden = true; $('cgDock').hidden = true; }
  reset();

  function who(s, id) { return s.players.filter(function (p) { return p.id === id; })[0]; }
  function tl(n) { return n + ' TL'; }

  function paintBox(box, p, s, opts) {
    var me = WC.me();
    box.replaceChildren();
    box.className = 'pbox' + (opts.turn ? ' turn' : '') + (opts.win ? ' win' : '');
    var ph = el('div', 'ph');
    ph.appendChild(avEl(p.avatar, 40));
    var pn = el('div', 'pn', p.name);
    if (p.id === me) pn.appendChild(el('small', null, ' (sen)'));
    else if (!p.connected && !p.left) pn.appendChild(el('small', null, ' · bağlantı yok'));
    else if (p.left) pn.appendChild(el('small', null, ' · ayrıldı'));
    ph.appendChild(pn);
    box.appendChild(ph);
    var m = el('div', 'money', String(p.money));
    m.appendChild(el('small', null, 'TL'));
    box.appendChild(m);
    box.appendChild(el('div', 'cnt', p.items.length + ' / ' + s.settings.picks + ' ürün'));
    var ul = el('ul', 'owned');
    var base = s.settings.topic && s.settings.topic.base;
    if (base) ul.appendChild(el('li', 'base', base));
    var known = seen.owned[p.id] || 0;
    p.items.forEach(function (it, i) {
      ul.appendChild(el('li', opts.animate && i >= known ? 'new' : '', it));
    });
    if (opts.slots) for (var i = p.items.length; i < s.settings.picks; i++) ul.appendChild(el('li', 'slot', '·'));
    box.appendChild(ul);
    seen.owned[p.id] = p.items.length;
  }

  function render(meP) {
    var s = WC.state(), ch = s.ch, me = WC.me();
    var opp = s.players.filter(function (p) { return p.id !== me; })[0];
    WC.show('cg');
    $('cgCode').textContent = s.code;
    var topic = s.settings.topic;
    $('cgTopic').textContent = topic ? topic.emoji + ' ' + topic.title : '';

    if (ch.phase === 'countdown') {
      var f = document.createDocumentFragment();
      f.appendChild(el('span', null, topic ? topic.emoji + ' ' + topic.title : ''));
      WC.setCountdown(true, f);
      $('cgRound').textContent = '';
      $('cgItem').textContent = 'Hazırlanıyor…';
      $('cgItem').className = 'itemname wait';
      $('cgBidline').replaceChildren();
      $('cgStatus').textContent = '';
      $('cgBar').className = 'tbar off';
      $('cgDock').hidden = true;
      var bx = s.players.slice().sort(function (a) { return a.id === me ? -1 : 1; });
      paintBox($('cgP0'), bx[0], s, { slots: true });
      if (bx[1]) paintBox($('cgP1'), bx[1], s, { slots: true });
      return;
    }
    WC.setCountdown(false);

    $('cgRound').textContent = ch.round ? 'Ürün ' + Math.min(ch.round, ch.rounds) + ' / ' + ch.rounds : '';
    var item = $('cgItem');
    var bidline = $('cgBidline');
    var status = $('cgStatus');
    var myTurn = ch.phase === 'bid' && ch.turnId === me;

    if (ch.item) {
      var fresh = seen.item !== ch.item || seen.round !== ch.round;
      item.textContent = ch.item;
      item.className = 'itemname' + (fresh ? ' drop' : '');
      if (fresh) { WC.sfx('item'); seen.bid = 0; }
      seen.item = ch.item; seen.round = ch.round;
    } else {
      item.textContent = s.status === 'finished' ? 'Oyun bitti' : '…';
      item.className = 'itemname wait';
    }

    bidline.replaceChildren();
    if (ch.phase === 'bid') {
      var bidder = who(s, ch.bidderId);
      var pr = el('span', 'price' + (ch.bid !== seen.bid && seen.bid ? ' bump' : ''), tl(ch.bid));
      if (ch.bid !== seen.bid && seen.bid) WC.sfx('send');
      seen.bid = ch.bid;
      bidline.appendChild(pr);
      var w = el('span', 'who');
      if (bidder) { w.appendChild(avEl(bidder.avatar, 30)); w.appendChild(document.createTextNode(bidder.id === me ? 'Teklif sende' : bidder.name + ' teklif verdi')); }
      bidline.appendChild(w);
      var turnP = who(s, ch.turnId);
      status.className = 'cgstat' + (myTurn ? ' mine' : '');
      status.textContent = myTurn
        ? 'Sıra sende. Bırakırsan ürün ' + (bidder && bidder.id === me ? 'sana' : (bidder ? bidder.name + "'a" : '')) + ' ' + tl(ch.bid) + "'ye gider."
        : (turnP ? turnP.name + ' karar veriyor…' : '');
    } else if (ch.phase === 'sold' && ch.sold) {
      var buyer = who(s, ch.sold.toId);
      bidline.appendChild(el('span', 'stamp', 'SATILDI'));
      var w2 = el('span', 'who');
      if (buyer) { w2.appendChild(avEl(buyer.avatar, 30)); w2.appendChild(document.createTextNode((buyer.id === me ? 'Sen aldın' : buyer.name + ' aldı') + ' · ' + tl(ch.sold.price))); }
      bidline.appendChild(w2);
      status.className = 'cgstat';
      status.textContent = 'Sıradaki ürün geliyor…';
      var sk = ch.round + '|' + ch.sold.toId;
      if (seen.soldKey !== sk) { seen.soldKey = sk; WC.sfx(ch.sold.toId === me ? 'coin' : 'pop'); }
    } else {
      status.textContent = '';
    }

    // oyuncu kutuları: ben solda
    var ordered = s.players.slice().sort(function (a) { return a.id === me ? -1 : 1; });
    ordered.forEach(function (p, i) {
      paintBox($(i === 0 ? 'cgP0' : 'cgP1'), p, s, { turn: ch.phase === 'bid' && ch.turnId === p.id, slots: true, animate: true });
    });

    // alt düğmeler
    var dock = $('cgDock');
    dock.hidden = !(s.status === 'playing' && (ch.phase === 'bid' || ch.phase === 'sold'));
    var raiseTo = ch.bid + 1;
    var canRaise = myTurn && meP.items.length < s.settings.picks && meP.money >= raiseTo;
    $('cgRaise').disabled = !canRaise;
    $('cgPass').disabled = !myTurn;
    $('cgRaiseTo').textContent = ch.phase === 'bid' ? tl(raiseTo) + "'ye çıkar" : '';
    var bd = who(s, ch.bidderId);
    var passSub = $('cgPass').querySelector('small');
    if (passSub) passSub.remove();
    if (ch.phase === 'bid' && bd) $('cgPass').appendChild(el('small', null, bd.id === me ? 'Ürün sende kalır' : 'Ürün ' + bd.name + "'a gider"));

    var tk = ch.turnId + '|' + ch.turnEndsAt;
    if (myTurn && seen.turnKey !== tk) { WC.sfx('myturn'); if (navigator.vibrate) { try { navigator.vibrate(80); } catch (e) { /* yoksay */ } } }
    seen.turnKey = tk;
    document.title = myTurn ? '▶ Sıra sende · 20 TL Challenge' : '20 TL Challenge';

    if (s.status === 'finished') renderResult(s, meP, opp); else { $('cgResult').hidden = true; seen.result = ''; }
  }

  $('cgPass').addEventListener('click', function () { WC.send({ t: 'pass' }); });
  $('cgRaise').addEventListener('click', function () { WC.send({ t: 'raise' }); });

  function tick(now) {
    var s = WC.state(); if (!s || !s.ch) return;
    var ch = s.ch, bar = $('cgBar');
    if (ch.phase !== 'bid' || !ch.turnEndsAt) { bar.className = 'tbar off'; return; }
    var rem = Math.max(0, ch.turnEndsAt - now);
    var frac = Math.max(0, Math.min(1, rem / s.settings.decideMs));
    bar.className = 'tbar' + (rem <= 5000 ? ' low' : '');
    bar.firstChild.style.transform = 'scaleX(' + frac.toFixed(3) + ')';
    if (ch.turnId === WC.me() && rem > 0 && rem <= 5000) {
      var sec = Math.ceil(rem / 1000);
      if (sec !== seen.tick) { seen.tick = sec; WC.sfx('tick'); }
    } else seen.tick = 0;
  }

  /* ---------- sonuç ve oylama ---------- */
  function renderResult(s, meP, opp) {
    var ch = s.ch, me = WC.me(), res = ch.result;
    var box = $('cgResult');
    var wasHidden = box.hidden;
    box.hidden = false;
    $('cgDock').hidden = true;
    var title, sub;
    var winP = res && res.winnerId ? who(s, res.winnerId) : null;
    if (res && res.forfeitBy) { title = res.winnerId === me ? 'Rakibin oyundan ayrıldı' : 'Oyundan ayrıldın'; sub = 'Kazanan: ' + (winP ? (winP.id === me ? 'sen' : winP.name) : ''); }
    else if (res && res.draw) { title = 'Berabere!'; sub = 'İkiniz de aynı fikirdesiniz.'; }
    else if (res && winP) { title = winP.id === me ? 'Kazandın!' : winP.name + ' kazandı!'; sub = 'Oy birliğiyle.'; }
    else { title = 'Kim kazandı?'; sub = 'Listelere bakın, ikiniz de oy verin.'; }
    $('crTitle').textContent = title;
    $('crSub').textContent = sub;

    var lines = $('crLines');
    lines.replaceChildren();
    var ordered = s.players.slice().sort(function (a) { return a.id === me ? -1 : 1; });
    ordered.forEach(function (p) {
      var b = el('section');
      paintResultBox(b, p, s, !!(res && res.winnerId === p.id));
      lines.appendChild(b);
    });

    var vb = $('crVote');
    vb.replaceChildren();
    if (!res) {
      vb.appendChild(el('h3', null, 'Hangi liste daha iyi?'));
      var my = ch.voted[me] ? seen.myVote : null;
      if (!ch.voted[me]) seen.myVote = null;
      ordered.forEach(function (p) {
        var b = el('button', 'vbtn');
        b.type = 'button';
        b.appendChild(avEl(p.avatar, 34));
        b.appendChild(document.createTextNode(p.id === me ? 'Benim listem' : p.name + ' kazandı'));
        b.setAttribute('aria-pressed', my === p.id ? 'true' : 'false');
        b.addEventListener('click', function () { castVote(p.id); });
        vb.appendChild(b);
      });
      var d = el('button', 'vbtn', 'Berabere');
      d.type = 'button';
      d.setAttribute('aria-pressed', my === 'draw' ? 'true' : 'false');
      d.addEventListener('click', function () { castVote('draw'); });
      vb.appendChild(d);
      var note = el('p', 'vnote');
      if (ch.splits && !ch.voted[me] && !(opp && ch.voted[opp.id])) {
        note.className = 'vnote warn';
        var ls = ch.lastSplit || {};
        note.textContent = 'Oylar ayrıldı. Biraz tartışın, sonra tekrar oylayın.' + labelsOf(s, ls);
      } else if (ch.voted[me]) note.textContent = 'Oyun verildi. Rakibin oyu bekleniyor…';
      else if (opp && ch.voted[opp.id]) note.textContent = 'Rakibin oyunu verdi. Sıra sende.';
      else note.textContent = 'İkinizin oyu aynı olunca kazanan belli olur.';
      vb.appendChild(note);
    }
    if (ch.splits > seen.splits) { seen.splits = ch.splits; WC.sfx('buzz'); }

    var host = s.hostId === me;
    $('crRematch').hidden = !host;
    $('crWait').hidden = host;

    var key = res ? JSON.stringify(res) : 'none';
    if (res && seen.result !== key) {
      seen.result = key;
      if (res.winnerId === me) { WC.sfx('win'); WC.confetti(); }
      else if (res.draw) WC.sfx('ready');
      else WC.sfx('finish');
    }
    if (wasHidden) box.scrollTop = 0;
  }
  function labelsOf(s, votes) {
    var me = WC.me(), parts = [];
    s.players.forEach(function (p) {
      var v = votes[p.id];
      if (!v) return;
      var t = v === 'draw' ? 'berabere' : (v === me ? 'sen' : (who(s, v) || {}).name);
      parts.push((p.id === me ? 'Sen' : p.name) + ': ' + t);
    });
    return parts.length ? ' (' + parts.join(', ') + ')' : '';
  }
  function paintResultBox(box, p, s, win) {
    var saveOwned = seen.owned;
    seen.owned = {};
    paintBox(box, p, s, { win: win, slots: false });
    seen.owned = saveOwned;
    box.querySelector('.cnt').textContent = 'Kalan para: ' + p.money + ' TL';
    box.querySelector('.money').style.display = 'none';
  }
  function castVote(target) {
    seen.myVote = target;
    WC.sfx('ready');
    WC.send({ t: 'vote', for: target });
  }
  $('crRematch').addEventListener('click', function () { WC.send({ t: 'rematch' }); });
  $('crLeave').addEventListener('click', function () { WC.leave(); });

  WC.challenge = { render: render, tick: tick, reset: reset };
})();
