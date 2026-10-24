(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var SCREENS = ['home', 'join', 'lobby', 'game'];
  var FOLD = { 'â': 'a', 'î': 'i', 'û': 'u' };
  var AV = ['alien', 'bear', 'cat-face', 'dog-face', 'dragon-face', 'fox', 'frog', 'ghost', 'hamster', 'hatching-chick', 'koala', 'lion', 'monkey-face', 'octopus', 'owl', 'panda', 'penguin', 'pig-face', 'rabbit-face', 'robot', 'tiger-face', 'turtle', 'unicorn', 'whale'];
  var COLORS = ['#E8344E', '#1F6FE0', '#F0A500', '#2DB04B', '#9B3FD6', '#E8590C', '#0FA3B1', '#D6336C'];
  var WORDMARK = 'WordChain';
  var AV_TR = { 'alien': 'Uzaylı', 'bear': 'Ayı', 'cat-face': 'Kedi', 'dog-face': 'Köpek', 'dragon-face': 'Ejderha', 'fox': 'Tilki', 'frog': 'Kurbağa', 'ghost': 'Hayalet', 'hamster': 'Hamster', 'hatching-chick': 'Civciv', 'koala': 'Koala', 'lion': 'Aslan', 'monkey-face': 'Maymun', 'octopus': 'Ahtapot', 'owl': 'Baykuş', 'panda': 'Panda', 'penguin': 'Penguen', 'pig-face': 'Domuz', 'rabbit-face': 'Tavşan', 'robot': 'Robot', 'tiger-face': 'Kaplan', 'turtle': 'Kaplumbağa', 'unicorn': 'Tekboynuz', 'whale': 'Balina' };
  var ICON_CHECK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg>';
  var ICON_CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18L1.5 7l6 4.5L12 4l4.5 7.5 6-4.5L21 18z"/></svg>';
  var ICON_PEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L18.8 8.95l-3.75-3.75L3 17.25zm17.7-10.2a1 1 0 0 0 0-1.4l-2.35-2.35a1 1 0 0 0-1.4 0l-1.85 1.85 3.75 3.75 1.85-1.85z"/></svg>';

  function up(s) { return s.toLocaleUpperCase('tr-TR'); }
  function fold(w) { return w.replace(/[âîû]/g, function (c) { return FOLD[c]; }); }
  function requiredIndex(w) { var i = w.length - 1; if (w.charAt(i) === 'ğ' && i > 0) i--; return i; }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function store(op, k, v) {
    try {
      if (op === 'get') return localStorage.getItem(k);
      if (op === 'set') localStorage.setItem(k, v);
      if (op === 'del') localStorage.removeItem(k);
    } catch (e) { /* özel pencere vb. */ }
    return null;
  }
  function avColor(id) { var i = AV.indexOf(id); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }
  function avEl(id, size) {
    var d = el('span', 'av');
    d.style.background = avColor(id);
    if (size) d.style.setProperty('--s', size + 'px');
    if (id) {
      var img = document.createElement('img');
      img.src = '/avatars/' + encodeURIComponent(id) + '.svg';
      img.alt = '';
      img.draggable = false;
      d.appendChild(img);
    }
    return d;
  }

  var ws = null, session = null, me = null, state = null;
  var offset = 0, retryTimer = null, current = '';
  var maxPick = 4, toastTimer = null, msgTimer = null;
  var myAvatar = store('get', 'wordchain:avatar');
  var seen = null, countdownOn = false, lastCdNum = 0, confettiRaf = 0;
  var sheetTarget = 'create';
  var roomFromUrl = (new URLSearchParams(location.search).get('oda') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  var WS_URL = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;

  function resetSeen() { seen = { init: false, lobby: {}, words: {}, outs: {}, lastKey: '', result: false }; }
  resetSeen();

  /* ---------- ortak görünüm ---------- */
  function show(name) {
    if (name === current) return;
    current = name;
    SCREENS.forEach(function (id) {
      var s = $(id);
      s.hidden = id !== name;
      if (id === name) { s.style.animation = 'none'; void s.offsetWidth; s.style.animation = ''; }
    });
    document.body.setAttribute('data-screen', name);
    document.body.classList.toggle('is-home', name === 'home');
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }
  function setDockMsg(msg, kind) {
    var m = $('dockMsg');
    m.textContent = msg || '';
    m.className = 'dockmsg' + (kind === 'repeat' ? ' repeat' : '');
    clearTimeout(msgTimer);
    if (msg) msgTimer = setTimeout(function () { m.textContent = ''; }, 4500);
  }
  function banner(on) { $('banner').hidden = !on; }
  function alertOut(text, avatar) {
    var box = $('alerts');
    var a = el('div', 'alert');
    a.appendChild(avEl(avatar, 34));
    a.appendChild(el('span', null, text));
    box.appendChild(a);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(function () {
      a.classList.add('leave');
      setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 320);
    }, 3600);
  }

  document.querySelectorAll('.wordmark').forEach(function (h) {
    WORDMARK.split('').forEach(function (ch, i) {
      var s = el('span', null, ch);
      s.setAttribute('aria-hidden', 'true');
      s.style.animationDelay = (i * 55) + 'ms';
      h.appendChild(s);
    });
  });

  /* ---------- avatar seçimi ---------- */
  function paintAvatarButtons() {
    ['avCreate', 'avJoin'].forEach(function (id) {
      var b = $(id);
      b.replaceChildren(avEl(myAvatar, 84));
      var pen = el('span', 'pen');
      pen.innerHTML = ICON_PEN;
      b.appendChild(pen);
    });
  }
  function chooseAvatar(id) {
    if (sheetTarget === 'lobby') {
      send({ t: 'avatar', id: id });
    } else {
      myAvatar = id;
      store('set', 'wordchain:avatar', id);
      paintAvatarButtons();
    }
    closeSheet();
  }
  function openSheet(target) {
    sheetTarget = target;
    var cur = target === 'lobby' && state ? (state.players.find(function (p) { return p.id === me; }) || {}).avatar : myAvatar;
    var grid = $('avGrid');
    grid.replaceChildren();
    AV.forEach(function (id) {
      var b = el('button');
      b.type = 'button';
      b.setAttribute('aria-label', AV_TR[id] || id);
      b.setAttribute('aria-pressed', id === cur ? 'true' : 'false');
      b.appendChild(avEl(id, 64));
      b.addEventListener('click', function () { chooseAvatar(id); });
      grid.appendChild(b);
    });
    sheetOpener = document.activeElement;
    $('sheet').hidden = false;
    var sel = grid.querySelector('[aria-pressed="true"]') || grid.firstChild;
    if (sel) sel.focus();
  }
  var sheetOpener = null;
  function closeSheet() {
    if ($('sheet').hidden) return;
    $('sheet').hidden = true;
    if (sheetOpener && sheetOpener.focus) { try { sheetOpener.focus(); } catch (e) { /* yoksay */ } }
    sheetOpener = null;
  }
  $('sheetClose').addEventListener('click', closeSheet);
  $('sheet').addEventListener('click', function (e) { if (e.target === $('sheet')) closeSheet(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
  $('avCreate').addEventListener('click', function () { openSheet('create'); });
  $('avJoin').addEventListener('click', function () { openSheet('join'); });

  fetch('/avatars.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
    if (Array.isArray(list) && list.length) {
      AV = list;
      if (AV.indexOf(myAvatar) < 0) myAvatar = AV[Math.floor(Math.random() * AV.length)];
      paintAvatarButtons();
    }
  }).catch(function () { /* hazır liste kullanılır */ });
  if (AV.indexOf(myAvatar) < 0) myAvatar = AV[Math.floor(Math.random() * AV.length)];
  paintAvatarButtons();

  /* ---------- bağlantı ---------- */
  function send(obj) {
    if (ws && ws.readyState === 1) { ws.send(JSON.stringify(obj)); return true; }
    return false;
  }
  function rejoinMsg() { return { t: 'join', code: session.code, token: session.token, name: session.name, avatar: myAvatar }; }
  var coldTries = 0;
  function connect(first) {
    clearTimeout(retryTimer);
    if (ws) { try { ws.onclose = null; ws.close(); } catch (e) { /* yoksay */ } }
    ws = new WebSocket(WS_URL);
    ws.onopen = function () { coldTries = 0; banner(false); if (first) send(first); };
    ws.onmessage = onMessage;
    ws.onclose = function () {
      if (session) {
        banner(true);
        retryTimer = setTimeout(function () { connect(rejoinMsg()); }, 1500);
      } else if (first && ++coldTries < 4) {
        toast('Sunucu uyanıyor, birkaç saniye bekle…');
        retryTimer = setTimeout(function () { connect(first); }, 4000);
      } else {
        coldTries = 0;
        toast('Sunucuya bağlanılamadı. İnternetini kontrol edip tekrar dene.');
      }
    };
    ws.onerror = function () {};
  }
  function dropSession(clearUrl) {
    if (session) store('del', 'wordchain:' + session.code);
    session = null; me = null; state = null; resetSeen();
    clearTimeout(retryTimer);
    banner(false);
    hideOverlays();
    if (ws) { try { ws.onclose = null; ws.close(); } catch (e) { /* yoksay */ } ws = null; }
    if (clearUrl) { roomFromUrl = ''; history.replaceState(null, '', location.pathname); }
    document.title = 'WordChain';
  }
  function hideOverlays() {
    $('countdown').hidden = true; countdownOn = false; lastCdNum = 0;
    $('result').hidden = true;
    stopConfetti();
  }

  function onMessage(ev) {
    var m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.t === 'joined') {
      me = m.you;
      session = { code: m.code, token: m.token, name: m.name };
      store('set', 'wordchain:' + m.code, JSON.stringify({ token: m.token, name: m.name }));
      store('set', 'wordchain:name', m.name);
      if (m.avatar) { myAvatar = m.avatar; store('set', 'wordchain:avatar', m.avatar); paintAvatarButtons(); }
      roomFromUrl = m.code;
      history.replaceState(null, '', '?oda=' + m.code);
    } else if (m.t === 'state') {
      state = m;
      offset = m.now - Date.now();
      render();
    } else if (m.t === 'reject') {
      setDockMsg(m.msg, m.kind);
      var row = $('dockRow');
      row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake');
      if (navigator.vibrate) { try { navigator.vibrate([40, 40, 40]); } catch (e) { /* yoksay */ } }
      $('wordInput').focus();
      $('wordInput').select();
    } else if (m.t === 'error') {
      if (m.code === 'no_room') {
        store('del', 'wordchain:' + roomFromUrl);
        dropSession(true);
        showEntry();
        toast('Bu oda artık yok. Sunucu yeniden başlamış olabilir, yeni bir oda kurabilirsiniz.');
      } else if (current === 'join') {
        $('joinMsg').textContent = m.msg;
      } else {
        toast(m.msg);
      }
    }
  }

  /* ---------- giriş ekranları ---------- */
  function showEntry() {
    if (roomFromUrl) {
      $('joinCode').textContent = roomFromUrl;
      $('joinMsg').textContent = '';
      $('nameJoin').value = store('get', 'wordchain:name') || '';
      show('join');
      var saved = store('get', 'wordchain:' + roomFromUrl);
      if (saved) {
        try {
          var s = JSON.parse(saved);
          if (s && s.token) {
            $('joinMsg').textContent = 'Odaya geri dönülüyor…';
            connect({ t: 'join', code: roomFromUrl, token: s.token, name: s.name, avatar: myAvatar });
          }
        } catch (e) { /* yoksay */ }
      }
    } else {
      $('nameCreate').value = store('get', 'wordchain:name') || '';
      show('home');
    }
  }

  $('maxSeg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-n]');
    if (!b) return;
    maxPick = parseInt(b.getAttribute('data-n'), 10);
    Array.prototype.forEach.call($('maxSeg').children, function (x) {
      x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
    });
  });

  var range = $('turnRange');
  function paintTurn() {
    var v = parseInt(range.value, 10);
    $('turnOut').innerHTML = v + '<small>sn</small>';
  }
  function stepTurn(d) {
    var v = parseInt(range.value, 10) + d;
    var min = parseInt(range.min, 10), max = parseInt(range.max, 10);
    range.value = Math.min(max, Math.max(min, v));
    paintTurn();
  }
  range.addEventListener('input', paintTurn);
  $('turnMinus').addEventListener('click', function () { stepTurn(-5); });
  $('turnPlus').addEventListener('click', function () { stepTurn(5); });
  paintTurn();

  $('createForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameCreate').value.trim();
    if (!name) { $('nameCreate').focus(); return; }
    connect({ t: 'create', name: name, max: maxPick, dict: $('dictCheck').checked, turn: parseInt(range.value, 10), avatar: myAvatar });
  });
  $('codeForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var c = $('codeInput').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (c.length < 5) { toast('Oda kodu 5 karakter olmalı.'); return; }
    roomFromUrl = c;
    history.replaceState(null, '', '?oda=' + c);
    showEntry();
  });
  $('joinForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('nameJoin').value.trim();
    if (!name) { $('nameJoin').focus(); return; }
    $('joinMsg').textContent = '';
    var msg = { t: 'join', code: roomFromUrl, name: name, avatar: myAvatar };
    var saved = store('get', 'wordchain:' + roomFromUrl);
    if (saved) { try { msg.token = JSON.parse(saved).token; } catch (err) { /* yoksay */ } }
    connect(msg);
  });

  /* ---------- salon ---------- */
  function renderLobby(meP) {
    hideOverlays();
    show('lobby');
    var isHost = state.hostId === me;
    $('lbCode').textContent = state.code;
    var set = $('lbSet');
    set.replaceChildren();
    [state.max + ' kişilik', Math.round(state.turnMs / 1000) + ' saniye', state.dict ? 'Sözlük açık' : 'Sözlük kapalı'].forEach(function (t) {
      set.appendChild(el('span', null, t));
    });
    $('lbCount').textContent = state.players.length + ' / ' + state.max + ' kişi odada';
    var link = location.origin + location.pathname + '?oda=' + state.code;
    if ($('inviteLink').value !== link) $('inviteLink').value = link;
    $('shareBtn').hidden = !navigator.share;

    var list = $('lbPlayers');
    list.replaceChildren();
    state.players.forEach(function (p) {
      var li = el('li', seen.lobby[p.id] ? '' : 'enter');
      var isMe = p.id === me;
      if (isMe) {
        var b = el('button', 'me-av');
        b.type = 'button';
        b.setAttribute('aria-label', 'Avatarını değiştir');
        b.appendChild(avEl(p.avatar, 50));
        var pen = el('span', 'pen'); pen.innerHTML = ICON_PEN; b.appendChild(pen);
        b.addEventListener('click', function () { openSheet('lobby'); });
        li.appendChild(b);
      } else {
        li.appendChild(avEl(p.avatar, 50));
      }
      var who = el('span', 'who');
      who.appendChild(el('span', 'nm', p.name));
      var sfx = isMe ? ' · sen' : '';
      var st = !p.connected ? el('span', 'st off', 'bağlantı yok' + sfx)
        : p.id === state.hostId ? el('span', 'st', 'kurucu' + sfx)
        : p.ready ? el('span', 'st ok', 'hazır' + sfx) : el('span', 'st', 'bekliyor' + sfx);
      who.appendChild(st);
      li.appendChild(who);
      if (p.id === state.hostId) {
        var cr = el('span', 'crown'); cr.innerHTML = ICON_CROWN; li.appendChild(cr);
      } else if (p.ready) {
        var tk = el('span', 'tick'); tk.innerHTML = ICON_CHECK; li.appendChild(tk);
      }
      list.appendChild(li);
      seen.lobby[p.id] = true;
    });
    for (var i = state.players.length; i < state.max; i++) list.appendChild(el('li', 'empty', 'Bekleniyor…'));

    var readyBtn = $('readyBtn'), startBtn = $('startBtn'), hint = $('startHint');
    if (isHost) {
      readyBtn.hidden = true;
      startBtn.hidden = false;
      var others = state.players.filter(function (p) { return p.id !== state.hostId; });
      var allReady = others.every(function (p) { return p.ready; });
      var allOn = state.players.every(function (p) { return p.connected; });
      var ok = state.players.length >= 2 && allReady && allOn;
      startBtn.disabled = !ok;
      hint.textContent = state.players.length < 2 ? 'Başlamak için en az bir arkadaşın katılmalı.'
        : !allReady ? 'Herkes "Hazırım" deyince başlatabilirsin.'
        : !allOn ? 'Bağlantısı kopan biri var, biraz bekle.'
        : 'Herkes hazır. Başlatabilirsin.';
    } else {
      startBtn.hidden = true;
      readyBtn.hidden = false;
      readyBtn.textContent = meP.ready ? 'Hazır değilim' : 'Hazırım';
      readyBtn.className = 'btn ' + (meP.ready ? 'amber' : 'green');
      hint.textContent = meP.ready ? 'Kurucunun maçı başlatması bekleniyor.' : 'Hazır olunca butona bas.';
    }
    document.title = 'WordChain';
  }

  $('copyBtn').addEventListener('click', function () {
    var inp = $('inviteLink');
    inp.select();
    var done = function () { toast('Link kopyalandı. Arkadaşlarına gönder.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(inp.value).then(done, function () { toast('Linki elle seçip kopyala.'); });
    } else {
      try { document.execCommand('copy'); done(); } catch (e) { toast('Linki elle seçip kopyala.'); }
    }
  });
  $('waBtn').addEventListener('click', function () {
    var u = $('inviteLink').value;
    window.open('https://wa.me/?text=' + encodeURIComponent('Kelime zincirine gel! ' + u), '_blank', 'noopener');
  });
  $('shareBtn').addEventListener('click', function () {
    if (navigator.share) {
      navigator.share({ title: 'WordChain', text: 'Kelime zincirine gel!', url: $('inviteLink').value }).catch(function () {});
    }
  });
  $('readyBtn').addEventListener('click', function () {
    var p = state && state.players.find(function (x) { return x.id === me; });
    send({ t: 'ready', value: !(p && p.ready) });
  });
  $('startBtn').addEventListener('click', function () { send({ t: 'start' }); });
  function leave() {
    send({ t: 'leave' });
    dropSession(true);
    showEntry();
  }
  $('leaveBtn').addEventListener('click', leave);
  $('leaveBtn2').addEventListener('click', leave);
  $('rematchBtn').addEventListener('click', function () { send({ t: 'rematch' }); });

  /* ---------- oyun ---------- */
  function tilesFor(box, word, fresh) {
    box.replaceChildren();
    var len = word.length;
    var ts = len <= 7 ? 52 : len <= 10 ? 44 : len <= 14 ? 34 : len <= 20 ? 26 : 20;
    box.style.setProperty('--ts', ts + 'px');
    box.className = 'tiles' + (fresh ? ' fresh' : '');
    var li = requiredIndex(word);
    for (var i = 0; i < len; i++) {
      var t = el('span', 'tile' + (i === li ? ' last' : ''), up(word.charAt(i)));
      t.style.setProperty('--i', i);
      box.appendChild(t);
    }
  }
  function wordMarked(word) {
    var frag = document.createDocumentFragment();
    var li = requiredIndex(word);
    for (var i = 0; i < word.length; i++) {
      if (i === li) frag.appendChild(el('mark', null, word.charAt(i)));
      else frag.appendChild(document.createTextNode(word.charAt(i)));
    }
    return frag;
  }
  function reasonText(f) {
    if (f.reason === 'timeout') return f.who + ' elendi: süresi doldu.';
    if (f.reason === 'left') return f.who + ' oyundan ayrıldı.';
    return f.who + ' elendi.';
  }
  function ord(n) { return n + '.'; }

  function renderGame(meP) {
    show('game');
    var now = Date.now() + offset;
    var playing = state.status === 'playing';
    var starting = playing && now < state.startAt;
    var myTurn = playing && state.turnId === me;
    var byId = {};
    state.players.forEach(function (p) { byId[p.id] = p; });

    $('gmCode').textContent = state.code;
    var aliveN = state.players.filter(function (p) { return p.alive; }).length;
    $('gmCount').textContent = aliveN + ' / ' + state.players.length + ' yarışta';

    var stops = $('stops');
    stops.replaceChildren();
    state.players.forEach(function (p) {
      var cls = 'stop' + (p.id === state.turnId && playing ? ' now' : '') + (p.alive ? '' : ' out') + (p.id === state.nextId && playing ? ' next' : '');
      var li = el('li', cls);
      li.appendChild(avEl(p.avatar, 46));
      li.appendChild(el('span', 'nm', p.id === me ? p.name + ' (sen)' : p.name));
      var tag = !p.alive ? 'elendi' : p.id === state.turnId && playing ? 'oynuyor' : p.id === state.nextId && playing ? 'sıradaki' : '';
      li.appendChild(el('span', 'tag', tag));
      stops.appendChild(li);
    });

    var tr = $('turnrow');
    tr.className = 'turnrow' + (myTurn && !starting ? ' mine' : '');
    if (playing) {
      var cur = byId[state.turnId], nxt = byId[state.nextId];
      $('turnBig').textContent = myTurn ? 'Sıra sende!' : 'Oynuyor: ' + (cur ? cur.name : '');
      $('turnThen').textContent = nxt ? 'Sıradaki: ' + (nxt.id === me ? 'sen' : nxt.name) : '';
    } else {
      $('turnBig').textContent = 'Oyun bitti';
      $('turnThen').textContent = '';
    }
    $('ring').hidden = !playing;

    /* önceki kelime */
    var lw = $('lastWord'), last = state.last;
    var key = last ? last.word + '|' + last.by : '';
    var by = $('lastBy'), nl = $('needLine');
    by.replaceChildren(); nl.replaceChildren();
    if (last) {
      if (key !== seen.lastKey) { tilesFor(lw, last.word, seen.init); }
      by.appendChild(avEl(last.avatar, 28));
      by.appendChild(el('span', null, 'yazan: ' + last.by));
      var idx = requiredIndex(last.word);
      nl.appendChild(el('span', null, 'Yeni kelime'));
      var tile = el('span', 'tile last', up(fold(last.word.charAt(idx))));
      nl.appendChild(tile);
      nl.appendChild(el('span', null, 'ile başlamalı'));
      $('needSub').textContent = last.word.charAt(last.word.length - 1) === 'ğ' ? 'Kelime ğ ile bittiği için bir önceki harf geçerli.' : '';
    } else {
      lw.className = 'tiles none';
      lw.replaceChildren();
      lw.textContent = 'Henüz kelime yok';
      nl.appendChild(el('span', null, playing ? 'İlk kelimeyi istediğin gibi seç.' : ''));
      $('needSub').textContent = '';
    }
    seen.lastKey = key;

    /* akış */
    var feed = $('feed');
    feed.replaceChildren();
    state.feed.slice().reverse().slice(0, 40).forEach(function (f) {
      var li;
      if (f.k === 'word') {
        var k = f.by + '|' + f.word;
        li = el('li', seen.init && !seen.words[k] ? 'enter' : '');
        seen.words[k] = true;
        li.appendChild(avEl(f.avatar, 34));
        var wd = el('span', 'wd');
        wd.appendChild(wordMarked(f.word));
        li.appendChild(wd);
        li.appendChild(el('span', 'by', f.by));
      } else {
        var ok = f.who + '|' + f.place;
        li = el('li', 'o' + (seen.init && !seen.outs[ok] ? ' enter' : ''));
        if (seen.init && !seen.outs[ok]) alertOut(reasonText(f), f.avatar);
        seen.outs[ok] = true;
        li.appendChild(avEl(f.avatar, 34));
        li.appendChild(el('span', null, reasonText(f)));
      }
      feed.appendChild(li);
    });
    if (!seen.init) {
      state.feed.forEach(function (f) {
        if (f.k === 'word') seen.words[f.by + '|' + f.word] = true; else seen.outs[f.who + '|' + f.place] = true;
      });
    }

    /* yazma alanı */
    var form = $('wordForm'), input = $('wordInput'), btn = $('sendBtn'), badge = $('needBadge');
    form.hidden = !playing;
    var spectating = playing && !meP.alive;
    $('dockRow').hidden = spectating;
    $('watchBar').hidden = !spectating;
    if (spectating) {
      var wb = $('watchBar');
      wb.replaceChildren();
      wb.appendChild(avEl(meP.avatar, 48));
      var wt = el('span');
      wt.appendChild(el('b', null, 'Elendin, ' + ord(meP.place) + ' oldun'));
      wt.appendChild(el('small', null, 'Oyun bitene kadar akışı izleyebilirsin.'));
      wb.appendChild(wt);
    }
    if (playing && !spectating) {
      var canType = myTurn && !starting;
      var wasDisabled = input.disabled;
      input.disabled = !canType;
      btn.disabled = !canType;
      if (myTurn) {
        var letter = last ? up(fold(last.word.charAt(requiredIndex(last.word)))) : '•';
        badge.textContent = letter;
        badge.className = 'badge';
        input.placeholder = 'Kelimeni yaz';
      } else {
        badge.textContent = '•';
        badge.className = 'badge idle';
        input.value = '';
        var curP = byId[state.turnId];
        input.placeholder = 'Oynuyor: ' + (curP ? curP.name : '');
      }
      if (canType && (wasDisabled || seen.turnFor !== state.turnEndsAt)) {
        if (seen.turnFor !== state.turnEndsAt) {
          input.value = '';
          setDockMsg('');
          if (navigator.vibrate) { try { navigator.vibrate(90); } catch (e) { /* yoksay */ } }
        }
        setTimeout(function () { try { input.focus(); } catch (e) { /* yoksay */ } }, 60);
      }
      if (canType) seen.turnFor = state.turnEndsAt;
    }

    /* geri sayım ve sonuç */
    if (starting) {
      var first = byId[state.turnId];
      var f = $('cdFirst');
      f.replaceChildren();
      if (first) { f.appendChild(avEl(first.avatar, 40)); f.appendChild(el('span', null, 'İlk oynayan: ' + (first.id === me ? 'sen' : first.name))); }
      $('countdown').hidden = false;
      countdownOn = true;
    } else {
      $('countdown').hidden = true;
      countdownOn = false;
    }
    if (state.status === 'finished') renderResult(); else { $('result').hidden = true; seen.result = false; stopConfetti(); }

    seen.init = true;
    document.title = myTurn && !starting ? '▶ Sıra sende · WordChain' : 'WordChain';
  }

  $('wordForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var w = $('wordInput').value.trim();
    if (!w || $('wordInput').disabled) return;
    setDockMsg('');
    send({ t: 'word', word: w });
  });

  /* ---------- sonuç ---------- */
  function renderResult() {
    var ranked = state.players.slice().sort(function (a, b) { return (a.place || 99) - (b.place || 99); });
    var w = ranked[0];
    var res = $('result');
    var wasHidden = res.hidden;
    res.hidden = false;
    $('resTitle').textContent = !w ? 'Berabere' : w.id === me ? 'Kazandın!' : w.name + ' kazandı!';
    $('resSub').textContent = state.wordCount + ' kelime yazıldı.';
    var host = state.hostId === me;
    $('rematchBtn').hidden = !host;
    $('rematchWait').hidden = host;
    if (seen.result) return;
    seen.result = true;

    var pod = $('podium');
    pod.replaceChildren();
    var order = [ranked[1], ranked[0], ranked[2]];
    var cls = ['second', 'first', 'third'];
    order.forEach(function (p, i) {
      if (!p) return;
      var col = el('div', 'pcol ' + cls[i]);
      var d = (cls[i] === 'first' ? 0.5 : cls[i] === 'second' ? 0.25 : 0) + 's';
      col.style.setProperty('--d', d);
      var a = avEl(p.avatar, cls[i] === 'first' ? 84 : 62);
      col.appendChild(a);
      col.appendChild(el('span', 'nm', p.id === me ? p.name + ' (sen)' : p.name));
      col.appendChild(el('div', 'bar', String(p.place)));
      pod.appendChild(col);
    });
    var rk = $('rank');
    rk.replaceChildren();
    ranked.slice(3).forEach(function (p) {
      var li = el('li');
      li.appendChild(avEl(p.avatar, 38));
      li.appendChild(el('span', 'nm', p.id === me ? p.name + ' (sen)' : p.name));
      li.appendChild(el('span', 'pl', ord(p.place)));
      rk.appendChild(li);
    });
    if (wasHidden) res.scrollTop = 0;
    startConfetti();
  }

  /* ---------- konfeti ---------- */
  function stopConfetti() {
    cancelAnimationFrame(confettiRaf);
    var c = $('confetti');
    c.hidden = true;
  }
  function startConfetti() {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = $('confetti');
    c.hidden = false;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = c.width = window.innerWidth * dpr, H = c.height = window.innerHeight * dpr;
    var ctx = c.getContext('2d');
    var cols = ['#E8344E', '#1F6FE0', '#FFB81C', '#2DB04B', '#fff', '#9B3FD6'];
    var parts = [];
    for (var i = 0; i < 130; i++) {
      parts.push({
        x: Math.random() * W, y: -Math.random() * H * 0.6,
        w: (6 + Math.random() * 8) * dpr, h: (10 + Math.random() * 10) * dpr,
        vx: (Math.random() - .5) * 3 * dpr, vy: (2 + Math.random() * 4) * dpr,
        r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[i % cols.length]
      });
    }
    var t0 = performance.now();
    cancelAnimationFrame(confettiRaf);
    (function frame(t) {
      var el2 = t - t0;
      ctx.clearRect(0, 0, W, H);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.02 * dpr;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (el2 < 5000) confettiRaf = requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); c.hidden = true; }
    })(t0);
  }

  function render() {
    if (!state) return;
    var meP = state.players.find(function (p) { return p.id === me; });
    if (!meP) {
      dropSession(true);
      showEntry();
      toast('Odadan çıkarıldın.');
      return;
    }
    if (state.status === 'lobby') { resetGameSeen(); renderLobby(meP); }
    else renderGame(meP);
  }
  function resetGameSeen() { seen.init = false; seen.words = {}; seen.outs = {}; seen.lastKey = ''; seen.result = false; seen.turnFor = 0; }

  /* ---------- süre halkası ve geri sayım ---------- */
  var CIRC = 2 * Math.PI * 36;
  setInterval(function () {
    if (!state || state.status !== 'playing') return;
    var now = Date.now() + offset;
    var toStart = state.startAt - now;
    if (toStart > 0) {
      var n = Math.ceil(toStart / 1000);
      if (n !== lastCdNum) {
        lastCdNum = n;
        var cn = $('cdNum');
        cn.textContent = String(n);
        cn.style.animation = 'none'; void cn.offsetWidth; cn.style.animation = '';
      }
    } else if (countdownOn) {
      countdownOn = false;
      $('countdown').hidden = true;
      lastCdNum = 0;
      render();
    }
    var rem = Math.max(0, Math.min(state.turnMs, state.turnEndsAt - now));
    $('pr').style.strokeDashoffset = (CIRC * (1 - rem / state.turnMs)).toFixed(1);
    $('num').textContent = String(Math.ceil(rem / 1000));
    $('ring').classList.toggle('low', rem <= 10000);
  }, 100);

  /* ---------- ekran okuyucu duyurusu ---------- */
  var lastLive = '';
  function announce(msg) {
    if (msg === lastLive) return;
    lastLive = msg;
    $('live').textContent = msg;
  }
  var turnObs = new MutationObserver(function () { announce($('turnBig').textContent); });
  turnObs.observe($('turnBig'), { childList: true, characterData: true, subtree: true });

  /* ---------- sekme tekrar açılınca bağlantıyı kontrol et ---------- */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !session) return;
    if (!ws || ws.readyState > 1) connect(rejoinMsg());
  });
  window.addEventListener('online', function () {
    if (session && (!ws || ws.readyState > 1)) connect(rejoinMsg());
  });

  /* ---------- uygulama olarak ekleme ---------- */
  var deferredPrompt = null;
  var ua = navigator.userAgent || '';
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var standalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

  function showInstall() {
    if (standalone) return;
    if (isIOS) { $('install').hidden = false; $('installIos').hidden = false; }
    if (isAndroid) {
      $('install').hidden = false;
      $('installAndroid').hidden = false;
      fetch('/app-info.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (info) {
        if (info && info.apk) { $('apkBtn').hidden = false; $('apkNote').hidden = false; }
        else if (!deferredPrompt) { $('install').hidden = true; }
      }).catch(function () { /* yoksay */ });
    }
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (isAndroid) { $('install').hidden = false; $('installAndroid').hidden = false; $('installBtn').hidden = false; }
  });
  $('installBtn').addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(function () { deferredPrompt = null; $('installBtn').hidden = true; });
  });
  window.addEventListener('appinstalled', function () { $('install').hidden = true; });
  showInstall();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { /* yoksay */ }); });
  }

  showEntry();
})();
