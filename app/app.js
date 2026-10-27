(function () {
  'use strict';

  var STATE_KEY = 'lpl-state-v1';
  var THEME_KEY = 'lpl-theme';
  var TRACK_KEY = 'lpl-track';
  var CAP = 30000;                 // AFK cap: at most 30s counted per screen dwell
  var THEORY_CAP = 90000;          // reading theory: up to 90s between scrolls
  var data = null, state = null;
  var view = 'home';               // 'home' | 'drill' | 'theory' | 'extra' | 'personal' | 'books' | 'stats' | …
  var track = 'vocab';             // the path home & stats show: 'vocab' | 'grammar'
  var session = null, tick = null;
  var reading = null, theoryBack = 'home';   // the grammar category whose theory is open, and where "back" leads
  var showDone = {};               // per track: completed steps unfolded on the path
  var root = document.getElementById('app');

  function svg(paths) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>'; }
  var ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>',
    cycle: svg('<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>'),
    path: svg('<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.5"/>'),
    spark: svg('<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z"/><path d="M19 15v4M17 17h4"/>'),
    bookmark: svg('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
    book: svg('<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>'),
    chart: svg('<path d="M3 20h18"/><path d="M6 16v-5"/><path d="M11 16V6"/><path d="M16 16v-8"/>'),
    theme: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>'
  };

  /* ---------- persistence ---------- */
  // One track's progress. Vocabulary keeps it at the root of the state, exactly as in every backup
  // made before grammar existed (so those still import as they are); grammar has the same shape under state.grammar.
  function fillProgress(p) {
    if (!Array.isArray(p.completed)) p.completed = [];
    if (!p.fails || typeof p.fails !== 'object') p.fails = {};
    if (!p.recoveryMarks || typeof p.recoveryMarks !== 'object') p.recoveryMarks = {};
    if (typeof p.reviewsDone !== 'number') p.reviewsDone = 0;
    if (typeof p.reviews2Done !== 'number') p.reviews2Done = 0;
    if (!p.attempts || typeof p.attempts !== 'object') p.attempts = {};
    if (!p.categoryMs || typeof p.categoryMs !== 'object') p.categoryMs = {};
    if (typeof p.reviewMs !== 'number') p.reviewMs = 0;
    if (!p.extra || typeof p.extra !== 'object') p.extra = {};
    if (!p.extraFails || typeof p.extraFails !== 'object') p.extraFails = {};
    return p;
  }
  function loadState() {
    var s; try { s = JSON.parse(localStorage.getItem(STATE_KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = {};
    fillProgress(s);
    if (!s.grammar || typeof s.grammar !== 'object') s.grammar = {};
    fillProgress(s.grammar);
    if (!s.grammar.theoryRead || typeof s.grammar.theoryRead !== 'object') s.grammar.theoryRead = {};
    if (!s.books || typeof s.books !== 'object') s.books = {};
    if (typeof s.totalMs !== 'number') s.totalMs = 0;
    if (!Array.isArray(s.personal)) s.personal = [];
    return s;
  }
  function saveState() { try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) {} }

  /* ---------- tracks ---------- */
  // Two paths with the same mechanics: vocabulary (words) and grammar (gap-fill sentences).
  function prog(key) { return key === 'grammar' ? state.grammar : state; }
  function trk(key) {
    var g = key === 'grammar';
    return { key: g ? 'grammar' : 'vocab', grammar: g, cats: g ? data.grammar.categories : data.categories, levels: g ? data.grammar.levels : data.levels, byId: g ? data.grammarItemById : data.itemById, p: prog(key) };
  }
  function setTrack(k) { track = k === 'grammar' ? 'grammar' : 'vocab'; try { localStorage.setItem(TRACK_KEY, track); } catch (e) {} }

  /* ---------- timer (segment-based, AFK-capped) ---------- */
  function attributeTime(d) {
    if (reading) { var gp = prog('grammar'); gp.categoryMs[reading.id] = (gp.categoryMs[reading.id] || 0) + d; return; }   // theory counts for its category
    if (!session) return;
    var p = prog(session.track);
    if (session.mode === 'review' || session.mode === 'review2') p.reviewMs += d;
    else if (session.mode === 'extra' && session.extra) p.categoryMs[session.extra.id] = (p.categoryMs[session.extra.id] || 0) + d;
    else if (session.cat) p.categoryMs[session.cat.id] = (p.categoryMs[session.cat.id] || 0) + d;
  }
  var timer = {
    start: 0,
    _d: function () { return this.start ? Math.min(Date.now() - this.start, reading ? THEORY_CAP : CAP) : 0; },
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
  function isDone(t, id) { return t.p.completed.indexOf(id) !== -1; }
  function currentIndex(t) { for (var i = 0; i < t.cats.length; i++) if (!isDone(t, t.cats[i].id)) return i; return -1; }
  function progressPct(t) { return Math.round(t.p.completed.length / t.cats.length * 100); }
  function levelInfo(t) {
    var achieved = null;
    for (var k = 0; k < t.levels.length; k++) {
      var lv = t.levels[k], cats = t.cats.filter(function (c) { return c.level === lv; });
      if (cats.length && cats.every(function (c) { return isDone(t, c.id); })) achieved = lv;
    }
    var ci = currentIndex(t);
    return { achieved: achieved, working: ci >= 0 ? t.cats[ci].level : t.levels[t.levels.length - 1], allDone: ci < 0 };
  }
  function shortName(title) { var p = title.split(' · '); return p.length > 1 ? p.slice(1).join(' · ') : title; }
  function hasFails(t) { for (var k in t.p.fails) if (t.p.fails[k] > 0) return true; return false; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function completedItems(t) {
    var out = [];
    for (var i = 0; i < t.cats.length; i++) { var c = t.cats[i]; if (isDone(t, c.id)) for (var j = 0; j < c.items.length; j++) out.push(c.items[j]); }
    return out;
  }
  function resolveGate(t) {
    var p = t.p, changed = false, due = Math.floor(p.completed.length / 3);
    while (p.reviewsDone < due && !hasFails(t)) { p.reviewsDone++; changed = true; }
    if (changed) saveState();
    if (p.reviewsDone < due) return { type: 'r1', m: p.reviewsDone + 1 };
    if (p.reviews2Done < due) return { type: 'r2', m: p.reviews2Done + 1 };
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
  function normalizeSpelling(s) { return (s || '').trim().toLowerCase().replace(/[’‘ʼ]/g, "'"); }   // ignore case (and curly apostrophes) only
  function isStrictMatch(input, accepted) {        // Italian: case only, accents & rest exact
    var ni = normalizeSpelling(input); if (!ni) return false;
    for (var i = 0; i < accepted.length; i++) if (ni === normalizeSpelling(accepted[i])) return true;
    return false;
  }
  // Grammar: strict like Italian spelling (accents count), but forgiving about case, the apostrophe's
  // shape, spacing and stray end punctuation — so "l' " or "Sono." still match.
  function normalizeForm(s) {
    return (s || '').normalize('NFC').toLowerCase().replace(/[’‘ʼ]/g, "'")
      .replace(/^[\s.,;:!?¡¿"«»]+|[\s.,;:!?¡¿"«»]+$/g, '').replace(/\s+/g, ' ').replace(/ ?' ?/g, "'");
  }
  function matchForm(input, accepted) {           // the accepted form the input matches, or null
    var ni = normalizeForm(input); if (!ni) return null;
    for (var i = 0; i < accepted.length; i++) if (ni === normalizeForm(accepted[i])) return accepted[i];
    return null;
  }
  function stripAccents(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function accentOnlyMiss(input, accepted) {      // right letters, wrong or missing accents
    var ni = stripAccents(normalizeForm(input)); if (!ni) return false;
    for (var i = 0; i < accepted.length; i++) if (ni === stripAccents(normalizeForm(accepted[i]))) return true;
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
  function buildPrepArticles() {   // di, a, da, in, su × il, lo, l', la, i, gli, le → del, allo, dall', nella, sui…
    var preps = [['di', 'de'], ['a', 'a'], ['da', 'da'], ['in', 'ne'], ['su', 'su']];
    var arts = [['il', 'l'], ['lo', 'llo'], ["l'", "ll'"], ['la', 'lla'], ['i', 'i'], ['gli', 'gli'], ['le', 'lle']], pairs = [];
    preps.forEach(function (p) { arts.forEach(function (a) { pairs.push([p[0] + ' + ' + a[0], p[1] + a[1]]); }); });
    return buildPairs('pa-', pairs);
  }
  function buildParticiples() {
    return buildPairs('pp-', [['essere', 'stato'], ['fare', 'fatto'], ['dire', 'detto'], ['leggere', 'letto'], ['scrivere', 'scritto'], ['vedere', 'visto'], ['prendere', 'preso'], ['mettere', 'messo'], ['aprire', 'aperto'], ['chiudere', 'chiuso'], ['chiedere', 'chiesto'], ['rispondere', 'risposto'], ['vincere', 'vinto'], ['bere', 'bevuto'], ['rimanere', 'rimasto'], ['venire', 'venuto'], ['nascere', 'nato'], ['morire', 'morto'], ['scegliere', 'scelto'], ['spendere', 'speso'], ['correre', 'corso'], ['decidere', 'deciso'], ['offrire', 'offerto'], ['scendere', 'sceso'], ['accendere', 'acceso'], ['spegnere', 'spento'], ['ridere', 'riso'], ['piangere', 'pianto'], ['rompere', 'rotto'], ['succedere', 'successo'], ['vivere', 'vissuto'], ['conoscere', 'conosciuto'], ['piacere', 'piaciuto'], ['muovere', 'mosso'], ['discutere', 'discusso'], ['tradurre', 'tradotto'], ['nascondere', 'nascosto'], ['cuocere', 'cotto'], ['soffrire', 'sofferto'], ['scoprire', 'scoperto']]);
  }
  var EXTRAS = [
    { id: 'x-numbers', track: 'vocab', title: 'Numbers 0–100', kind: 'Number → Italiano', build: buildNumbers },
    { id: 'x-days', track: 'vocab', title: 'Days of the week', kind: 'Español → Italiano', build: buildDays },
    { id: 'x-months', track: 'vocab', title: 'Months & seasons', kind: 'Español → Italiano', build: buildMonths },
    { id: 'x-preps', track: 'grammar', title: 'Prepositions + articles', kind: 'Preposition + article', build: buildPrepArticles },
    { id: 'x-participles', track: 'grammar', title: 'Irregular past participles', kind: 'Infinitive → participle', build: buildParticiples }
  ];
  function extraById(id) { for (var i = 0; i < EXTRAS.length; i++) if (EXTRAS[i].id === id) return EXTRAS[i]; return null; }

  /* ---------- rounds ---------- */
  function orderedRound(t, cat) {
    return cat.items.map(function (it) { return { it: it, k: Math.random() - Math.min(t.p.fails[it.id] || 0, 6) * 0.08 }; })
      .sort(function (a, b) { return a.k - b.k; }).map(function (x) { return x.it; });
  }
  function buildReview(t) {
    var pool = completedItems(t), fails = t.p.fails;
    var failed = pool.filter(function (it) { return (fails[it.id] || 0) > 0; });
    failed.sort(function (a, b) { var d = (fails[b.id] || 0) - (fails[a.id] || 0); return d !== 0 ? d : Math.random() - 0.5; });
    var top = failed.slice(0, 10), chosen = {}; top.forEach(function (it) { chosen[it.id] = true; });
    var rest = pool.filter(function (it) { return !chosen[it.id]; }); shuffle(rest);
    var rand = rest.slice(0, Math.max(0, 20 - top.length));
    var failedSet = {}; top.forEach(function (it) { failedSet[it.id] = true; });
    return { items: shuffle(top.concat(rand)), failedSet: failedSet };
  }
  function reversePicks(t) {   // random seen words, Spanish→Italian
    var pool = completedItems(t); shuffle(pool);
    return pool.slice(0, Math.min(20, pool.length)).map(function (it) {
      return { id: it.id, prompt: it.es[0], accepted: [it.it], it: it.it, note: it.note };
    });
  }
  function noHintPicks(t) { return shuffle(completedItems(t)).slice(0, 20); }   // random seen sentences, cue hidden

  /* ---------- screen helpers ---------- */
  // Each screen paints its accent: vocabulary terracotta, grammar azzurro, books olive.
  function paint(key) { root.setAttribute('data-track', key); }
  function themeBtn() { return '<button class="icon-btn" data-action="theme" title="Theme" aria-label="Theme">' + ICON.theme + '</button>'; }
  function pageHead(title, sub) {
    return '<header class="page-head"><div><h1>' + title + '</h1>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + themeBtn() + '</header>';
  }
  function subHead(back, chip, title, right) {   // sub-pages: a back button, a small label, a title
    return '<header class="sub-head"><button class="icon-btn" data-action="' + back + '" aria-label="Back">' + ICON.back + '</button>' +
      '<div class="sub-t">' + (chip ? '<div class="chip-s">' + chip + '</div>' : '') + '<div class="t">' + title + '</div></div>' + (right || '') + '</header>';
  }
  var NAV = [['gohome', 'home', 'Path', 'path'], ['extras', 'extra', 'Extra', 'spark'], ['personal', 'personal', 'Mine', 'bookmark'], ['books', 'books', 'Books', 'book'], ['stats', 'stats', 'Stats', 'chart']];
  function navBar() {
    return '<nav class="nav">' + NAV.map(function (n) {
      return '<button class="' + (view === n[1] ? 'on' : '') + '" data-action="' + n[0] + '" aria-label="' + n[2] + '">' + ICON[n[3]] + '<span>' + n[2] + '</span></button>';
    }).join('') + '</nav>';
  }
  var entering = false;            // true while a screen change renders: its content slides in
  function show(html, withNav) {   // swap the screen; the floating nav only on the five main screens
    root.innerHTML = html + (withNav ? navBar() : '');
    root.classList.toggle('with-nav', !!withNav);
    root.classList.toggle('enter', entering);
  }
  function trackTabs() {
    return '<div class="tabs">' + [['vocab', 'Vocabulary'], ['grammar', 'Grammar']].map(function (k) {
      return '<button class="tab' + (track === k[0] ? ' on' : '') + '" data-action="track" data-id="' + k[0] + '">' + k[1] + '</button>';
    }).join('') + '</div>';
  }

  /* ================= HOME ================= */
  function renderHome(keepScroll) {
    var t = trk(track);
    paint(t.key);
    if (!keepScroll) window.scrollTo(0, 0);
    var html = '<header class="home-head"><div class="brand"><div class="logo">Ripasso<i class="tri"></i></div><div class="sub">Italiano → Español</div></div>' + themeBtn() + '</header>';
    html += trackTabs();
    if (!t.cats.length) return show(html + '<div class="empty">The grammar path hasn’t loaded yet — close the app and open it again to finish the update.</div>', true);
    var li = levelInfo(t), pct = progressPct(t);
    html += '<section class="hero"><div class="hero-row"><div><div class="hero-pct">' + pct + '<span>%</span></div>' +
      '<div class="hero-l">of the ' + (t.grammar ? 'grammar' : 'vocabulary') + ' path</div></div>' +
      '<div class="hero-lv"><b class="level-name">' + (li.achieved || 'Rookie') + '</b><span>' + (li.allDone ? 'All levels complete' : (li.achieved ? 'Working on ' : 'Working towards ') + li.working) + '</span></div></div>' +
      '<div class="hero-bar"><i style="width:' + pct + '%"></i></div>' +
      '<div class="hero-foot"><span>' + t.p.completed.length + ' / ' + t.cats.length + ' categories</span><span>' + fmtHours(state.totalMs) + ' trained</span></div></section>';
    html += '<div class="section-label">Your path</div>' + trail(t);
    show(html, true);
    var now = root.querySelector('.trail .now');
    if (!keepScroll && now && now.getBoundingClientRect().top > window.innerHeight * 0.7) now.scrollIntoView({ block: 'center' });
  }

  // The path: categories in order, a checkpoint (review + reverse / no-hints) after every 3.
  // Completed steps fold into one line once there are a few, so the current one is right under the hero.
  function trail(t) {
    var steps = [], pending = resolveGate(t), ci = currentIndex(t);
    for (var i = 0; i < t.cats.length; i++) {
      var c = t.cats[i];
      steps.push({ cat: c, lv: c.level, st: isDone(t, c.id) ? 'done' : (!pending && i === ci ? 'now' : 'locked') });
      if ((i + 1) % 3 === 0) {
        var m = (i + 1) / 3;
        steps.push({ cp: m, rev: false, lv: c.level, st: t.p.reviewsDone >= m ? 'done' : (pending && pending.type === 'r1' && pending.m === m ? 'now' : 'locked') });
        steps.push({ cp: m, rev: true, lv: c.level, st: t.p.reviews2Done >= m ? 'done' : (pending && pending.type === 'r2' && pending.m === m ? 'now' : 'locked') });
      }
    }
    var nDone = steps.filter(function (s) { return s.st === 'done'; }).length, fold = nDone > 3 && !showDone[t.key];
    var html = '<ul class="trail">', lastLv = null;
    if (nDone > 3) html += '<li class="fold"><span class="st">' + ICON.check + '</span><button class="fold-btn" data-action="fold">' + (fold ? nDone + ' steps completed · show' : 'Hide completed steps') + '</button></li>';
    steps.forEach(function (s) {
      if (fold && s.st === 'done') return;
      if (s.lv !== lastLv) { html += '<li class="lv-sep"><span class="lv-pill">' + s.lv + '</span></li>'; lastLv = s.lv; }
      html += s.cat ? catStep(t, s.cat, s.st) : cpStep(t, s.cp, s.rev, s.st);
    });
    return html + '</ul>';
  }
  function catStep(t, c, st) {
    var icon = st === 'done' ? ICON.check : (st === 'locked' ? ICON.lock : ICON.dot);
    var unit = c.items.length + (t.grammar ? ' sentences' : ' words'), tries = t.p.attempts[c.id];
    var h = '<li class="step ' + st + '"><span class="st">' + icon + '</span>';
    if (st !== 'now') {
      var right = st === 'done' && c.theory ? '<button class="mini" data-action="theory" data-id="' + c.id + '">Theory</button>'
        : '<span class="rt">' + (st === 'done' && tries > 1 ? tries + ' tries' : unit) + '</span>';
      return h + '<div class="row"><span class="nm">' + shortName(c.title) + '</span>' + right + '</div></li>';
    }
    h += '<div class="card now-card"><div class="card-top"><span class="chip">' + c.level + '</span><span class="meta">' + unit + '</span></div>';
    h += '<div class="name">' + shortName(c.title) + '</div>';
    if (c.rule) h += '<div class="rule">' + fmtNote(c.rule) + '</div>';
    if (c.theory && !state.grammar.theoryRead[c.id]) h += '<div class="btns"><button class="btn primary" data-action="theory" data-id="' + c.id + '">' + ICON.book + 'Start with the theory</button></div>';
    else h += '<div class="btns"><button class="btn primary" data-action="open" data-id="' + c.id + '">' + (t.grammar ? 'Start drilling' : 'Start category') + '</button>' +
      (c.theory ? '<button class="btn tonal" data-action="theory" data-id="' + c.id + '">' + ICON.book + 'Theory</button>' : '') + '</div>';
    return h + '</div></li>';
  }
  function cpStep(t, m, rev, st) {
    var icon = st === 'done' ? ICON.check : (st === 'locked' ? ICON.lock : ICON.cycle);
    var r2 = t.grammar ? { chip: 'No hints', meta: '20 sentences · no cue — just the Spanish', btn: 'Start the no-hints round' }
      : { chip: 'Reverse', meta: '20 words · Español → Italiano', btn: 'Start the reverse round' };
    var h = '<li class="step cp ' + st + '"><span class="st">' + icon + '</span>';
    if (st !== 'now') return h + '<div class="row"><span class="nm">Checkpoint ' + m + ' · ' + (rev ? r2.chip.toLowerCase() : 'review') + '</span><span class="rt">' + (st === 'done' ? 'cleared' : '') + '</span></div></li>';
    h += '<div class="card now-card"><div class="card-top"><span class="chip">' + (rev ? r2.chip : 'Review') + '</span><span class="meta">' + (rev ? r2.meta : '20 ' + (t.grammar ? 'sentences' : 'words') + ' · most-missed + random') + '</span></div>';
    h += '<div class="name">Checkpoint ' + m + '</div>';
    return h + '<div class="btns"><button class="btn primary" data-action="' + (rev ? 'review2' : 'review') + '">' + (rev ? r2.btn : 'Start the review round') + '</button></div></div></li>';
  }

  /* ================= THEORY ================= */
  // A short lesson before each grammar category (and any time after): the rule, what works like
  // Spanish, what doesn't, the traps, a curiosity and a trick. Reading it counts as training time.
  function grammarCat(id) { var t = trk('grammar'); for (var i = 0; i < t.cats.length; i++) if (t.cats[i].id === id) return t.cats[i]; return null; }
  function openTheory(c, from) {
    if (!c || !c.theory) return;
    timer.mark();                                   // closes the previous dwell (a drill's, when opened from one)
    reading = c; theoryBack = from;
    if (!state.grammar.theoryRead[c.id]) { state.grammar.theoryRead[c.id] = 1; saveState(); }
    go('theory', renderTheory);
  }
  function closeTheory() {
    if (theoryBack === 'drill' && session) { timer.mark(); reading = null; view = 'drill'; window.scrollTo(0, 0); return renderDrill(); }
    timer.stop(); reading = null; go('home', renderHome);
  }
  function theoryStart() { var c = reading; timer.mark(); reading = null; startCategory(trk('grammar'), c); }
  function renderTheory() {
    var c = reading, th = c.theory, t = trk('grammar');
    paint('grammar');
    var html = subHead('theory-close', c.level + ' · Theory', escapeHtml(shortName(c.title)));
    html += '<article class="theory"><h1 class="th-title">' + escapeHtml(th.title) + '</h1>';
    if (th.lead) html += '<p class="th-lead">' + th.lead + '</p>';
    html += th.html + '</article><div class="th-end">';
    var isNow = !isDone(t, c.id) && !resolveGate(t) && t.cats[currentIndex(t)] === c;
    if (theoryBack === 'drill') html += '<button class="btn primary block" data-action="theory-close">Back to the drill</button>';
    else if (isNow) html += '<button class="btn primary block" data-action="theory-start">Start drilling</button><button class="btn ghost block" data-action="theory-close">Later</button>';
    else html += '<button class="btn tonal block" data-action="theory-close">Back to your path</button>';
    show(html + '</div>', false);
  }

  /* ================= EXTRA LIST ================= */
  function renderExtra() {
    paint('vocab');
    var html = pageHead('Extra', 'Practice sets off the path. They don’t touch your level or your fail list; time still counts.');
    [['vocab', 'Vocabulary'], ['grammar', 'Grammar']].forEach(function (g) {
      html += '<div class="section-label">' + g[1] + '</div><div class="cards">';
      EXTRAS.forEach(function (def) {
        if (def.track !== g[0]) return;
        var e = prog(def.track).extra[def.id], n = def.build().length;
        html += '<div class="card x-card" data-t="' + def.track + '"><div class="card-top"><span class="chip">Extra</span><span class="meta">' + n + ' items · type in Italian</span></div>';
        html += '<div class="name">' + def.title + '</div>' + (e ? '<div class="meta best">Best first pass ' + e.best + '/' + e.total + ' · ' + e.attempts + '×</div>' : '');
        html += '<div class="btns"><button class="btn primary" data-action="extra" data-id="' + def.id + '">' + (e ? 'Practice again' : 'Start') + '</button></div></div>';
      });
      html += '</div>';
    });
    show(html, true);
  }

  function renderExtraFails() {
    var p = prog(track);
    paint(track);
    var html = subHead('stats', 'Extra', 'Tricky words');
    var ids = Object.keys(p.extraFails).filter(function (id) { return p.extraFails[id] > 0 && data.extraItemById[id]; })
      .sort(function (a, b) { return p.extraFails[b] - p.extraFails[a]; });
    html += '<p class="cap">Misses from the ' + (track === 'grammar' ? 'grammar' : 'vocabulary') + ' Extra sets only — completely separate from your main list and review rounds.</p>';
    if (!ids.length) html += '<div class="empty">No extra misses yet.</div>';
    else {
      html += '<ul class="tricky">';
      ids.forEach(function (id) {
        var it = data.extraItemById[id];
        html += '<li><span class="tw-it">' + escapeHtml(it.prompt) + '</span><span class="tw-es">' + escapeHtml(it.it) + '</span>' +
          '<span class="tw-meta"><span class="tw-n">×' + p.extraFails[id] + '</span></span></li>';
      });
      html += '</ul>';
    }
    show(html, false);
  }

  /* ================= PERSONAL (my words) ================= */
  var personalCtx = null;   // id of the personal category being added to
  function genId(p) { return p + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1000); }
  function personalById(id) { for (var i = 0; i < state.personal.length; i++) if (state.personal[i].id === id) return state.personal[i]; return null; }

  function renderPersonal() {
    paint('vocab');
    var html = pageHead('Mine', 'Your own categories — add the words you meet day to day and revise them later. They don’t touch your level or the review rounds.');
    html += '<button class="btn primary block" data-action="p-new">+ New category</button>';
    if (!state.personal.length) html += '<div class="empty">No personal categories yet.</div>';
    else {
      html += '<div class="cards">';
      state.personal.forEach(function (c) {
        html += '<div class="card"><div class="card-top"><span class="chip">Mine</span><span class="meta">' + c.items.length + ' word' + (c.items.length === 1 ? '' : 's') + ' · ' + (c.hard ? 'Hard' : 'Soft') + ' mode</span></div>';
        html += '<div class="name">' + escapeHtml(c.name) + '</div>';
        if (c.items.length) html += '<div class="btns"><button class="btn primary" data-action="p-practice" data-id="' + c.id + '">Revise</button></div>';
        html += '<button class="mode-toggle" data-action="p-mode" data-id="' + c.id + '">' +
          (c.hard ? 'Hard · a miss redoes the whole set — tap for Soft' : 'Soft · only missed words repeat — tap for Hard') + '</button>';
        html += '<div class="prow"><button class="btn tonal" data-action="p-add" data-id="' + c.id + '">Add words</button>' +
          '<button class="btn ghost" data-action="p-del" data-id="' + c.id + '">Delete</button></div></div>';
      });
      html += '</div>';
    }
    show(html, true);
  }

  function renderPersonalAdd() {
    var c = personalById(personalCtx);
    if (!c) { view = 'personal'; return renderPersonal(); }
    paint('vocab');
    var html = subHead('personal', 'Mine', escapeHtml(c.name));
    html += '<form id="p-add-form" class="p-form" autocomplete="off">';
    html += '<input id="p-it" placeholder="Italian word" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next">';
    html += '<input id="p-es" placeholder="meaning in Spanish (comma = synonyms)" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done">';
    html += '<button class="btn primary block" type="submit">Add word</button></form>';
    if (c.items.length) {
      html += '<div class="section-label">' + c.items.length + ' word' + (c.items.length === 1 ? '' : 's') + '</div><ul class="p-list">';
      for (var k = c.items.length - 1; k >= 0; k--) {
        var it = c.items[k];
        html += '<li><span class="pw-it">' + escapeHtml(it.it) + '</span><span class="pw-es">' + escapeHtml(it.es.join(', ')) + '</span>' +
          '<button class="pw-del" type="button" data-action="p-delword" data-id="' + it.id + '" title="Remove">' + ICON.x + '</button></li>';
      }
      html += '</ul>';
    } else html += '<div class="empty">No words yet — add your first above.</div>';
    show(html, false);
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

  /* ================= BOOKS ================= */
  // Reading list by level (docs/books.md), with a status per book: to read → reading → read.
  var SPINES = ['#c8502a', '#2563c9', '#557428', '#b7791f', '#7c4dbe', '#0f7c74', '#b23a5b'];
  function spine(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return SPINES[h % SPINES.length]; }
  function cycleBook(id) {
    var cur = state.books[id];
    if (!cur) state.books[id] = 'reading'; else if (cur === 'reading') state.books[id] = 'read'; else delete state.books[id];
    saveState();
  }
  function renderBooks() {
    paint('books');
    var shelves = data.books || [], here = levelInfo(trk('vocab')).working, all = 0, nRead = 0;
    shelves.forEach(function (g) { g.books.forEach(function (b) { all++; if (state.books[b.id] === 'read') nRead++; }); });
    var html = pageHead('Books', 'Italian, written by Italians — level by level. Inside each level, start at the top.');
    html += '<div class="books-sum"><div class="bs-n"><b>' + nRead + '</b> / ' + all + ' read</div><div class="bar"><i style="width:' + Math.round(nRead / Math.max(1, all) * 100) + '%"></i></div></div>';
    shelves.forEach(function (g) {
      var r = g.books.filter(function (b) { return state.books[b.id] === 'read'; }).length;
      html += '<section class="shelf"><div class="shelf-head"><span class="lv-pill">' + g.level + '</span><span class="shelf-t">' + escapeHtml(g.blurb) + '</span>' +
        (g.level === here ? '<span class="here">You are here</span>' : '') + '<span class="shelf-n">' + r + '/' + g.books.length + '</span></div>';
      g.books.forEach(function (b, i) {
        var st = state.books[b.id] || '';
        html += '<article class="book ' + st + '" style="--spine:' + spine(b.title) + '"><div class="bk-top"><span class="bk-n">' + (i + 1) + '</span><div>' +
          '<h3 class="bk-t">' + escapeHtml(b.title) + '</h3><div class="bk-a">' + escapeHtml(b.author) + (b.year ? ' · ' + escapeHtml(b.year) : '') + '</div></div></div>' +
          '<p class="bk-why">' + b.why + '</p>' + (b.fun ? '<p class="bk-fun">' + b.fun + '</p>' : '') +
          '<button class="bk-st" data-action="book" data-id="' + b.id + '">' + (st === 'read' ? ICON.check + 'Read' : (st === 'reading' ? 'Reading now · tap when done' : '+ Add to my reading')) + '</button></article>';
      });
      html += '</section>';
    });
    show(html, true);
  }

  /* ================= STATS ================= */
  function renderStats() {
    var t = trk(track), p = t.p;
    paint(t.key);
    var html = pageHead('Stats', fmtHours(state.totalMs) + ' trained in total');
    html += trackTabs();

    var rows = [];
    t.cats.forEach(function (c) { var ms = p.categoryMs[c.id] || 0; if (ms > 0) rows.push({ name: shortName(c.title), lv: c.level, ms: ms, tries: p.attempts[c.id] || 0 }); });
    EXTRAS.forEach(function (def) { var ms = def.track === t.key ? p.categoryMs[def.id] || 0 : 0; if (ms > 0) rows.push({ name: def.title, lv: '✦', ms: ms, tries: 0 }); });
    if (p.reviewMs > 0) rows.push({ name: 'Review rounds', lv: '★', ms: p.reviewMs, tries: 0 });
    var sum = rows.reduce(function (s, r) { return s + r.ms; }, 0);
    var tricky = Object.keys(p.fails).filter(function (id) { return p.fails[id] > 0 && t.byId[id]; })
      .map(function (id) { return t.byId[id]; })
      .sort(function (a, b) { return (p.fails[b.id] || 0) - (p.fails[a.id] || 0); });
    html += '<div class="tiles"><div class="tile"><b>' + (sum ? fmtDur(sum) : '0') + '</b><span>on ' + (t.grammar ? 'grammar' : 'vocabulary') + '</span></div>' +
      '<div class="tile"><b>' + p.completed.length + '<small>/' + t.cats.length + '</small></b><span>categories</span></div>' +
      '<div class="tile"><b>' + tricky.length + '</b><span>tricky ' + (t.grammar ? 'sentences' : 'words') + '</span></div></div>';

    html += '<div class="section-label">Time by category' + (sum ? ' · <span class="dur">' + fmtDur(sum) + '</span>' : '') + '</div>';
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

    html += '<div class="section-label">Tricky ' + (t.grammar ? 'sentences' : 'words') + ' (' + tricky.length + ')</div>';
    if (!tricky.length) html += '<div class="empty">No misses yet — clean slate.</div>';
    else {
      html += '<p class="cap">Every ' + (t.grammar ? 'sentence' : 'word') + ' you have missed, hardest first — review rounds pick from these.</p><ul class="tricky">';
      tricky.forEach(function (it, i) {
        var mark = (p.recoveryMarks[it.id] > 0) ? '<span class="tw-mark" title="1 of 2 clean review passes — one more clears this ' + (t.grammar ? 'sentence' : 'word') + '">✓</span>' : '';
        if (t.grammar) html += '<li class="gram' + (i < 10 ? ' hot' : '') + '"><span class="tw-q">' + sentenceHtml(it, it.a[0]) + '</span>' +
          '<span class="tw-meta">' + mark + '<span class="tw-n">×' + (p.fails[it.id] || 0) + '</span></span><span class="tw-topic">' + escapeHtml(it.topic) + '</span></li>';
        else html += '<li' + (i < 10 ? ' class="hot"' : '') + '><span class="tw-it">' + escapeHtml(it.it) + '</span><span class="tw-es">' + escapeHtml(it.es[0]) + '</span>' +
          '<span class="tw-meta">' + mark + '<span class="tw-n">×' + (p.fails[it.id] || 0) + '</span></span></li>';
      });
      html += '</ul>';
    }
    html += '<button class="btn ghost block" data-action="extrafails">Extra · tricky words</button>';
    html += '<div class="section-label" style="margin-top:28px">Backup</div>';
    html += '<p class="cap">Your progress (vocabulary, grammar, reading list) lives only on this device. Export a copy to keep it safe; import to restore it or move to a new phone. Backups from older versions import too.</p>';
    html += '<div class="btns"><button class="btn tonal" data-action="export">Export backup</button>';
    html += '<label class="btn tonal" for="import-file">Import backup</label></div>';
    html += '<input id="import-file" type="file" accept="application/json,.json" hidden>';
    show(html, true);
  }

  /* ================= DRILL ================= */
  function startCategory(t, cat) {
    session = { mode: 'category', track: t.key, grammar: t.grammar, reversed: false, cat: cat, queue: orderedRound(t, cat), pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, returnTo: 'home' };
    view = 'drill'; startTick(); renderDrill();
  }
  function startReview(t) {
    var r = buildReview(t);
    session = { mode: 'review', track: t.key, grammar: t.grammar, reversed: false, cat: null, failedSet: r.failedSet, queue: r.items, pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, returnTo: 'home' };
    view = 'drill'; startTick(); renderDrill();
  }
  function startReview2(t) {   // vocabulary: Spanish → Italian; grammar: the same sentences with the cue hidden
    session = { mode: 'review2', track: t.key, grammar: t.grammar, hideCue: t.grammar, reversed: !t.grammar, cat: null, queue: t.grammar ? noHintPicks(t) : reversePicks(t), pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, kindLabel: 'Español → Italiano', returnTo: 'home' };
    view = 'drill'; startTick(); renderDrill();
  }
  function startExtra(def) {
    var items = shuffle(def.build());
    session = { mode: 'extra', track: def.track, reversed: true, extra: def, queue: items, missed: [], pass: 1, firstCorrect: 0, total: items.length, pos: 0, roundFails: 0, rounds: 1, correctCount: 0, phase: 'answer', screen: 'item', last: null, kindLabel: def.kind, returnTo: 'extra' };
    view = 'drill'; startTick(); renderDrill();
  }
  function rebuildRound() {
    if (session.mode === 'extra') { session.queue = shuffle(session.missed.slice()); session.missed = []; session.pass++; }
    else if (session.mode === 'personal') { session.queue = session.hard ? shuffle(session.allItems.slice()) : shuffle(session.missed.slice()); session.missed = []; session.pass++; }
    else if (session.mode === 'category') session.queue = orderedRound(trk(session.track), session.cat);
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
    var p = prog(session.track);
    if (session.mode === 'review') { p.reviewsDone++; saveState(); }
    else if (session.mode === 'review2') { p.reviews2Done++; saveState(); }
    else { if (p.completed.indexOf(session.cat.id) === -1) p.completed.push(session.cat.id); p.attempts[session.cat.id] = session.rounds; saveState(); }
    session.screen = 'done'; renderDrill();
  }
  function recordExtra() {
    var p = prog(session.track), id = session.extra.id, e = p.extra[id] || { attempts: 0, best: 0, last: 0, total: session.total };
    e.attempts++; e.last = session.firstCorrect; e.best = Math.max(e.best, session.firstCorrect); e.total = session.total;
    p.extra[id] = e; saveState();
  }
  function leaveDrill() {
    var to = session ? session.returnTo : 'home'; timer.stop(); stopTick(); session = null;
    go(to, to === 'extra' ? renderExtra : (to === 'personal' ? renderPersonal : renderHome));
  }

  function drillTop() {
    var chip = session.mode === 'category' ? session.cat.level : (session.mode === 'extra' ? 'Extra' : (session.mode === 'personal' ? 'Mine' : (session.mode === 'review2' ? (session.grammar ? 'No hints' : 'Reverse') : 'Review')));
    var title = session.mode === 'category' ? shortName(session.cat.title) : (session.mode === 'extra' ? session.extra.title : (session.mode === 'personal' ? session.personalName : 'Checkpoint'));
    var item = session.screen === 'item' ? session.queue[session.pos] : null;
    var th = session.grammar && item && item.cat && item.cat.theory ? '<button class="icon-btn" data-action="theory-drill" aria-label="Theory" title="Theory">' + ICON.book + '</button>' : '';
    return '<header class="sub-head"><button class="icon-btn" data-action="exit" aria-label="Close">' + ICON.x + '</button>' +
      '<div class="sub-t"><div class="chip-s">' + chip + '</div><div class="t">' + title + '</div></div>' +
      '<div class="clock"><span class="rec"></span><span id="clock">' + fmtHours(timer.liveMs()) + '</span></div>' + th + '</header>';
  }

  function renderDrill() {
    paint(session.track === 'grammar' ? 'grammar' : 'vocab');
    if (session.screen === 'refill') { timer.mark(); return renderRefill(); }
    if (session.screen === 'done') { timer.stop(); stopTick(); return renderDone(); }
    if (session.phase === 'spell') { timer.mark(); return renderSpell(); }
    timer.mark();
    renderItem();
  }

  function renderItem() {
    var item = session.queue[session.pos], total = session.queue.length, pct = Math.round(session.pos / total * 100);
    var revealing = session.phase === 'reveal';
    var passed = revealing && (session.last.correct || session.last.selfCorrected);
    var html = drillTop();
    html += '<div class="progress"><i style="width:' + pct + '%"></i></div>';
    html += '<div class="count">' + (session.pos + 1) + ' / ' + total + '</div>';
    html += session.grammar ? sentenceCard(item, revealing, passed) : wordCard(item, revealing, passed);
    html += '<div class="entry">';
    if (revealing) {
      html += '<input value="' + escapeHtml(session.last.input) + '" readonly>';
      html += '<button class="btn primary block" data-action="next">Next</button>';
      if (session.mode !== 'extra' && !session.last.correct && !session.last.selfCorrected) html += '<button class="btn ghost block" type="button" data-action="self">I had it right</button>';
    } else {
      var ph = session.grammar ? 'fill the gap…' : (session.reversed ? 'type it in Italian…' : 'type the meaning in Spanish…');
      html += '<form id="answer-form" autocomplete="off"><input id="answer" placeholder="' + ph + '" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go">';
      html += '<button class="btn primary block" type="submit">Check</button></form>';
      html += '<button class="btn ghost block" type="button" data-action="idk">I don’t know</button>';
    }
    show(html + '</div>', false);
    var f = revealing ? root.querySelector('[data-action="next"]') : root.querySelector('#answer');
    if (f) f.focus();
  }

  function wordCard(item, revealing, passed) {
    var reversed = session.reversed;
    var promptText = reversed ? item.prompt : item.it;
    var kind = reversed ? session.kindLabel : (item.it.indexOf(' ') !== -1 ? 'Expression' : 'Word');
    var html = '<div class="prompt' + (revealing ? (passed ? ' ok' : ' no') : '') + '"><div class="kind">' + kind + '</div>';
    html += '<div class="word">' + escapeHtml(promptText) + '</div><div class="verdict">';
    if (revealing) {
      if (session.last.correct) html += '<span class="badge ok-b">' + ICON.check + ' Correct</span>';
      else if (session.last.selfCorrected) { html += '<span class="badge ok-b">' + ICON.check + ' Counted as correct</span><div class="answer">' + escapeHtml(reversed ? item.accepted[0] : item.es.join(', ')) + '</div><div class="your">kept as a pass — no fail recorded</div>'; }
      else {
        html += '<span class="badge no-b">' + ICON.x + ' Not quite</span>';
        html += '<div class="answer">' + escapeHtml(reversed ? item.accepted[0] : item.es.join(', ')) + '</div>';
        if (session.last.input) html += '<div class="your">you wrote <s>' + escapeHtml(session.last.input) + '</s></div>';
      }
      if (item.note) html += '<div class="note">' + fmtNote(item.note) + '</div>';
    }
    return html + '</div></div>';
  }

  // Grammar: the Italian sentence with its gap, the cue (hidden in the no-hints round) and the Spanish meaning.
  function sentenceHtml(item, fill) {
    var gap = fill == null ? '<span class="gap"></span>' : '<span class="gap filled">' + escapeHtml(fill) + '</span>';
    return item.q.split('___').map(escapeHtml).join(gap);
  }
  function sentenceCard(item, revealing, passed) {
    var last = session.last, shown = (revealing && last.match) || item.a[0];
    var kind = session.mode === 'category' ? 'Fill the gap' : item.topic;
    var html = '<div class="prompt gram' + (revealing ? (passed ? ' ok' : ' no') : '') + '"><div class="kind">' + escapeHtml(kind) + '</div>';
    html += '<div class="sentence">' + sentenceHtml(item, revealing ? shown : null) + '</div>';
    if (item.cue && !session.hideCue) html += '<div class="cue">' + escapeHtml(item.cue) + '</div>';
    html += '<div class="es">' + escapeHtml(item.es) + '</div><div class="verdict">';
    if (revealing) {
      if (last.correct) html += '<span class="badge ok-b">' + ICON.check + ' Correct</span>';
      else if (last.selfCorrected) html += '<span class="badge ok-b">' + ICON.check + ' Counted as correct</span><div class="your">kept as a pass — no fail recorded</div>';
      else {
        html += '<span class="badge no-b">' + ICON.x + ' Not quite</span>';
        if (last.input) html += '<div class="your">you wrote <s>' + escapeHtml(last.input) + '</s>' + (last.accentOnly ? ' — only the accents are off' : '') + '</div>';
      }
      var others = item.a.filter(function (x) { return x !== shown; });
      if (others.length) html += '<div class="your">also right: ' + escapeHtml(others.join(' · ')) + '</div>';
      if (item.note) html += '<div class="note">' + fmtNote(item.note) + '</div>';
    }
    return html + '</div></div>';
  }

  function renderSpell() {
    var item = session.queue[session.pos], total = session.queue.length, pct = Math.round(session.pos / total * 100), variants = item.es.slice(1);
    var html = drillTop();
    html += '<div class="progress"><i style="width:' + pct + '%"></i></div><div class="count">' + (session.pos + 1) + ' / ' + total + '</div>';
    html += '<div class="prompt ok"><div class="spell-tag">✓ correct — now write it in Italian</div>';
    html += '<div class="word">' + escapeHtml(item.es[0]) + '</div>';
    if (variants.length) html += '<div class="variants">' + escapeHtml(variants.join(' · ')) + '</div>';
    if (item.note) html += '<div class="note">' + fmtNote(item.note) + '</div>';
    if (session.spellMiss) html += '<div class="verdict"><span class="badge no-b">' + ICON.x + ' check the spelling</span><div class="answer">' + escapeHtml(item.it) + '</div></div>';
    html += '</div><div class="entry"><form id="spell-form" autocomplete="off"><input id="spell-input" placeholder="type it in Italian…" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go">';
    html += '<button class="btn primary block" type="submit">Continue</button></form></div>';
    show(html, false);
    var el = root.querySelector('#spell-input'); if (el) el.focus();
  }

  function renderRefill() {
    var head, body, btn, unit = session.grammar ? 'sentence' : 'word';
    var whittle = (session.mode === 'extra') || (session.mode === 'personal' && !session.hard);
    if (whittle) { head = 'Just the ones you missed'; body = session.roundFails + ' to go — only the words you got wrong come back, until every one is right.'; btn = 'Keep going'; }
    else if (session.mode === 'category' || (session.mode === 'personal' && session.hard)) { head = session.mode === 'category' ? 'The category refills' : 'Redo the whole set'; body = session.roundFails + ' missed this round. The whole set comes back — every ' + unit + ', until you clear it in one clean pass.'; btn = 'Go again'; }
    else { head = 'The round repeats'; body = session.roundFails + ' missed this round. The whole set comes back — every ' + unit + ', until you clear it in one clean pass.'; btn = 'Go again'; }
    var html = drillTop() + '<div class="overlay"><div class="mark warn">' + ICON.cycle + '</div><h2>' + head + '</h2><p>' + body + '</p>';
    html += '<button class="btn primary block" data-action="continue">' + btn + '</button></div>';
    show(html, false); var b = root.querySelector('[data-action="continue"]'); if (b) b.focus();
  }
  function renderDone() {
    var title, msg;
    if (session.mode === 'extra') { title = 'Extra cleared'; msg = 'All ' + session.total + ' done in “' + escapeHtml(session.extra.title) + '” — you knew ' + session.firstCorrect + ' / ' + session.total + ' on the first pass.'; }
    else if (session.mode === 'review2') { title = session.grammar ? 'No-hints round complete' : 'Reverse round complete'; msg = session.grammar ? 'Cleared — every sentence completed from the Spanish alone.' : 'Cleared — every word produced in Italian.'; }
    else if (session.mode === 'review') { title = 'Review round complete'; msg = 'Checkpoint cleared — the ' + (session.grammar ? 'no-hints' : 'reverse') + ' round is next.'; }
    else if (session.mode === 'personal') { title = 'Revised!'; msg = 'You cleared all ' + session.total + ' words in “' + escapeHtml(session.personalName) + '”.'; }
    else { title = 'Category complete'; msg = 'Clean round — “' + escapeHtml(shortName(session.cat.title)) + '” is done' + (session.rounds > 1 ? ' after ' + session.rounds + ' tries' : '') + '. The next one is unlocked.'; }
    var back = (session.returnTo === 'extra') ? 'Back to extra' : (session.returnTo === 'personal' ? 'Back to my words' : 'Back to your path');
    var html = '<div class="topbar-min">' + themeBtn() + '</div><div class="overlay"><div class="mark good">' + ICON.check + '</div><h2>' + title + '</h2><p>' + msg + '</p>';
    html += '<button class="btn primary block" data-action="finish">' + back + '</button></div>';
    show(html, false); var b = root.querySelector('[data-action="finish"]'); if (b) b.focus();
  }

  /* ---------- interactions ---------- */
  function submitAnswer() {
    var inp = root.querySelector('#answer'); if (!inp) return;
    var val = inp.value.trim(); if (!val) { inp.focus(); return; }
    var item = session.queue[session.pos], p = prog(session.track), match = session.grammar ? matchForm(val, item.a) : null;
    var correct = session.grammar ? !!match : (session.reversed ? isStrictMatch(val, item.accepted) : isCorrect(val, item.es));
    session.last = { correct: correct, input: val, item: item, selfCorrected: false, idk: false, match: match, accentOnly: session.grammar && !correct && accentOnlyMiss(val, item.a) };
    if (correct) session.correctCount++;
    if (session.grammar) {
      if (!correct) { session.roundFails++; if (session.mode !== 'review2') { p.fails[item.id] = (p.fails[item.id] || 0) + 1; saveState(); } }   // no-hints round records nothing
      session.phase = 'reveal';
    } else if (session.reversed) {
      if (session.mode === 'extra') {
        if (correct) { if (session.pass === 1) session.firstCorrect++; }
        else { p.extraFails[item.id] = (p.extraFails[item.id] || 0) + 1; session.missed.push(item); saveState(); }
      } else if (!correct) session.roundFails++;   // review2: drives the refill-until-clean
      session.phase = 'reveal';
    } else if (correct) { session.phase = 'spell'; session.spellMiss = false; }
    else {
      if (session.mode === 'personal') { if (session.hard) session.roundFails++; else session.missed.push(item); }
      else { p.fails[item.id] = (p.fails[item.id] || 0) + 1; session.roundFails++; saveState(); }
      session.phase = 'reveal';
    }
    renderDrill();
  }
  function idk() {
    if (session.phase !== 'answer') return;
    var item = session.queue[session.pos], p = prog(session.track);
    session.last = { correct: false, input: '', item: item, selfCorrected: false, idk: true };
    if (session.mode === 'personal') { if (session.hard) session.roundFails++; else session.missed.push(item); }
    else if (session.grammar) { session.roundFails++; if (session.mode !== 'review2') { p.fails[item.id] = (p.fails[item.id] || 0) + 1; saveState(); } }
    else if (!session.reversed) { p.fails[item.id] = (p.fails[item.id] || 0) + 1; session.roundFails++; saveState(); }
    else if (session.mode === 'extra') { p.extraFails[item.id] = (p.extraFails[item.id] || 0) + 1; session.missed.push(item); saveState(); }
    else session.roundFails++;   // review2 idk
    session.phase = 'reveal'; renderDrill();
  }
  function selfCorrect() {
    if (session.phase !== 'reveal' || !session.last || session.last.correct || session.last.selfCorrected) return;
    if (session.mode === 'extra') return;                 // extras don't offer an override
    var it = session.last.item, p = prog(session.track);
    if (session.mode === 'personal') {
      if (session.hard) session.roundFails = Math.max(0, session.roundFails - 1);
      else for (var k = session.missed.length - 1; k >= 0; k--) if (session.missed[k].id === it.id) { session.missed.splice(k, 1); break; }
    } else {
      if (!session.reversed && session.mode !== 'review2' && p.fails[it.id] > 0) { p.fails[it.id]--; if (p.fails[it.id] === 0) delete p.fails[it.id]; }
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
      var it = session.last.item, passed = session.last.correct || session.last.selfCorrected, p = prog(session.track);
      if (session.failedSet[it.id] && passed) {
        p.recoveryMarks[it.id] = (p.recoveryMarks[it.id] || 0) + 1;
        if (p.recoveryMarks[it.id] >= 2) { delete p.fails[it.id]; delete p.recoveryMarks[it.id]; }
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
  function fmtNote(s) { return escapeHtml(s).replace(/\*([^*]+)\*/g, '<em>$1</em>'); }   // notes mark Italian forms as *word*

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
  // A backup from an older version restores what it has; whatever it predates stays as it is on this
  // device: grammar (and the training time spent on it), which theory has been read, the reading list.
  function keepNewer(b) {
    if (!('grammar' in b)) {
      var g = state.grammar, ms = g.reviewMs;
      for (var k in g.categoryMs) ms += g.categoryMs[k] || 0;
      b.grammar = g;
      b.totalMs = (typeof b.totalMs === 'number' ? b.totalMs : 0) + ms;
    } else if (b.grammar && typeof b.grammar === 'object' && !b.grammar.theoryRead) b.grammar.theoryRead = state.grammar.theoryRead;
    if (!('books' in b)) b.books = state.books;
  }
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var incoming;
      try { incoming = JSON.parse(reader.result); } catch (e) { incoming = null; }
      if (!incoming || typeof incoming !== 'object' || !('completed' in incoming || 'fails' in incoming || 'totalMs' in incoming)) {
        alert('That file is not a valid Ripasso backup.'); return;
      }
      var msg = !('grammar' in incoming) ? 'This backup is from before grammar was added. Replace your vocabulary progress with it? Your grammar progress and reading list on this device stay as they are.'
        : (!('books' in incoming) ? 'Replace your progress with this backup? It predates the reading list, so your reading list on this device stays as it is.'
          : 'Replace your current progress with this backup? This cannot be undone.');
      if (!confirm(msg)) return;
      keepNewer(incoming);
      try { localStorage.setItem(STATE_KEY, JSON.stringify(incoming)); } catch (e) {}
      state = loadState(); view = 'home'; renderHome();
    };
    reader.readAsText(file);
  }
  function syncThemeColor() {   // the phone's status bar takes the page color
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f7f5f2');
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute('data-theme');
    var next = cur === 'light' ? 'dark' : (cur === 'dark' ? '' : 'light');
    if (next) document.documentElement.setAttribute('data-theme', next); else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    syncThemeColor();
  }
  // Switch between screens: back to the top, the new content sliding in. (A CSS animation rather than
  // a view transition: those swallow taps while they run, and this screen is live at once.)
  function go(v, render) {
    view = v; if (v !== 'home') window.scrollTo(0, 0);
    entering = true; render(); entering = false;
  }

  root.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]'); if (!t) return;
    var a = t.getAttribute('data-action');
    if (a === 'theme') return toggleTheme();
    if (a === 'track') { setTrack(t.getAttribute('data-id')); return go(view, view === 'stats' ? renderStats : renderHome); }
    if (a === 'fold') { showDone[track] = !showDone[track]; return renderHome(true); }
    if (a === 'stats') return go('stats', renderStats);
    if (a === 'extras') return go('extra', renderExtra);
    if (a === 'books') return go('books', renderBooks);
    if (a === 'book') { cycleBook(t.getAttribute('data-id')); return renderBooks(); }
    if (a === 'extrafails') return go('extrafails', renderExtraFails);
    if (a === 'export') return exportData();
    if (a === 'personal') return go('personal', renderPersonal);
    if (a === 'p-new') { var pn = prompt('Name your category:'); if (pn && pn.trim()) { var pcat = { id: genId('p'), name: pn.trim(), items: [] }; state.personal.push(pcat); saveState(); personalCtx = pcat.id; view = 'personal-add'; renderPersonalAdd(); } return; }
    if (a === 'p-add') { personalCtx = t.getAttribute('data-id'); view = 'personal-add'; window.scrollTo(0, 0); return renderPersonalAdd(); }
    if (a === 'p-practice') { var ppc = personalById(t.getAttribute('data-id')); if (ppc && ppc.items.length) startPersonalDrill(ppc); return; }
    if (a === 'p-del') { var pdid = t.getAttribute('data-id'), pdc = personalById(pdid); if (pdc && confirm('Delete “' + pdc.name + '” and all its words?')) { state.personal = state.personal.filter(function (x) { return x.id !== pdid; }); saveState(); renderPersonal(); } return; }
    if (a === 'p-delword') { var wcc = personalById(personalCtx); if (wcc) { var wid = t.getAttribute('data-id'); wcc.items = wcc.items.filter(function (x) { return x.id !== wid; }); saveState(); renderPersonalAdd(); } return; }
    if (a === 'p-mode') { var mc = personalById(t.getAttribute('data-id')); if (mc) { mc.hard = !mc.hard; saveState(); renderPersonal(); } return; }
    if (a === 'gohome') return go('home', renderHome);
    if (a === 'open') { var oid = t.getAttribute('data-id'), ot = trk(track), c = ot.cats.filter(function (x) { return String(x.id) === oid; })[0]; if (c) startCategory(ot, c); return; }
    if (a === 'theory') return openTheory(grammarCat(t.getAttribute('data-id')), 'home');
    if (a === 'theory-drill') return openTheory(session && session.queue[session.pos].cat, 'drill');
    if (a === 'theory-close') return closeTheory();
    if (a === 'theory-start') return theoryStart();
    if (a === 'extra') { var d = extraById(t.getAttribute('data-id')); if (d) startExtra(d); return; }
    if (a === 'review') return startReview(trk(track));
    if (a === 'review2') return startReview2(trk(track));
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
    var timing = view === 'theory' || (view === 'drill' && session && session.screen !== 'done');
    if (!timing) return;
    if (document.hidden) timer.stop(); else timer.arm();
  });
  window.addEventListener('beforeunload', function () { if (view === 'drill' || view === 'theory') timer.stop(); });
  var lastScrollMark = 0;
  window.addEventListener('scroll', function () {   // reading theory: scrolling shows you're still there
    if (view !== 'theory' || Date.now() - lastScrollMark < 10000) return;
    lastScrollMark = Date.now(); timer.mark();
  }, { passive: true });

  (function initTheme() { var t; try { t = localStorage.getItem(THEME_KEY); } catch (e) { t = null; } if (t) document.documentElement.setAttribute('data-theme', t); syncThemeColor(); })();
  (function initTrack() { var t; try { t = localStorage.getItem(TRACK_KEY); } catch (e) { t = null; } track = t === 'grammar' ? 'grammar' : 'vocab'; })();
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncThemeColor);

  // Ask the browser to keep our local data (reduces the chance it's auto-evicted).
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});

  fetch('data.json').then(function (r) { return r.json(); }).then(function (d) {
    data = d; data.allItems = []; data.itemById = {};
    data.categories.forEach(function (c) { c.items.forEach(function (it) { data.allItems.push(it); data.itemById[it.id] = it; }); });
    data.grammar = d.grammar || { levels: [], categories: [] };   // a data.json cached before the update has none
    data.books = d.books || [];
    data.grammarItemById = {};
    data.grammar.categories.forEach(function (c) { var topic = shortName(c.title); c.items.forEach(function (it) { it.topic = topic; it.cat = c; data.grammarItemById[it.id] = it; }); });
    data.extraItemById = {};
    EXTRAS.forEach(function (def) { def.build().forEach(function (it) { data.extraItemById[it.id] = { prompt: it.prompt, it: it.it }; }); });
    state = loadState(); go('home', renderHome);
  }).catch(function () { root.innerHTML = '<div class="overlay"><h2>Could not load data</h2><p>Serve this folder over http (see README) and reload.</p></div>'; });

  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
})();
