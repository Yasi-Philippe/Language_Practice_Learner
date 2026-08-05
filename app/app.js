(function () {
  'use strict';

  var STATE_KEY = 'lpl-state-v1';
  var THEME_KEY = 'lpl-theme';
  var CAP = 30000;                 // AFK cap: at most 30s counted per screen dwell
  var data = null, state = null;
  var view = 'home';               // 'home' | 'drill' | 'stats' | 'extra'
  var session = null, tick = null;
  var root = document.getElementById('app');

  var ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>',
    cycle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>'
  };

  /* ---------- persistence ---------- */
  function loadState() {
    var s; try { s = JSON.parse(localStorage.getItem(STATE_KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    if (!Array.isArray(s.completed)) s.completed = [];
    if (!s.fails || typeof s.fails !== 'object') s.fails = {};
    if (!s.recoveryMarks || typeof s.recoveryMarks !== 'object') s.recoveryMarks = {};
    if (typeof s.reviewsDone !== 'number') s.reviewsDone = 0;
    if (typeof s.reviews2Done !== 'number') s.reviews2Done = 0;
    if (!s.attempts || typeof s.attempts !== 'object') s.attempts = {};
    if (typeof s.totalMs !== 'number') s.totalMs = 0;
    if (!s.categoryMs || typeof s.categoryMs !== 'object') s.categoryMs = {};
    if (typeof s.reviewMs !== 'number') s.reviewMs = 0;
    if (!s.extra || typeof s.extra !== 'object') s.extra = {};
    if (!s.extraFails || typeof s.extraFails !== 'object') s.extraFails = {};
    if (!Array.isArray(s.personal)) s.personal = [];
    return s;
  }
  function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- timer (segment-based, AFK-capped) ---------- */
  function attributeTime(d) {
    if (!session) return;
    if (session.mode === 'review' || session.mode === 'review2') state.reviewMs += d;
    else if (session.mode === 'extra' && session.extra) state.categoryMs[session.extra.id] = (state.categoryMs[session.extra.id] || 0) + d;
    else if (session.cat) state.categoryMs[session.cat.id] = (state.categoryMs[session.cat.id] || 0) + d;
  }
  var timer = {
    start: 0,
    _d: function () { return this.start ? Math.min(Date.now() - this.start, CAP) : 0; },
    _flush: function () { if (this.start) { var d = this._d(); state.totalMs += d; attributeTime(d); } },
    mark: function () { this._flush(); this.start = Date.now(); saveState(); },   // close prev dwell (capped), start new
    stop: function () { this._flush(); this.start = 0; saveState(); },
    arm: function () { this.start = Date.now(); },
    liveMs: function () { return state.totalMs + this._d(); }
  };
  function fmtHours(ms) { return (ms / 3600000).toFixed(1) + ' h'; }
  function fmtDur(ms) {
    if (ms < 60000) return Math.max(1, Math.round(ms / 1000)) + 's';
    if (ms < 3600000) return Math.round(ms / 60000) + 'm';
    return (ms / 3600000).toFixed(1) + 'h';
  }

  /* ---------- helpers ---------- */
  function isDone(id) { return state.completed.indexOf(id) !== -1; }
  function currentIndex() { for (var i = 0; i < data.categories.length; i++) if (!isDone(data.categories[i].id)) return i; return -1; }
  function progressPct() { return Math.round(state.completed.length / data.categories.length * 100); }
  function levelInfo() {
    var achieved = null;
    for (var k = 0; k < data.levels.length; k++) {
      var lv = data.levels[k], cats = data.categories.filter(function (c) { return c.level === lv; });
      if (cats.length && cats.every(function (c) { return isDone(c.id); })) achieved = lv;
    }
    var ci = currentIndex();
    return { achieved: achieved, working: ci >= 0 ? data.categories[ci].level : data.levels[data.levels.length - 1], allDone: ci < 0 };
  }
  function shortName(title) { var p = title.split(' · '); return p.length > 1 ? p.slice(1).join(' · ') : title; }
  function hasFails() { for (var k in state.fails) if (state.fails[k] > 0) return true; return false; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function completedItems() {
    var out = [];
    for (var i = 0; i < data.categories.length; i++) { var c = data.categories[i]; if (isDone(c.id)) for (var j = 0; j < c.items.length; j++) out.push(c.items[j]); }
    return out;
  }
  function resolveGate() {
    var changed = false, due = Math.floor(state.completed.length / 3);
    while (state.reviewsDone < due && !hasFails()) { state.reviewsDone++; changed = true; }
    if (changed) saveState();
    if (state.reviewsDone < due) return { type: 'r1', m: state.reviewsDone + 1 };
    if (state.reviews2Done < due) return { type: 'r2', m: state.reviews2Done + 1 };
    return null;
  }

  /* ---------- checking ---------- */
  var ARTICLES = ['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas', 'lo'];
  function normalize(s) {
    s = (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    var p = s.split(' '); if (p.length > 1 && ARTICLES.indexOf(p[0]) !== -1) p.shift();
    return p.join(' ');
  }
  function lev(a, b) {
    var m = a.length, n = b.length, i, j; if (!m) return n; if (!n) return m;
    var d = []; for (j = 0; j <= n; j++) d[j] = j;
    for (i = 1; i <= m; i++) { var prev = d[0]; d[0] = i; for (j = 1; j <= n; j++) { var tmp = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)); prev = tmp; } }
    return d[n];
  }
  function isCorrect(input, accepted) {           // forgiving: Spanish answers
    var ni = normalize(input); if (!ni) return false;
    for (var i = 0; i < accepted.length; i++) { var na = normalize(accepted[i]); if (ni === na) return true; if (na.length >= 5 && lev(ni, na) <= 1) return true; }
    return false;
  }
  function normalizeSpelling(s) { return (s || '').trim().toLowerCase(); }   // ignore case only
  function isStrictMatch(input, accepted) {        // Italian: case only, accents & rest exact
    var ni = normalizeSpelling(input); if (!ni) return false;
    for (var i = 0; i < accepted.length; i++) if (ni === normalizeSpelling(accepted[i])) return true;
    return false;
  }

  /* ---------- extra categories ---------- */
  function italianNumber(n) {
    var ones = ['zero', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
    var teens = ['dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
    var tens = { 2: 'venti', 3: 'trenta', 4: 'quaranta', 5: 'cinquanta', 6: 'sessanta', 7: 'settanta', 8: 'ottanta', 9: 'novanta' };
    if (n === 100) return ['cento'];
    if (n < 10) return [ones[n]];
    if (n < 20) return [teens[n - 10]];
    var t = Math.floor(n / 10), u = n % 10, base = tens[t];
    if (u === 0) return [base];
    var b = (u === 1 || u === 8) ? base.slice(0, -1) : base;
    if (u === 3) return [b + 'tré', b + 'tre'];        // accented primary, plain accepted too
    return [b + ones[u]];
  }
  function buildNumbers() {
    var items = [];
    for (var n = 0; n <= 100; n++) { var f = italianNumber(n); items.push({ id: 'num-' + n, prompt: String(n), accepted: f, it: f[0], note: '' }); }
    return items;
  }
  function buildPairs(prefix, pairs) {
    return pairs.map(function (p, i) { return { id: prefix + i, prompt: p[0], accepted: [p[1]], it: p[1], note: '' }; });
  }
  function buildDays() {
    return buildPairs('day-', [['lunes', 'lunedì'], ['martes', 'martedì'], ['miércoles', 'mercoledì'], ['jueves', 'giovedì'], ['viernes', 'venerdì'], ['sábado', 'sabato'], ['domingo', 'domenica']]);
  }
  function buildMonths() {
    return buildPairs('mon-', [['enero', 'gennaio'], ['febrero', 'febbraio'], ['marzo', 'marzo'], ['abril', 'aprile'], ['mayo', 'maggio'], ['junio', 'giugno'], ['julio', 'luglio'], ['agosto', 'agosto'], ['septiembre', 'settembre'], ['octubre', 'ottobre'], ['noviembre', 'novembre'], ['diciembre', 'dicembre'], ['primavera', 'primavera'], ['verano', 'estate'], ['otoño', 'autunno'], ['invierno', 'inverno']]);
  }
  var EXTRAS = [
    { id: 'x-numbers', title: 'Numbers 0–100', kind: 'Number → Italiano', build: buildNumbers },
    { id: 'x-days', title: 'Days of the week', kind: 'Español → Italiano', build: buildDays },
    { id: 'x-months', title: 'Months & seasons', kind: 'Español → Italiano', build: buildMonths }
  ];
  function extraById(id) { for (var i = 0; i < EXTRAS.length; i++) if (EXTRAS[i].id === id) return EXTRAS[i]; return null; }

  /* ---------- rounds ---------- */
  function orderedRound(cat) {
    return cat.items.map(function (it) { return { it: it, k: Math.random() - Math.min(state.fails[it.id] || 0, 6) * 0.08 }; })
      .sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.it; });
  }
  function buildReview() {
    var pool = completedItems();
    var failed = pool.filter(function (it) { return (state.fails[it.id] || 0) > 0; });
    failed.sort(function (a, b) { var d = (state.fails[b.id] || 0) - (state.fails[a.id] || 0); return d !== 0 ? d : Math.random() - 0.5; });
    var top = failed.slice(0, 10), chosen = {}; top.forEach(function (it) { chosen[it.id] = true; });
    var rest = pool.filter(function (it) { return !chosen[it.id]; }); shuffle(rest);
    var rand = rest.slice(0, Math.max(0, 20 - top.length));
    var failedSet = {}; top.forEach(function (it) { failedSet[it.id] = true; });
    return { items: shuffle(top.concat(rand)), failedSet: failedSet };
  }
  function reversePicks() {   // random seen words, Spanish→Italian
    var pool = completedItems(); shuffle(pool);
    return pool.slice(0, Math.min(20, pool.length)).map(function (it) {
      return { id: it.id, prompt: it.es[0], accepted: [it.it], it: it.it, note: it.note };
    });
  }

  /* ================= HOME ================= */
  function categoryNode(c, status) {
    var dot = status === 'done' ? ICON.check : (status === 'locked' ? ICON.lock : ICON.dot);
    var h = '<li class="node ' + status + '"><div class="rail"><div class="dot">' + dot + '</div></div>';
    h += '<div class="card"><span class="chip">' + c.level + '</span><div class="name">' + shortName(c.title) + '</div>';
    h += '<div class="meta">' + c.items.length + ' words</div>';
    if (status === 'current') h += '<button class="begin" data-action="open" data-id="' + c.id + '">Start category</button>';
    else if (status === 'done') h += '<div class="done-tag">' + ICON.check + ' Completed</div>';
    return h + '</div></li>';
  }
  function reviewNode(m, status, rev) {
    var dot = status === 'done' ? ICON.check : (status === 'locked' ? ICON.lock : ICON.cycle);
    var h = '<li class="node review ' + status + '"><div class="rail"><div class="dot">' + dot + '</div></div>';
    h += '<div class="card"><span class="chip">' + (rev ? 'Reverse' : 'Review') + '</span>';
    h += '<div class="name">Checkpoint ' + m + (rev ? ' · reverse' : '') + '</div>';
    h += '<div class="meta">' + (rev ? '20 words · Español → Italiano' : '20 words · most-missed + random') + '</div>';
    if (status === 'current') h += '<button class="begin" data-action="' + (rev ? 'review2' : 'review') + '">Start ' + (rev ? 'reverse round' : 'review round') + '</button>';
    else if (status === 'done') h += '<div class="done-tag">' + ICON.check + ' Cleared</div>';
    return h + '</div></li>';
  }
  function themeBtn() { return '<button class="icon-btn tgl" data-action="theme" title="Theme">◐</button>'; }

  function renderHome() {
    var pct = progressPct(), R = 26, C = 2 * Math.PI * R, off = C * (1 - pct / 100), li = levelInfo();
    var levelName = li.achieved || 'Rookie';
    var levelSub = li.allDone ? 'All levels complete' : (li.achieved ? 'Working on ' + li.working : 'Working towards ' + li.working);
    var html = '<div class="brand"><div><h1>Ripasso</h1><div class="sub">Italiano → Español</div></div>' +
      '<div class="brand-actions">' +
      '<button class="pill-btn" data-action="personal">Mine</button>' +
      '<button class="pill-btn" data-action="extras">Extra</button>' +
      '<button class="pill-btn" data-action="stats">Stats</button>' +
      '<button class="theme-btn" data-action="theme" title="Theme">◐</button></div></div>';
    html += '<div class="stats"><div class="ring"><svg width="66" height="66">' +
      '<circle class="track" cx="33" cy="33" r="' + R + '" fill="none" stroke-width="6"/>' +
      '<circle class="fill" cx="33" cy="33" r="' + R + '" fill="none" stroke-width="6" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"/>' +
      '</svg><div class="pct">' + pct + '%</div></div>' +
      '<div><div class="level-name">' + levelName + '</div><div class="level-sub">' + levelSub + '</div></div>' +
      '<div class="hours"><div class="n">' + fmtHours(state.totalMs) + '</div><div class="l">trained</div></div></div>';
    html += '<div class="section-label">Your path</div><ul class="trail">';
    var pending = resolveGate(), ci = currentIndex();
    for (var i = 0; i < data.categories.length; i++) {
      var c = data.categories[i];
      var cStatus = isDone(c.id) ? 'done' : (!pending && i === ci ? 'current' : 'locked');
      html += categoryNode(c, cStatus);
      if ((i + 1) % 3 === 0) {
        var m = (i + 1) / 3;
        html += reviewNode(m, state.reviewsDone >= m ? 'done' : (pending && pending.type === 'r1' && pending.m === m ? 'current' : 'locked'), false);
        html += reviewNode(m, state.reviews2Done >= m ? 'done' : (pending && pending.type === 'r2' && pending.m === m ? 'current' : 'locked'), true);
      }
    }
    root.innerHTML = html + '</ul>';
  }

  /* ================= EXTRA LIST ================= */
  function renderExtra() {
    var html = '<div class="drill-top"><button class="icon-btn" data-action="gohome">' + ICON.back + '</button>' +
      '<div class="drill-title"><div class="t">Extra categories</div></div>' + themeBtn() + '</div>';
    html += '<div class="tricky-cap">Practice sets off the main path — they don’t affect your level or fail list, but time still counts.</div>';
    html += '<ul class="trail">';
    EXTRAS.forEach(function (def) {
      var e = state.extra[def.id], n = def.build().length;
      html += '<li class="node current review"><div class="rail"><div class="dot">' + ICON.dot + '</div></div>';
      html += '<div class="card"><span class="chip">Extra</span><div class="name">' + def.title + '</div>';
      html += '<div class="meta">' + n + ' items · type in Italian' + (e ? ' · best ' + e.best + '/' + e.total + ' (' + e.attempts + '×)' : '') + '</div>';
      html += '<button class="begin" data-action="extra" data-id="' + def.id + '">' + (e ? 'Practice again' : 'Start') + '</button>';
      html += '</div></li>';
    });
    root.innerHTML = html + '</ul>';
  }

  function renderExtraFails() {
    var html = '<div class="drill-top"><button class="icon-btn" data-action="stats">' + ICON.back + '</button>' +
      '<div class="drill-title"><div class="t">Extra · tricky words</div></div>' + themeBtn() + '</div>';
    var ids = Object.keys(state.extraFails).filter(function (id) { return state.extraFails[id] > 0 && data.extraItemById[id]; })
      .sort(function (a, b) { return state.extraFails[b] - state.extraFails[a]; });
    html += '<div class="tricky-cap">Misses from Extra categories only — completely separate from your main list and review rounds.</div>';
    if (!ids.length) html += '<div class="empty">No extra misses yet.</div>';
    else {
      html += '<ul class="tricky">';
      ids.forEach(function (id) {
        var it = data.extraItemById[id];
        html += '<li><span class="tw-it">' + escapeHtml(it.prompt) + '</span><span class="tw-es">' + escapeHtml(it.it) + '</span>' +
          '<span class="tw-meta"><span class="tw-n">×' + state.extraFails[id] + '</span></span></li>';
      });
      html += '</ul>';
    }
    root.innerHTML = html;
  }

  /* ================= PERSONAL (my words) ================= */
  var personalCtx = null;   // id of the personal category being added to
  function genId(p) { return p + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function personalById(id) { for (var i = 0; i < state.personal.length; i++) if (state.personal[i].id === id) return state.personal[i]; return null; }

  function renderPersonal() {
    var html = '<div class="drill-top"><button class="icon-btn" data-action="gohome">' + ICON.back + '</button>' +
      '<div class="drill-title"><div class="t">My words</div></div>' + themeBtn() + '</div>';
    html += '<div class="tricky-cap">Your own categories — add words you meet day to day and revise them later. They don’t touch your level or the review rounds.</div>';
    html += '<button class="pill-btn wide" data-action="p-new">+ New category</button>';
    if (!state.personal.length) html += '<div class="empty">No personal categories yet.</div>';
    else {
      html += '<ul class="trail" style="margin-top:16px">';
      state.personal.forEach(function (c) {
        html += '<li class="node current review"><div class="rail"><div class="dot">' + ICON.dot + '</div></div>';
        html += '<div class="card"><span class="chip">Mine</span><div class="name">' + escapeHtml(c.name) + '</div>';
        html += '<div class="meta">' + c.items.length + ' word' + (c.items.length === 1 ? '' : 's') + ' · ' + (c.hard ? 'Hard' : 'Soft') + ' mode</div>';
        if (c.items.length) html += '<button class="begin" data-action="p-practice" data-id="' + c.id + '">Revise</button>';
        html += '<button class="pill-btn wide mode-toggle" data-action="p-mode" data-id="' + c.id + '">' +
          (c.hard ? 'Hard · a miss redoes the whole set — tap for Soft' : 'Soft · only missed words repeat — tap for Hard') + '</button>';
        html += '<div class="prow"><button class="pill-btn" data-action="p-add" data-id="' + c.id + '">Add words</button>' +
          '<button class="pill-btn" data-action="p-del" data-id="' + c.id + '">Delete</button></div></div></li>';
      });
      html += '</ul>';
    }
    root.innerHTML = html;
  }

  function renderPersonalAdd() {
    var c = personalById(personalCtx);
    if (!c) { view = 'personal'; return renderPersonal(); }
    var html = '<div class="drill-top"><button class="icon-btn" data-action="personal">' + ICON.back + '</button>' +
      '<div class="drill-title"><div class="chip">Mine</div><div class="t">' + escapeHtml(c.name) + '</div></div>' + themeBtn() + '</div>';
    html += '<form id="p-add-form" class="p-form" autocomplete="off">';
    html += '<input id="p-it" placeholder="Italian word" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next">';
    html += '<input id="p-es" placeholder="meaning in Spanish (comma = synonyms)" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done">';
    html += '<button class="action" type="submit">Add word</button></form>';
    if (c.items.length) {
      html += '<div class="section-label">' + c.items.length + ' word' + (c.items.length === 1 ? '' : 's') + '</div><ul class="p-list">';
      for (var k = c.items.length - 1; k >= 0; k--) {
        var it = c.items[k];
        html += '<li><span class="pw-it">' + escapeHtml(it.it) + '</span><span class="pw-es">' + escapeHtml(it.es.join(', ')) + '</span>' +
          '<button class="pw-del" type="button" data-action="p-delword" data-id="' + it.id + '" title="Remove">' + ICON.x + '</button></li>';
      }
      html += '</ul>';
    } else html += '<div class="empty">No words yet — add your first above.</div>';
    root.innerHTML = html;
    var el = root.querySelector('#p-it'); if (el) el.focus();
  }

  function addPersonalWord() {
    var c = personalById(personalCtx); if (!c) return;
    var itEl = root.querySelector('#p-it'), esEl = root.querySelector('#p-es');
    var it = itEl ? itEl.value.trim() : '', es = esEl ? esEl.value.trim() : '';
    if (!it || !es) { if (!it && itEl) itEl.focus(); else if (esEl) esEl.focus(); return; }
    var accepted = es.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x; });
    c.items.push({ id: genId('pi'), it: it, es: accepted, note: '' });
    saveState();
    renderPersonalAdd();   // re-render clears the inputs and re-focuses the Italian field
  }

  function startPersonalDrill(c) {
    session = { mode: 'personal', reversed: false, hard: !!c.hard, allItems: c.items.slice(), personalId: c.id, personalName: c.name, queue: shuffle(c.items.slice()), missed: [], pass: 1, total: c.items.length, pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, returnTo: 'personal' };
    view = 'drill'; startTick(); renderDrill();
  }

  /* ================= STATS ================= */
  function renderStats() {
    var html = '<div class="drill-top"><button class="icon-btn" data-action="gohome">' + ICON.back + '</button>' +
      '<div class="drill-title"><div class="t">Stats</div></div>' +
      '<div class="clock"><span>' + fmtHours(state.totalMs) + '</span></div>' + themeBtn() + '</div>';

    html += '<div class="section-label">Time by category</div>';
    var rows = [];
    data.categories.forEach(function (c) { var ms = state.categoryMs[c.id] || 0; if (ms > 0) rows.push({ name: shortName(c.title), lv: c.level, ms: ms, tries: state.attempts[c.id] || 0 }); });
    EXTRAS.forEach(function (def) { var ms = state.categoryMs[def.id] || 0; if (ms > 0) rows.push({ name: def.title, lv: '✦', ms: ms, tries: 0 }); });
    if (state.reviewMs > 0) rows.push({ name: 'Review rounds', lv: '★', ms: state.reviewMs, tries: 0 });
    if (!rows.length) html += '<div class="empty">No time recorded yet — start a category.</div>';
    else {
      var max = rows.reduce(function (m, r) { return Math.max(m, r.ms); }, 1);
      html += '<div class="bars">';
      rows.forEach(function (r) {
        var w = Math.max(4, Math.round(r.ms / max * 100));
        html += '<div class="bar-row"><div class="bar-label"><span class="bar-lv">' + r.lv + '</span>' + escapeHtml(r.name) + '</div>' +
          '<div class="bar-track"><i style="width:' + w + '%"></i></div>' +
          '<div class="bar-val">' + fmtDur(r.ms) + '</div>' +
          '<div class="bar-tries">' + (r.tries ? r.tries + '×' : '') + '</div></div>';
      });
      html += '</div>';
    }

    var tricky = Object.keys(state.fails).filter(function (id) { return state.fails[id] > 0 && data.itemById[id]; })
      .map(function (id) { return data.itemById[id]; })
      .sort(function (a, b) { return (state.fails[b.id] || 0) - (state.fails[a.id] || 0); });
    html += '<div class="section-label">Tricky words (' + tricky.length + ')</div>';
    if (!tricky.length) html += '<div class="empty">No misses yet — clean slate.</div>';
    else {
      html += '<div class="tricky-cap">Every word you have missed, hardest first — review rounds pick from these.</div><ul class="tricky">';
      tricky.forEach(function (it, i) {
        var mark = (state.recoveryMarks[it.id] > 0) ? '<span class="tw-mark" title="1 of 2 clean review passes — one more clears this word">✓</span>' : '';
        html += '<li' + (i < 10 ? ' class="hot"' : '') + '><span class="tw-it">' + escapeHtml(it.it) + '</span><span class="tw-es">' + escapeHtml(it.es[0]) + '</span>' +
          '<span class="tw-meta">' + mark + '<span class="tw-n">×' + (state.fails[it.id] || 0) + '</span></span></li>';
      });
      html += '</ul>';
    }
    html += '<button class="pill-btn wide" data-action="extrafails">Extra · tricky words ›</button>';
    html += '<div class="section-label" style="margin-top:26px">Backup</div>';
    html += '<div class="tricky-cap">Your progress lives only on this device. Export a copy to keep it safe; import to restore it or move to a new phone.</div>';
    html += '<button class="pill-btn wide" data-action="export">Export backup</button>';
    html += '<label class="pill-btn wide" for="import-file">Import backup</label>';
    html += '<input id="import-file" type="file" accept="application/json,.json" hidden>';
    root.innerHTML = html;
  }

  /* ================= DRILL ================= */
  function startCategory(cat) {
    session = { mode: 'category', reversed: false, cat: cat, queue: orderedRound(cat), pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, returnTo: 'home' };
    view = 'drill'; startTick(); renderDrill();
  }
  function startReview() {
    var r = buildReview();
    session = { mode: 'review', reversed: false, cat: null, failedSet: r.failedSet, queue: r.items, pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, returnTo: 'home' };
    view = 'drill'; startTick(); renderDrill();
  }
  function startReview2() {
    session = { mode: 'review2', reversed: true, cat: null, queue: reversePicks(), pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, kindLabel: 'Español → Italiano', returnTo: 'home' };
    view = 'drill'; startTick(); renderDrill();
  }
  function startExtra(def) {
    var items = shuffle(def.build());
    session = { mode: 'extra', reversed: true, extra: def, queue: items, missed: [], pass: 1, firstCorrect: 0, total: items.length, pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, kindLabel: def.kind, returnTo: 'extra' };
    view = 'drill'; startTick(); renderDrill();
  }
  function rebuildRound() {
    if (session.mode === 'extra') { session.queue = shuffle(session.missed.slice()); session.missed = []; session.pass++; }
    else if (session.mode === 'personal') { session.queue = session.hard ? shuffle(session.allItems.slice()) : shuffle(session.missed.slice()); session.missed = []; session.pass++; }
    else if (session.mode === 'category') session.queue = orderedRound(session.cat);
    else session.queue = shuffle(session.queue.slice());
    session.pos = 0; session.roundFails = 0; session.rounds++; session.phase = 'answer'; session.screen = 'item'; session.last = null;
    renderDrill();
  }
  function endRound() {
    // extra: whittle down — only the missed items come back each pass, until none remain
    if (session.mode === 'extra') {
      if (session.missed.length > 0) { session.roundFails = session.missed.length; session.screen = 'refill'; return renderDrill(); }
      recordExtra(); session.screen = 'done'; return renderDrill();
    }
    if (session.mode === 'personal') {
      var more = session.hard ? session.roundFails > 0 : session.missed.length > 0;
      if (more) { if (!session.hard) session.roundFails = session.missed.length; session.screen = 'refill'; return renderDrill(); }
      session.screen = 'done'; return renderDrill();
    }
    // categories AND both review rounds refill the whole set until a clean pass
    var refillMode = (session.mode === 'category' || session.mode === 'review' || session.mode === 'review2');
    if (refillMode && session.roundFails > 0) { session.screen = 'refill'; return renderDrill(); }
    if (session.mode === 'review') { state.reviewsDone++; saveState(); }
    else if (session.mode === 'review2') { state.reviews2Done++; saveState(); }
    else { if (!isDone(session.cat.id)) state.completed.push(session.cat.id); state.attempts[session.cat.id] = session.rounds; saveState(); }
    session.screen = 'done'; renderDrill();
  }
  function recordExtra() {
    var id = session.extra.id, e = state.extra[id] || { attempts: 0, best: 0, last: 0, total: session.total };
    e.attempts++; e.last = session.firstCorrect; e.best = Math.max(e.best, session.firstCorrect); e.total = session.total;
    state.extra[id] = e; saveState();
  }
  function leaveDrill() { var to = session ? session.returnTo : 'home'; timer.stop(); stopTick(); session = null; view = to; if (to === 'extra') renderExtra(); else if (to === 'personal') renderPersonal(); else renderHome(); }

  function drillTop() {
    var chip = session.mode === 'category' ? session.cat.level : (session.mode === 'extra' ? 'Extra' : (session.mode === 'personal' ? 'Mine' : (session.mode === 'review2' ? 'Reverse' : 'Review')));
    var title = session.mode === 'category' ? shortName(session.cat.title) : (session.mode === 'extra' ? session.extra.title : (session.mode === 'personal' ? session.personalName : 'Checkpoint'));
    return '<div class="drill-top"><button class="icon-btn" data-action="exit">' + ICON.back + '</button>' +
      '<div class="drill-title"><div class="chip">' + chip + '</div><div class="t">' + title + '</div></div>' +
      '<div class="clock"><span class="rec"></span><span id="clock">' + fmtHours(timer.liveMs()) + '</span></div>' + themeBtn() + '</div>';
  }

  function renderDrill() {
    if (session.screen === 'refill') { timer.mark(); return renderRefill(); }
    if (session.screen === 'done') { timer.stop(); stopTick(); return renderDone(); }
    if (session.phase === 'spell') { timer.mark(); return renderSpell(); }
    timer.mark();
    renderItem();
  }

  function renderItem() {
    var item = session.queue[session.pos], total = session.queue.length, pct = Math.round(session.pos / total * 100);
    var revealing = session.phase === 'reveal', reversed = session.reversed;
    var promptText = reversed ? item.prompt : item.it;
    var kind = reversed ? session.kindLabel : (item.it.indexOf(' ') !== -1 ? 'Expression' : 'Word');
    var passed = revealing && (session.last.correct || session.last.selfCorrected);
    var html = drillTop();
    html += '<div class="progress"><i style="width:' + pct + '%"></i></div>';
    html += '<div class="count">' + (session.pos + 1) + ' / ' + total + '</div>';
    html += '<div class="prompt' + (revealing ? (passed ? ' ok' : ' no') : '') + '"><div class="kind">' + kind + '</div>';
    html += '<div class="word">' + escapeHtml(promptText) + '</div><div class="verdict">';
    if (revealing) {
      if (session.last.correct) html += '<span class="badge ok-b">' + ICON.check + ' Correct</span>';
      else if (session.last.selfCorrected) { html += '<span class="badge ok-b">' + ICON.check + ' Counted as correct</span><div class="answer">' + escapeHtml(reversed ? item.accepted[0] : item.es.join(', ')) + '</div><div class="your">kept as a pass — no fail recorded</div>'; }
      else {
        html += '<span class="badge no-b">' + ICON.x + ' Not quite</span>';
        html += '<div class="answer">' + escapeHtml(reversed ? item.accepted[0] : item.es.join(', ')) + '</div>';
        if (session.last.input) html += '<div class="your">you wrote <s>' + escapeHtml(session.last.input) + '</s></div>';
      }
      if (item.note) html += '<div class="note">' + escapeHtml(item.note) + '</div>';
    }
    html += '</div></div><div class="entry">';
    if (revealing) {
      html += '<input value="' + escapeHtml(session.last.input) + '" readonly>';
      html += '<button class="action" data-action="next">Next</button>';
      if (session.mode !== 'extra' && !session.last.correct && !session.last.selfCorrected) html += '<button class="action ghost" type="button" data-action="self">I had it right</button>';
    } else {
      var ph = reversed ? 'type it in Italian…' : 'type the meaning in Spanish…';
      html += '<form id="answer-form" autocomplete="off"><input id="answer" placeholder="' + ph + '" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go">';
      html += '<button class="action" type="submit">Check</button></form>';
      html += '<button class="action ghost" type="button" data-action="idk">I don’t know</button>';
    }
    root.innerHTML = html + '</div>';
    var f = revealing ? root.querySelector('[data-action="next"]') : root.querySelector('#answer');
    if (f) f.focus();
  }

  function renderSpell() {
    var item = session.queue[session.pos], total = session.queue.length, pct = Math.round(session.pos / total * 100), variants = item.es.slice(1);
    var html = drillTop();
    html += '<div class="progress"><i style="width:' + pct + '%"></i></div><div class="count">' + (session.pos + 1) + ' / ' + total + '</div>';
    html += '<div class="prompt ok"><div class="spell-tag">✓ correct — now write it in Italian</div>';
    html += '<div class="word">' + escapeHtml(item.es[0]) + '</div>';
    if (variants.length) html += '<div class="variants">' + escapeHtml(variants.join(' · ')) + '</div>';
    if (item.note) html += '<div class="note">' + escapeHtml(item.note) + '</div>';
    if (session.spellMiss) html += '<div class="verdict"><span class="badge no-b">' + ICON.x + ' check the spelling</span><div class="answer">' + escapeHtml(item.it) + '</div></div>';
    html += '</div><div class="entry"><form id="spell-form" autocomplete="off"><input id="spell-input" placeholder="type it in Italian…" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go">';
    html += '<button class="action" type="submit">Continue</button></form></div>';
    root.innerHTML = html;
    var el = root.querySelector('#spell-input'); if (el) el.focus();
  }

  function renderRefill() {
    var head, body, btn;
    var whittle = (session.mode === 'extra') || (session.mode === 'personal' && !session.hard);
    if (whittle) { head = 'Just the ones you missed'; body = session.roundFails + ' to go — only the words you got wrong come back, until every one is right.'; btn = 'Keep going'; }
    else if (session.mode === 'category' || (session.mode === 'personal' && session.hard)) { head = session.mode === 'category' ? 'The category refills' : 'Redo the whole set'; body = session.roundFails + ' missed this round. The whole set comes back — every word, until you clear it in one clean pass.'; btn = 'Go again'; }
    else { head = 'The round repeats'; body = session.roundFails + ' missed this round. The whole set comes back — every word, until you clear it in one clean pass.'; btn = 'Go again'; }
    var html = drillTop() + '<div class="overlay"><div class="mark warn">' + ICON.cycle + '</div><h2>' + head + '</h2><p>' + body + '</p>';
    html += '<button class="action" data-action="continue">' + btn + '</button></div>';
    root.innerHTML = html; var b = root.querySelector('[data-action="continue"]'); if (b) b.focus();
  }
  function renderDone() {
    var title, msg;
    if (session.mode === 'extra') { title = 'Extra cleared'; msg = 'All ' + session.total + ' done in “' + escapeHtml(session.extra.title) + '” — you knew ' + session.firstCorrect + ' / ' + session.total + ' on the first pass.'; }
    else if (session.mode === 'review2') { title = 'Reverse round complete'; msg = 'Cleared — every word produced in Italian.'; }
    else if (session.mode === 'review') { title = 'Review round complete'; msg = 'Checkpoint cleared — the reverse round is next.'; }
    else if (session.mode === 'personal') { title = 'Revised!'; msg = 'You cleared all ' + session.total + ' words in “' + escapeHtml(session.personalName) + '”.'; }
    else { title = 'Category complete'; msg = 'Clean round — “' + escapeHtml(shortName(session.cat.title)) + '” is done' + (session.rounds > 1 ? ' after ' + session.rounds + ' tries' : '') + '. The next one is unlocked.'; }
    var back = (session.returnTo === 'extra') ? 'Back to extra' : (session.returnTo === 'personal' ? 'Back to my words' : 'Back to your path');
    var html = '<div class="topbar-min">' + themeBtn() + '</div><div class="overlay"><div class="mark good">' + ICON.check + '</div><h2>' + title + '</h2><p>' + msg + '</p>';
    html += '<button class="action" data-action="finish">' + back + '</button></div>';
    root.innerHTML = html; var b = root.querySelector('[data-action="finish"]'); if (b) b.focus();
  }

  /* ---------- interactions ---------- */
  function submitAnswer() {
    var inp = root.querySelector('#answer'); if (!inp) return;
    var val = inp.value.trim(); if (!val) { inp.focus(); return; }
    var item = session.queue[session.pos];
    var correct = session.reversed ? isStrictMatch(val, item.accepted) : isCorrect(val, item.es);
    session.last = { correct: correct, input: val, item: item, selfCorrected: false, idk: false };
    if (correct) session.correctCount++;
    if (session.reversed) {
      if (session.mode === 'extra') {
        if (correct) { if (session.pass === 1) session.firstCorrect++; }
        else { state.extraFails[item.id] = (state.extraFails[item.id] || 0) + 1; session.missed.push(item); saveState(); }
      } else if (!correct) session.roundFails++;   // review2: drives the refill-until-clean
      session.phase = 'reveal';
    } else if (correct) { session.phase = 'spell'; session.spellMiss = false; }
    else {
      if (session.mode === 'personal') { if (session.hard) session.roundFails++; else session.missed.push(item); }
      else { state.fails[item.id] = (state.fails[item.id] || 0) + 1; session.roundFails++; saveState(); }
      session.phase = 'reveal';
    }
    renderDrill();
  }
  function idk() {
    if (session.phase !== 'answer') return;
    var item = session.queue[session.pos];
    session.last = { correct: false, input: '', item: item, selfCorrected: false, idk: true };
    if (session.mode === 'personal') { if (session.hard) session.roundFails++; else session.missed.push(item); }
    else if (!session.reversed) { state.fails[item.id] = (state.fails[item.id] || 0) + 1; session.roundFails++; saveState(); }
    else if (session.mode === 'extra') { state.extraFails[item.id] = (state.extraFails[item.id] || 0) + 1; session.missed.push(item); saveState(); }
    else session.roundFails++;   // review2 idk
    session.phase = 'reveal'; renderDrill();
  }
  function selfCorrect() {
    if (session.phase !== 'reveal' || !session.last || session.last.correct || session.last.selfCorrected) return;
    if (session.mode === 'extra') return;                 // extras don't offer an override
    var it = session.last.item;
    if (session.mode === 'personal') {
      if (session.hard) session.roundFails = Math.max(0, session.roundFails - 1);
      else for (var k = session.missed.length - 1; k >= 0; k--) if (session.missed[k].id === it.id) { session.missed.splice(k, 1); break; }
    } else {
      if (!session.reversed && state.fails[it.id] > 0) { state.fails[it.id]--; if (state.fails[it.id] === 0) delete state.fails[it.id]; }
      session.roundFails = Math.max(0, session.roundFails - 1); saveState();
    }
    session.correctCount++;
    session.last.selfCorrected = true; renderDrill();
  }
  function spellSubmit() {
    var el = root.querySelector('#spell-input'); if (!el) return;
    var val = el.value.trim(); if (!val) { el.focus(); return; }
    if (isStrictMatch(val, [session.queue[session.pos].it])) nextItem();
    else { session.spellMiss = true; renderSpell(); }
  }
  function nextItem() {
    if (session.mode === 'review' && session.last && session.rounds === 1) {
      var it = session.last.item, passed = session.last.correct || session.last.selfCorrected;
      if (session.failedSet[it.id] && passed) {
        state.recoveryMarks[it.id] = (state.recoveryMarks[it.id] || 0) + 1;
        if (state.recoveryMarks[it.id] >= 2) { delete state.fails[it.id]; delete state.recoveryMarks[it.id]; }
        saveState();
      }
    }
    session.pos++;
    if (session.pos >= session.queue.length) endRound();
    else { session.phase = 'answer'; renderDrill(); }
  }

  function startTick() { stopTick(); tick = setInterval(function () { var el = document.getElementById('clock'); if (el) el.textContent = fmtHours(timer.liveMs()); }, 3000); }
  function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function exportData() {
    var blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var d = new Date();
    var stamp = '' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes());
    var a = document.createElement('a');
    a.href = url; a.download = 'ripasso-backup-' + stamp + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try { incoming = JSON.parse(reader.result); } catch (e) { incoming = null; }
      if (!incoming || typeof incoming !== 'object' || !('completed' in incoming || 'fails' in incoming || 'totalMs' in incoming)) {
        alert('That file is not a valid Ripasso backup.'); return;
      }
      if (!confirm('Replace your current progress with this backup? This cannot be undone.')) return;
      try { localStorage.setItem(STATE_KEY, JSON.stringify(incoming)); } catch (e) {}
      state = loadState(); view = 'home'; renderHome();
    };
    reader.readAsText(file);
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'light' ? 'dark' : (cur === 'dark' ? '' : 'light');
    if (next) document.documentElement.setAttribute('data-theme', next); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]'); if (!t) return;
    var a = t.getAttribute('data-action');
    if (a === 'theme') return toggleTheme();
    if (a === 'stats') { view = 'stats'; return renderStats(); }
    if (a === 'extras') { view = 'extra'; return renderExtra(); }
    if (a === 'extrafails') { view = 'extrafails'; return renderExtraFails(); }
    if (a === 'export') return exportData();
    if (a === 'personal') { view = 'personal'; return renderPersonal(); }
    if (a === 'p-new') { var pn = prompt('Name your category:'); if (pn && pn.trim()) { var pcat = { id: genId('p'), name: pn.trim(), items: [] }; state.personal.push(pcat); saveState(); personalCtx = pcat.id; view = 'personal-add'; renderPersonalAdd(); } return; }
    if (a === 'p-add') { personalCtx = t.getAttribute('data-id'); view = 'personal-add'; return renderPersonalAdd(); }
    if (a === 'p-practice') { var ppc = personalById(t.getAttribute('data-id')); if (ppc && ppc.items.length) startPersonalDrill(ppc); return; }
    if (a === 'p-del') { var pdid = t.getAttribute('data-id'), pdc = personalById(pdid); if (pdc && confirm('Delete “' + pdc.name + '” and all its words?')) { state.personal = state.personal.filter(function (x) { return x.id !== pdid; }); saveState(); renderPersonal(); } return; }
    if (a === 'p-delword') { var wcc = personalById(personalCtx); if (wcc) { var wid = t.getAttribute('data-id'); wcc.items = wcc.items.filter(function (x) { return x.id !== wid; }); saveState(); renderPersonalAdd(); } return; }
    if (a === 'p-mode') { var mc = personalById(t.getAttribute('data-id')); if (mc) { mc.hard = !mc.hard; saveState(); renderPersonal(); } return; }
    if (a === 'gohome') { view = 'home'; return renderHome(); }
    if (a === 'open') { var id = +t.getAttribute('data-id'); var c = data.categories.filter(function (x) { return x.id === id; })[0]; if (c) startCategory(c); return; }
    if (a === 'extra') { var d = extraById(t.getAttribute('data-id')); if (d) startExtra(d); return; }
    if (a === 'review') return startReview();
    if (a === 'review2') return startReview2();
    if (a === 'exit' || a === 'finish') return leaveDrill();
    if (a === 'next') return nextItem();
    if (a === 'continue') return rebuildRound();
    if (a === 'idk') return idk();
    if (a === 'self') return selfCorrect();
  });
  root.addEventListener('submit', function (e) {
    if (!e.target) return;
    if (e.target.id === 'answer-form') { e.preventDefault(); submitAnswer(); }
    else if (e.target.id === 'spell-form') { e.preventDefault(); spellSubmit(); }
    else if (e.target.id === 'p-add-form') { e.preventDefault(); addPersonalWord(); }
  });
  root.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'import-file' && e.target.files && e.target.files[0]) importData(e.target.files[0]);
  });
  root.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'p-it') { e.preventDefault(); var es = root.querySelector('#p-es'); if (es) es.focus(); }
  });
  document.addEventListener('visibilitychange', function () {
    if (view !== 'drill' || !session || session.screen === 'done') return;
    if (document.hidden) timer.stop(); else timer.arm();
  });
  window.addEventListener('beforeunload', function () { if (view === 'drill') timer.stop(); });

  (function initTheme() { var t; try { t = localStorage.getItem(THEME_KEY); } catch (e) { t = null; } if (t) document.documentElement.setAttribute('data-theme', t); })();

  // Ask the browser to keep our local data (reduces the chance it's auto-evicted).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
    data = d; data.allItems = []; data.itemById = {};
    data.categories.forEach(function (c) { c.items.forEach(function (it) { data.allItems.push(it); data.itemById[it.id] = it; }); });
    data.extraItemById = {};
    EXTRAS.forEach(function (def) { def.build().forEach(function (it) { data.extraItemById[it.id] = { prompt: it.prompt, it: it.it }; }); });
    state = loadState(); renderHome();
  }).catch(function () { root.innerHTML = '<div class="overlay"><h2>Could not load data</h2><p>Serve this folder over http (see README) and reload.</p></div>'; });

  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
})();
