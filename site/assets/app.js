/* ==========================================================================
   冰棍鬼畜作品集 — front-end
   Hash routes:  #/                首页（作品列表 + 筛选 + 关于）
                 #/work/<id>       单部作品（播放器 + 简介 + 制作信息 + 歌词）
                 #/lyrics          歌词全集（可搜索）
   ========================================================================== */
(function () {
  'use strict';

  var viewHome = document.getElementById('view-home');
  var viewWork = document.getElementById('view-work');
  var viewLyrics = document.getElementById('view-lyrics');
  var topbarProgress = document.getElementById('topbarProgress');
  var footerNote = document.getElementById('footerNote');

  var state = {
    data: null,
    route: { name: 'home' },
    filter: 'all',
    query: '',
    homeScroll: 0,
    detail: null,
    autoplay: false,
    pendingScroll: '',
    pendingLyrics: ''
  };

  var PROGRESS_KEY = 'bggc-progress-v1';
  var syncNavRaf = 0;

  /* ------------------------------------------------------------------ utils */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  function clock(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s).padStart(2, '0');
  }
  function humanBytes(b) {
    if (!b) return '';
    if (b >= 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(2) + ' GB';
    if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + ' MB';
    return Math.max(1, Math.round(b / 1024)) + ' KB';
  }

  function byId(id) {
    if (!state.data) return null;
    var list = state.data.works;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function indexOf(id) {
    var list = state.data.works;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return i;
    return -1;
  }
  function nextOf(item) {
    var i = indexOf(item.id);
    return i >= 0 ? state.data.works[i + 1] || null : null;
  }
  function prevOf(item) {
    var i = indexOf(item.id);
    return i > 0 ? state.data.works[i - 1] : null;
  }
  function seriesById(id) {
    var list = state.data.series || (state.data.site && state.data.site.series) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function countOfSeries(id) {
    return state.data.works.filter(function (w) { return w.series === id; }).length;
  }

  /* progress memory ------------------------------------------------------- */
  function readProgress() {
    try { return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeProgress(p) {
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
  }
  function savedTime(id) {
    var p = readProgress()[id];
    return p && p.t > 5 ? p.t : 0;
  }
  function saveTime(id, t, d) {
    var p = readProgress();
    if (!t || t < 5 || (d && t > d - 15)) delete p[id];
    else p[id] = { t: Math.round(t), d: Math.round(d || 0), at: Date.now() };
    writeProgress(p);
  }

  /* ------------------------------------------------------------------ icons */
  var ICO = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6c0 .8.9 1.3 1.6.9l10.6-6.8c.6-.4.6-1.4 0-1.8L9.6 4.3C8.9 3.9 8 4.4 8 5.2z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 6l-6 6 6 6"/></svg>',
    lyric: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h10M4 11h13M4 16h8"/><circle cx="18.2" cy="16.5" r="2.3"/><path d="M20.5 16.5V9.6l-3.4 1"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.4"/><path d="M15 6.4V5.5A2.5 2.5 0 0 0 12.5 3H5.5A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15h.9"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4 20 20"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 11l6-3.2v8.4l-6-3.2z"/></svg>',
    silent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 11l6-3.2v8.4l-6-3.2zM4 20 20 4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M13 6l6 6-6 6"/></svg>'
  };

  /* --------------------------------------------------------------- home view */
  function cardHTML(w) {
    var s = seriesById(w.series);
    var topicBits = [];
    if (w.kicker) topicBits.push('<span class="kd">' + esc(w.kicker) + '</span>');
    if (w.subtitle) topicBits.push(esc(w.subtitle));
    else if (w.summary) topicBits.push(esc(w.summary.slice(0, 34) + '…'));

    var chips = '';
    var shown = (w.chips || []).slice(0, 3);
    for (var i = 0; i < shown.length; i++) chips += '<li class="chip">' + esc(shown[i]) + '</li>';

    var t = savedTime(w.id);
    var prog = t && w.duration
      ? '<span class="card-progress" style="width:' + clamp((t / w.duration) * 100, 2, 100).toFixed(1) + '%"></span>'
      : '';

    var lyricBtn = w.stanzaCount
      ? '<a class="mini" href="#/work/' + w.id + '" data-anchor="lyrics" data-target="' + w.id + '">' +
        ICO.lyric + ' 歌词 ' + w.stanzaCount + ' 段</a>'
      : '<span class="mini" aria-disabled="true" title="本作没有歌词">' + ICO.silent + ' 纯画面</span>';

    return '' +
      '<article class="card" data-id="' + w.id + '" data-series="' + esc(w.series) + '">' +
        '<div class="card-cover">' +
          '<a class="cover-link" href="#/work/' + w.id + '" aria-label="打开 ' + esc(w.title) + '">' +
            '<img src="' + w.coverSm + '" alt="' + esc(w.title) + ' 封面" loading="lazy" width="720" height="405">' +
          '</a>' +
          '<span class="card-num">' + esc(w.num) + '</span>' +
          (w.stanzaCount ? '' : '<span class="card-silent">无歌词</span>') +
          '<button class="card-play" type="button" data-play="' + w.id + '" aria-label="播放 ' + esc(w.title) + '">' + ICO.play + '</button>' +
          '<span class="card-dur">' + esc(w.durationText) + '</span>' +
          prog +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title"><a href="#/work/' + w.id + '">' + esc(w.title) + '</a></h3>' +
          '<p class="card-topic">' + topicBits.join(' · ') + '</p>' +
          (chips ? '<ul class="chips">' + chips + '</ul>' : '') +
          '<div class="card-actions">' +
            '<a class="mini primary" href="#/work/' + w.id + '" data-play="' + w.id + '">' + ICO.play + ' 播放</a>' +
            lyricBtn +
            (s ? '<span class="mini" style="margin-left:auto;cursor:default;border-style:dashed">' + esc(s.name) + '</span>' : '') +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function tileHTML(s) {
    var n = countOfSeries(s.id);
    var cls = s.accent === 'dark' ? 'chip-dark' : 'chip-pink';
    return '' +
      '<button class="tile" type="button" data-filter="' + s.id + '" aria-pressed="false">' +
        '<span class="tile-kicker">' + esc(s.kicker) + '</span>' +
        '<h3>' + esc(s.name) + '<em>' + esc(s.suffix) + '</em></h3>' +
        '<p class="tile-desc">' + esc(s.blurb) + '</p>' +
        '<span class="tile-foot">' +
          '<span class="tile-count"><b>' + n + '</b> 部作品 · 共 ' +
            clock(state.data.works.filter(function (w) { return w.series === s.id; })
              .reduce(function (a, w) { return a + (w.duration || 0); }, 0)) + '</span>' +
          '<span class="tile-go"><span class="series-chip ' + cls + '">筛选</span> →</span>' +
        '</span>' +
      '</button>';
  }

  function quoteHTML(line, src, id, num) {
    return '' +
      '<a class="quote" href="#/work/' + id + '">' +
        '<p>' + esc(line) + '</p>' +
        '<span class="quote-src"><i>▍</i>' + esc(src) + ' · ' + esc(num) + '</span>' +
      '</a>';
  }

  function renderHome() {
    var d = state.data;
    var site = d.site;
    var st = d.stats;
    var works = d.works;
    var fan = [works[6] || works[0], works[0], works[4] || works[1]].filter(Boolean);

    var filters = '<button class="filter is-on" type="button" data-filter="all" aria-pressed="true">' +
      '全部 <b>' + works.length + '</b></button>';
    for (var i = 0; i < site.series.length; i++) {
      filters += '<button class="filter" type="button" data-filter="' + site.series[i].id + '" aria-pressed="false">' +
        esc(site.series[i].name) + ' <b>' + countOfSeries(site.series[i].id) + '</b></button>';
    }

    var quotes = '';
    var picks = [
      ['别惹木桶饭🚫 别惹小药娘😾', '别惹xyn', 'gc01', '01'],
      ['宛平大道中～藥娘如潮湧', '宛平大道東', 'gc07', '07'],
      ['理想在 心中烧 / 几十个 暑和寒', '回龙苦行观', 'gc02', '02']
    ];
    for (var q = 0; q < picks.length; q++) {
      var w = byId(picks[q][2]) || { id: picks[q][2], num: picks[q][3] };
      quotes += quoteHTML(picks[q][0], picks[q][1], w.id, w.num || picks[q][3]);
    }

    var html = '' +
      '<div class="wrap">' +
        '<section class="hero">' +
          '<div class="hero-copy">' +
            '<p class="kicker">' + esc(site.kicker) + '</p>' +
            '<h1><span class="hl">冰棍鬼畜</span><br><span class="hl hl-2">作品集</span></h1>' +
            '<p class="lede">' + esc(site.lede) + '</p>' +
            '<div class="pills">' +
              '<span class="pill"><b>' + st.works + '</b> 部作品</span>' +
              '<span class="pill"><b>' + st.series + '</b> 个系列</span>' +
              '<span class="pill"><b>' + st.lyricsWorks + '</b> 首有词</span>' +
              '<span class="pill"><b>' + st.stanzas + '</b> 段歌词</span>' +
              '<span class="pill"><b>' + st.durationText + '</b> 总时长</span>' +
              '<span class="pill pill-author">Made by ' + esc(site.author) + '</span>' +
            '</div>' +
            '<div class="hero-actions">' +
              '<a class="btn btn-primary" href="#/work/' + works[0].id + '" data-play="' + works[0].id + '">' + ICO.play + ' 从第一部开始看</a>' +
              '<a class="btn btn-ghost" href="#/lyrics">' + ICO.lyric + ' 歌词全集</a>' +
            '</div>' +
          '</div>' +
          '<div class="hero-stack" aria-hidden="true">' +
            '<figure class="hero-card hero-card-1"><img src="' + fan[0].coverSm + '" alt=""></figure>' +
            '<figure class="hero-card hero-card-2"><img src="' + fan[1].coverSm + '" alt=""></figure>' +
            '<figure class="hero-card hero-card-3"><img src="' + fan[2].coverSm + '" alt=""></figure>' +
            '<span class="hero-note">' + st.works + ' 部 · ' + st.durationText + ' · ' + st.lines + ' 行歌词</span>' +
          '</div>' +
        '</section>' +

        '<section class="section" id="catalogues">' +
          '<div class="section-head">' +
            '<div><h2><span class="mark"></span>两个系列</h2>' +
            '<p class="sub">按内容分成两组：一组是可以跟着唱的药圈金曲，一组是围绕同一个人物的连续开火。点一下即按系列筛选下面的作品列表。</p></div>' +
            '<span class="count">共 ' + site.series.length + ' 个系列</span>' +
          '</div>' +
          '<div class="tiles">' + site.series.map(tileHTML).join('') + '</div>' +
        '</section>' +

        '<section class="section" id="works">' +
          '<div class="section-head">' +
            '<div><h2><span class="mark"></span>作品列表</h2>' +
            '<p class="sub">按发布顺序排列，从旧到新。点封面进单部作品页：在线播放、制作信息与完整歌词都在那一页。</p></div>' +
            '<span class="count" id="worksCount">' + works.length + ' 部作品</span>' +
          '</div>' +
          '<div class="toolbar">' +
            '<div class="filters" role="group" aria-label="按系列筛选">' + filters + '</div>' +
            '<span class="toolbar-note" id="filterNote">顺序：' + works[0].num + ' → ' + works[works.length - 1].num + '</span>' +
          '</div>' +
          '<div class="grid" id="worksGrid">' + works.map(cardHTML).join('') + '</div>' +
        '</section>' +

        '<section class="section" id="chorus">' +
          '<div class="section-head">' +
            '<div><h2><span class="mark"></span>三句记得住的</h2>' +
            '<p class="sub">' + st.works + ' 部作品里最容易被记住的几句。点进去看它整首写成什么样。</p></div>' +
            '<a class="count" href="#/lyrics">歌词全集 →</a>' +
          '</div>' +
          '<div class="quotes">' + quotes + '</div>' +
        '</section>' +

        '<section class="section" id="about">' +
          '<div class="about">' +
            '<div class="about-main">' +
              '<h2>关于这个作品集</h2>' +
              '<p>这里收的是<b>' + esc(site.author) + '</b>（' + esc(site.handle) + '）的鬼畜作品：' +
                '<strong>' + st.works + ' 部</strong>，按发布顺序从旧到新排列，分属<strong>' + st.series + ' 个系列</strong>。' +
                '每部作品都有封面、简介、制作信息与完整歌词，视频以 HLS 切片在线播放。</p>' +
              '<p class="about-rank">' + esc(site.notice) + '</p>' +
              '<p>站内共收 <strong>' + st.lyricsWorks + ' 首填词</strong>、<strong>' + st.stanzas + ' 段歌词</strong>（' +
                st.lines + ' 行），全部可以在<a href="#/lyrics" style="color:var(--blue-deep);font-weight:700">歌词全集</a>里按关键词搜到。' +
                '整站视频合计 <strong>' + st.sizeText + '</strong>、总时长 <strong>' + st.durationText + '</strong>。</p>' +
              '<p>想加新作品：把视频与封面放进 <code style="background:#f7faff;border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:13px">content/sources.local.json</code>，' +
                '跑一次 <code style="background:#f7faff;border:1px solid var(--line);border-radius:6px;padding:1px 6px;font-size:13px">node tools/prepare-media.mjs</code> 再 push 即可。</p>' +
            '</div>' +
            '<div class="about-meta">' +
              '<span class="about-badge">' + st.works + ' 部作品 · ' + st.lines + ' 行歌词</span>' +
              '<dl>' +
                '<dt>制作</dt><dd>' + esc(site.author) + '</dd>' +
                '<dt>账号</dt><dd>' + esc(site.handle) + '</dd>' +
                '<dt>系列</dt><dd>' + site.series.map(function (s) { return esc(s.name); }).join(' / ') + '</dd>' +
                '<dt>更新到</dt><dd>第 ' + works[works.length - 1].num + ' 部 · ' + esc(works[works.length - 1].title) + '</dd>' +
                '<dt>总时长</dt><dd>' + st.durationText + '</dd>' +
                '<dt>视频</dt><dd>HLS 切片 · ' + st.sizeText + '</dd>' +
              '</dl>' +
              '<a class="btn btn-ghost btn-sm" href="#/lyrics">' + ICO.lyric + ' 打开歌词全集</a>' +
            '</div>' +
          '</div>' +
        '</section>' +
      '</div>';

    viewHome.innerHTML = html;
    footerNote.textContent = site.notice;
  }

  /* ---------------------------------------------------------------- filtering */
  function applyFilter(id, opts) {
    opts = opts || {};
    state.filter = id;
    var cards = viewHome.querySelectorAll('#worksGrid .card');
    var shown = 0;
    for (var i = 0; i < cards.length; i++) {
      var on = id === 'all' || cards[i].dataset.series === id;
      cards[i].classList.toggle('is-hidden', !on);
      if (on) shown++;
    }
    var btns = viewHome.querySelectorAll('[data-filter]');
    for (var j = 0; j < btns.length; j++) {
      var on2 = btns[j].dataset.filter === id;
      btns[j].classList.toggle('is-on', on2);
      if (btns[j].classList.contains('filter')) btns[j].setAttribute('aria-pressed', on2 ? 'true' : 'false');
      if (btns[j].classList.contains('tile')) btns[j].setAttribute('aria-pressed', on2 ? 'true' : 'false');
    }
    var name = id === 'all' ? '全部' : (seriesById(id) || {}).name || id;
    var countEl = document.getElementById('worksCount');
    if (countEl) countEl.textContent = shown + ' 部作品';
    var noteEl = document.getElementById('filterNote');
    if (noteEl) {
      noteEl.textContent = id === 'all'
        ? '顺序：' + state.data.works[0].num + ' → ' + state.data.works[state.data.works.length - 1].num
        : '筛选：' + name + ' · ' + shown + ' 部';
    }
    if (opts.scroll) {
      var sec = document.getElementById('works');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /* ------------------------------------------------------------- detail view */
  function stanzaHTML(st) {
    var cls = 'stanza';
    if (/副歌|叠句|重唱/.test(st.label || '')) cls += ' is-hook';
    if (/念/.test(st.label || '')) cls += ' is-spoken';
    var lines = '';
    for (var i = 0; i < st.lines.length; i++) {
      lines += '<p class="stanza-line">' + esc(st.lines[i]) + '</p>';
    }
    return '<div class="' + cls + '">' +
      '<span class="stanza-label">' + esc(st.label || '歌词') + '</span>' + lines + '</div>';
  }

  function lyricGridHTML(w) {
    if (!w.stanzaCount) {
      return '<div class="lyric-empty">' +
        '<span class="ico">' + ICO.silent + '</span>' +
        '<span>' + esc(w.lyricsNote || '本作没有歌词。') + '</span></div>';
    }
    return w.lyrics.map(stanzaHTML).join('');
  }

  function creditHTML(c) {
    var v = esc(c.v);
    if (c.bv) {
      v = '<a href="https://www.bilibili.com/video/' + encodeURIComponent(c.bv) + '" target="_blank" rel="noopener noreferrer">' +
        esc(c.bv) + '</a> <span style="color:var(--ink-3);font-size:11.5px">（bilibili）</span>';
    }
    return '<div class="credit"><dt>' + esc(c.k) + '</dt><dd>' + v + '</dd></div>';
  }

  function renderWork(w) {
    var s = seriesById(w.series);
    var prev = prevOf(w);
    var next = nextOf(w);
    var chips = '';
    for (var i = 0; i < (w.chips || []).length; i++) chips += '<li class="chip">' + esc(w.chips[i]) + '</li>';

    var credits = '';
    for (var j = 0; j < (w.credits || []).length; j++) credits += creditHTML(w.credits[j]);

    var navPrev = prev
      ? '<a class="btn btn-ghost" href="#/work/' + prev.id + '">← ' + esc(prev.num) + '</a>'
      : '<a class="btn btn-ghost" aria-disabled="true">← 已是第一部</a>';
    var navNext = next
      ? '<a class="btn btn-ghost" href="#/work/' + next.id + '" data-play="' + next.id + '">' + esc(next.num) + ' →</a>'
      : '<a class="btn btn-ghost" aria-disabled="true">已是最后一部 →</a>';

    var lyricBlock = w.stanzaCount
      ? '<div class="lyrics-head">' +
          '<h2><span class="mark"></span>歌词<span class="pages">' + w.stanzaCount + ' 段 · ' + w.lineCount + ' 行</span></h2>' +
          '<div class="lyrics-tools">' +
            '<button class="mini" type="button" data-copy="' + w.id + '">' + ICO.copy + ' 复制歌词</button>' +
            '<a class="mini" href="#/lyrics">' + ICO.lyric + ' 歌词全集</a>' +
          '</div>' +
        '</div>' +
        '<div class="lyric-grid">' + lyricGridHTML(w) + '</div>'
      : '<div class="lyrics-head">' +
          '<h2><span class="mark"></span>歌词<span class="pages">无</span></h2>' +
          '<div class="lyrics-tools"><a class="mini" href="#/lyrics">' + ICO.lyric + ' 歌词全集</a></div>' +
        '</div>' +
        '<div class="lyric-grid">' + lyricGridHTML(w) + '</div>';

    viewWork.innerHTML = '' +
      '<div class="wrap detail">' +
        '<a class="back" href="#/">' + ICO.back + ' 返回作品列表</a>' +
        '<header class="detail-head">' +
          '<div class="detail-kicker">' +
            (s ? '<span class="series-chip ' + (s.accent === 'dark' ? 'chip-dark' : 'chip-pink') + '">' + esc(s.name) + '</span>' : '') +
            '<span class="detail-num">第 ' + esc(w.num) + ' 部</span>' +
            '<span class="detail-kind">WORK</span>' +
          '</div>' +
          '<h1>' + esc(w.title) + '</h1>' +
          (w.kicker || w.subtitle
            ? '<p class="topic">' + (w.kicker ? '<b>' + esc(w.kicker) + '</b>' : '') +
              (w.kicker && w.subtitle ? ' · ' : '') + (w.subtitle ? esc(w.subtitle) : '') + '</p>'
            : '') +
        '</header>' +

        '<div class="studio">' +
          '<div class="player-shell">' +
            '<div class="player">' +
              '<video id="vid" controls playsinline preload="metadata" poster="' + w.cover + '"></video>' +
              (next ? '<button class="player-next" type="button" id="nextWorkBtn" hidden>下一部：' + esc(next.title) + ' →</button>' : '') +
            '</div>' +
            '<div class="player-bar">' +
              '<div class="player-meta">' +
                '<span>' + esc(w.durationText) + '</span><span class="dot"></span>' +
                '<span>' + w.width + ' × ' + w.height + '</span><span class="dot"></span>' +
                '<span>' + humanBytes(w.bytes) + '</span><span class="dot"></span>' +
                '<span>' + (w.segments || 0) + ' 段切片</span>' +
                '<span class="resume-chip" id="resumeNote" hidden></span>' +
              '</div>' +
              '<span class="toolbar-note">HLS · 6 秒一段</span>' +
            '</div>' +
          '</div>' +

          '<aside class="info">' +
            '<h2>作品简介</h2>' +
            '<p class="summary">' + esc(w.summary) + '</p>' +
            (chips ? '<ul class="chips">' + chips + '</ul>' : '') +
            '<p class="info-sub">制作信息</p>' +
            '<dl class="credits">' + credits + '</dl>' +
            '<p class="info-sub">歌词</p>' +
            (w.stanzaCount
              ? '<button class="btn btn-ghost btn-block btn-sm" type="button" id="toLyrics">' + ICO.lyric + ' 看歌词 · ' + w.stanzaCount + ' 段</button>'
              : '<p class="summary" style="margin-top:0">本作没有歌词，是一支纯画面短片。</p>') +
            '<div class="ep-nav">' + navPrev + navNext + '</div>' +
          '</aside>' +
        '</div>' +

        '<section class="lyrics-sec" id="lyrics">' + lyricBlock + '</section>' +
      '</div>';

    bindWork(w);
  }

  /* ------------------------------------------------------------ video source */
  /* 线上直接用 HLS 切片（hls.js，逐段拉取）；本地没有切片时退回 mp4（如果配了）。 */
  var hlsInstance = null;

  function destroyHls() {
    if (hlsInstance) {
      try { hlsInstance.destroy(); } catch (e) {}
      hlsInstance = null;
    }
  }

  function showVideoError() {
    var player = document.querySelector('.player');
    if (!player || player.querySelector('.player-error')) return;
    var n = document.createElement('div');
    n.className = 'player-error';
    n.style.cssText = 'position:absolute;inset:0;display:grid;place-content:center;gap:6px;text-align:center;' +
      'color:#dbe6f5;font-size:13.5px;padding:20px;background:#0c1526';
    n.innerHTML = '<strong style="font-size:15px;color:#fff">视频暂时无法播放</strong>' +
      '<span>切片可能尚未生成，或网络中断。可刷新重试。</span>';
    player.appendChild(n);
  }

  function attachSource(vid, w) {
    destroyHls();
    if (!w.hls) { showVideoError(); return; }
    var Hls = window.Hls;
    if (Hls && Hls.isSupported()) {
      hlsInstance = new Hls({ maxBufferLength: 40, backBufferLength: 30, enableWorker: true });
      hlsInstance.loadSource(w.hls);
      hlsInstance.attachMedia(vid);
      hlsInstance.on(Hls.Events.ERROR, function (_e, data) {
        if (data && data.fatal) showVideoError();
      });
      return;
    }
    if (vid.canPlayType('application/vnd.apple.mpegurl')) { vid.src = w.hls; return; }
    showVideoError();
  }

  function bindWork(w) {
    var vid = document.getElementById('vid');
    var resumeNote = document.getElementById('resumeNote');
    var nextBtn = document.getElementById('nextWorkBtn');
    var toLyrics = document.getElementById('toLyrics');

    vid.poster = w.cover;
    attachSource(vid, w);

    var restore = savedTime(w.id);
    var restored = false;
    function applyResume(t) {
      if (restored || !t) return;
      if (!vid.duration || t > vid.duration - 10) return;
      restored = true;
      vid.currentTime = t;
      if (resumeNote) {
        resumeNote.hidden = false;
        resumeNote.textContent = '从 ' + clock(t) + ' 继续';
        setTimeout(function () { resumeNote.hidden = true; }, 6000);
      }
    }
    vid.addEventListener('loadedmetadata', function () { applyResume(restore); });
    vid.addEventListener('timeupdate', function () {
      if (!vid.duration) return;
      if (!vid.dataset.t || Date.now() - Number(vid.dataset.t) > 5000) {
        vid.dataset.t = Date.now();
        saveTime(w.id, vid.currentTime, vid.duration);
      }
    });
    vid.addEventListener('pause', function () { saveTime(w.id, vid.currentTime, vid.duration); });
    vid.addEventListener('ended', function () {
      saveTime(w.id, 0);
      if (nextBtn) nextBtn.hidden = false;
    });

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        var n = nextOf(w);
        if (n) { state.autoplay = true; location.hash = '#/work/' + n.id; }
      });
    }
    if (toLyrics) {
      toLyrics.addEventListener('click', function () {
        var sec = document.getElementById('lyrics');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }

    if (state.autoplay) {
      state.autoplay = false;
      var tryPlay = function () { vid.play().catch(function () {}); };
      if (vid.readyState >= 1) tryPlay();
      else vid.addEventListener('loadedmetadata', tryPlay, { once: true });
    }

    if (state.pendingLyrics) {
      var jumpId = state.pendingLyrics;
      state.pendingLyrics = '';
      if (jumpId === w.id) {
        var jumpLyrics = function () {
          var sec = document.getElementById('lyrics');
          if (!sec) return;
          var y = sec.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
        };
        requestAnimationFrame(jumpLyrics);
        setTimeout(jumpLyrics, 260);
        setTimeout(jumpLyrics, 760);
      }
    }

    state.detail = { item: w, vid: vid };
  }

  /* -------------------------------------------------------------- lyrics page */
  function hitHTML(text, q) {
    if (!q) return esc(text);
    var lower = text.toLowerCase();
    var needle = q.toLowerCase();
    var out = '';
    var from = 0;
    var at = lower.indexOf(needle);
    while (at >= 0) {
      out += esc(text.slice(from, at)) + '<mark class="lyr-hit">' + esc(text.slice(at, at + needle.length)) + '</mark>';
      from = at + needle.length;
      at = lower.indexOf(needle, from);
    }
    return out + esc(text.slice(from));
  }

  function lyricGridHTMLFor(w, q) {
    if (!w.stanzaCount) {
      return '<div class="lyric-empty"><span class="ico">' + ICO.silent + '</span><span>' +
        esc(w.lyricsNote || '本作没有歌词。') + '</span></div>';
    }
    var out = '';
    var shownStanzas = 0;
    for (var i = 0; i < w.lyrics.length; i++) {
      var st = w.lyrics[i];
      var matched = st.lines.filter(function (l) {
        return !q || l.toLowerCase().indexOf(q.toLowerCase()) >= 0;
      });
      if (q && !matched.length) continue;
      shownStanzas++;
      var cls = 'stanza';
      if (/副歌|叠句|重唱/.test(st.label || '')) cls += ' is-hook';
      if (/念/.test(st.label || '')) cls += ' is-spoken';
      var lines = '';
      for (var k = 0; k < st.lines.length; k++) {
        lines += '<p class="stanza-line">' + hitHTML(st.lines[k], q) + '</p>';
      }
      out += '<div class="' + cls + '"><span class="stanza-label">' + esc(st.label || '歌词') + '</span>' + lines + '</div>';
    }
    return out || '<div class="lyric-empty"><span class="ico">' + ICO.silent + '</span><span>这部作品的歌词里没有匹配的句子。</span></div>';
  }

  function renderLyrics() {
    var d = state.data;
    var st = d.stats;

    var index = '<ol>';
    d.works.forEach(function (w) {
      index += '<li><a href="#lyrics-' + w.id + '" data-jump="' + w.id + '">' +
        '<span class="n">' + esc(w.num) + '</span><span>' + esc(w.title) + '</span>' +
        '<span class="c">' + (w.stanzaCount ? w.stanzaCount + ' 段' : '无词') + '</span></a></li>';
    });
    index += '</ol>';

    var list = d.works.map(function (w) {
      var s = seriesById(w.series);
      var metaBits = [];
      if (w.chips && w.chips.length && w.stanzaCount) metaBits.push(esc(w.chips[0]));
      var 本家 = (w.credits || []).filter(function (c) { return /本家|原作|原曲/.test(c.k); })[0];
      if (本家) metaBits.push(esc(本家.k) + ' <b>' + esc(本家.v) + '</b>');
      metaBits.push(w.stanzaCount ? '<b>' + w.stanzaCount + '</b> 段 · <b>' + w.lineCount + '</b> 行' : '<b>无歌词</b>');

      return '<article class="lyr-work" id="lyrics-' + w.id + '" data-id="' + w.id + '">' +
        '<div class="lyr-work-head">' +
          '<h3><span class="n">' + esc(w.num) + '</span><a href="#/work/' + w.id + '">' + esc(w.title) + '</a></h3>' +
          (w.stanzaCount
            ? '<button class="mini" type="button" data-copy="' + w.id + '">' + ICO.copy + ' 复制</button>'
            : '') +
        '</div>' +
        '<p class="lyr-meta">' + metaBits.join(' · ') +
          (s ? ' · <b>' + esc(s.name) + '</b>' : '') + '</p>' +
        '<div class="lyric-grid">' + lyricGridHTMLFor(w, '') + '</div>' +
      '</article>';
    }).join('');

    viewLyrics.innerHTML = '<div class="wrap lyr-page">' +
      '<header class="lyr-hero">' +
        '<p class="kicker">LYRICS · ' + st.lyricsWorks + ' 首 · ' + st.lines + ' 行</p>' +
        '<h1>歌词全集</h1>' +
        '<p class="sub">' + st.works + ' 部作品的歌词按发布顺序排在一起，共 <b>' + st.stanzas + '</b> 段 <b>' + st.lines + '</b> 行。' +
          '搜一句词，就能把这句出现的段落挑出来。</p>' +
        '<div class="search-wrap">' +
          '<label class="search">' + ICO.search +
            '<input id="lyrSearch" type="search" autocomplete="off" spellcheck="false" ' +
              'placeholder="搜歌词或作品名：宛平、切糕、雌二醇……" aria-label="搜索歌词">' +
            '<button class="search-clear" type="button" id="lyrClear" hidden aria-label="清空搜索">✕</button>' +
          '</label>' +
          '<span class="search-count" id="lyrCount">共 ' + st.lyricsWorks + ' 首 · ' + st.stanzas + ' 段</span>' +
        '</div>' +
      '</header>' +
      '<div class="lyr-layout">' +
        '<nav class="lyr-index" aria-label="歌词目录"><h2>目录</h2>' + index + '</nav>' +
        '<div class="lyr-list" id="lyrList">' + list + '</div>' +
      '</div>' +
      '<p class="no-result" id="lyrNoResult">没有找到包含这句话的歌词。试试更短的词。</p>' +
    '</div>';

    var input = document.getElementById('lyrSearch');
    var clear = document.getElementById('lyrClear');
    var countEl = document.getElementById('lyrCount');
    var noResult = document.getElementById('lyrNoResult');

    function runQuery() {
      var q = (input.value || '').trim();
      state.query = q;
      clear.hidden = !q;
      var hitWorks = 0, hitStanzas = 0;
      d.works.forEach(function (w) {
        var art = document.getElementById('lyrics-' + w.id);
        if (!art) return;
        var grid = art.querySelector('.lyric-grid');
        var text = w.title + ' ' + (w.kicker || '') + ' ' + (w.summary || '') + ' ' +
          (w.chips || []).join(' ') + ' ' + w.lyrics.map(function (s) { return s.lines.join(' '); }).join(' ');
        var matchWork = !q || text.toLowerCase().indexOf(q.toLowerCase()) >= 0;
        grid.innerHTML = lyricGridHTMLFor(w, q);
        var visible = q ? grid.querySelectorAll('.stanza').length > 0 : true;
        art.classList.toggle('is-hidden', !matchWork || (q ? !visible : false));
        if (!art.classList.contains('is-hidden')) {
          hitWorks++;
          hitStanzas += q ? grid.querySelectorAll('.stanza').length : w.stanzaCount;
        }
        // 目录项也一起过滤
        var idx = document.querySelector('[data-jump="' + w.id + '"]');
        if (idx) idx.style.opacity = art.classList.contains('is-hidden') ? '.35' : '1';
      });
      countEl.textContent = q
        ? (hitWorks ? hitWorks + ' 首命中 · ' + hitStanzas + ' 段' : '无匹配')
        : '共 ' + st.lyricsWorks + ' 首 · ' + st.stanzas + ' 段';
      noResult.classList.toggle('is-on', !!q && hitWorks === 0);
    }

    input.addEventListener('input', runQuery);
    clear.addEventListener('click', function () { input.value = ''; runQuery(); input.focus(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; runQuery(); }
    });

    viewLyrics.querySelectorAll('[data-jump]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        var art = document.getElementById('lyrics-' + a.dataset.jump);
        if (art) art.scrollIntoView({ behavior: 'smooth', block: 'start' });
        a.blur();
      });
    });
  }

  /* ------------------------------------------------------------- copy lyrics */
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (err) { reject(err); }
    });
  }

  function lyricsText(w) {
    var out = '《' + w.title + '》' + (w.kicker ? ' · ' + w.kicker : '') + '\n';
    if (w.credits && w.credits.length) {
      out += w.credits.map(function (c) { return c.k + '：' + c.v; }).join('\n') + '\n';
    }
    out += '\n';
    if (!w.stanzaCount) return out + (w.lyricsNote || '（本作没有歌词）') + '\n';
    w.lyrics.forEach(function (st) {
      out += '[' + (st.label || '歌词') + ']\n' + st.lines.join('\n') + '\n\n';
    });
    return out.trim() + '\n';
  }

  /* ----------------------------------------------------------------- routing */
  function parseRoute() {
    var raw = location.hash.replace(/^#\/?/, '');
    var seg = raw.split('/').filter(Boolean);
    if (seg[0] === 'work' && seg[1]) return { name: 'work', id: decodeURIComponent(seg[1]) };
    if (seg[0] === 'lyrics') return { name: 'lyrics' };
    return { name: 'home' };
  }

  function teardown() {
    var d = state.detail;
    if (d && d.vid) {
      try {
        saveTime(d.item.id, d.vid.currentTime, d.vid.duration);
        d.vid.pause();
        d.vid.removeAttribute('src');
        d.vid.load();
      } catch (e) {}
    }
    destroyHls();
    state.detail = null;
  }

  function scrollToSection(id) {
    var jump = function () {
      var node = document.getElementById(id);
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    if (state.route.name !== 'home') {
      state.pendingScroll = id;
      location.hash = '#/';
    } else jump();
  }

  function markNav(kind) {
    var links = document.querySelectorAll('.nav a');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var on = false;
      if (kind === 'lyrics') on = a.getAttribute('href') === '#/lyrics';
      else if (kind === 'works') on = a.dataset.scroll === 'works';
      else if (kind === 'about') on = a.dataset.scroll === 'about';
      a.classList.toggle('is-active', on);
    }
  }

  var navTargets = [];
  function collectNavTargets() {
    navTargets = [];
    var links = document.querySelectorAll('.nav a[data-scroll]');
    for (var i = 0; i < links.length; i++) {
      var el = document.getElementById(links[i].dataset.scroll);
      if (el) navTargets.push({ link: links[i], el: el });
    }
  }
  function syncNavToScroll() {
    if (state.route.name !== 'home' || !navTargets.length) return;
    var line = window.scrollY + 160;
    var active = navTargets[0];
    for (var i = 0; i < navTargets.length; i++) {
      if (navTargets[i].el.offsetTop <= line) active = navTargets[i];
    }
    var doc = document.documentElement;
    if (window.scrollY + window.innerHeight >= doc.scrollHeight - 4) active = navTargets[navTargets.length - 1];
    for (var j = 0; j < navTargets.length; j++) {
      navTargets[j].link.classList.toggle('is-active', navTargets[j] === active);
    }
  }

  function updateProgressBar() {
    if (!topbarProgress) return;
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 40 ? clamp(window.scrollY / max, 0, 1) : 0;
    topbarProgress.hidden = p <= 0.01;
    var bar = topbarProgress.firstElementChild;
    if (bar) bar.style.width = (p * 100).toFixed(2) + '%';
  }

  function route() {
    var r = parseRoute();
    var prev = state.route;

    if (r.name === 'home') {
      if (prev.name !== 'home') { teardown(); viewWork.hidden = true; viewWork.innerHTML = ''; viewLyrics.hidden = true; viewLyrics.innerHTML = ''; }
      viewHome.hidden = false;
      collectNavTargets();
      applyFilter(state.filter);
      if (prev.name !== 'home') window.scrollTo({ top: state.homeScroll || 0, behavior: 'auto' });
      markNav(null);
      syncNavToScroll();
      document.title = state.data.site.title + ' · ' + state.data.site.author;
      if (state.pendingScroll) {
        var target = state.pendingScroll;
        state.pendingScroll = '';
        setTimeout(function () {
          var node = document.getElementById(target);
          if (node) node.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, 40);
      }
    } else if (r.name === 'work') {
      var w = byId(r.id);
      if (!w) { location.replace('#/'); return; }
      if (prev.name === 'home') state.homeScroll = window.scrollY;
      if (prev.name === 'work' && prev.id !== r.id) teardown();
      viewHome.hidden = true;
      viewLyrics.hidden = true;
      viewLyrics.innerHTML = '';
      viewWork.hidden = false;
      if (prev.name !== 'work' || prev.id !== r.id) {
        var jumpToLyrics = state.pendingLyrics === w.id;
        renderWork(w);
        if (!jumpToLyrics) window.scrollTo({ top: 0, behavior: 'auto' });
      }
      markNav('works');
      document.title = w.title + ' · ' + state.data.site.title;
    } else {
      if (prev.name !== 'lyrics') {
        if (prev.name === 'home') state.homeScroll = window.scrollY;
        teardown();
        viewHome.hidden = true;
        viewWork.hidden = true;
        viewWork.innerHTML = '';
        viewLyrics.hidden = false;
        renderLyrics();
      }
      markNav('lyrics');
      document.title = '歌词全集 · ' + state.data.site.title;
      if (prev.name !== 'lyrics') window.scrollTo({ top: 0, behavior: 'auto' });
    }

    state.route = r;
    updateProgressBar();
  }

  /* ------------------------------------------------------------------- events */
  document.addEventListener('click', function (e) {
    var copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
      var w = byId(copyBtn.dataset.copy);
      if (!w) return;
      var original = copyBtn.innerHTML;
      copyText(lyricsText(w)).then(function () {
        copyBtn.classList.add('is-done');
        copyBtn.innerHTML = ICO.copy + ' 已复制';
        setTimeout(function () { copyBtn.classList.remove('is-done'); copyBtn.innerHTML = original; }, 1800);
      }).catch(function () {
        copyBtn.innerHTML = ICO.copy + ' 复制失败';
        setTimeout(function () { copyBtn.innerHTML = original; }, 1800);
      });
      return;
    }

    var play = e.target.closest('[data-play]');
    if (play) {
      var id = play.dataset.play;
      var target = '#/work/' + id;
      e.preventDefault();
      if (location.hash !== target) {
        state.autoplay = true;
        location.hash = target;
      } else if (state.detail && state.detail.item.id === id) {
        state.autoplay = false;
        state.detail.vid.play().catch(function () {});
      }
      return;
    }

    var anchor = e.target.closest('[data-anchor]');
    if (anchor) { state.pendingLyrics = anchor.dataset.target || anchor.dataset.anchorId || ''; }

    var filter = e.target.closest('[data-filter]');
    if (filter) {
      var fid = filter.dataset.filter;
      applyFilter(state.filter === fid && fid !== 'all' ? 'all' : fid, { scroll: fid !== 'all' });
      return;
    }

    var scrollLink = e.target.closest('[data-scroll]');
    if (scrollLink) {
      e.preventDefault();
      scrollToSection(scrollLink.dataset.scroll);
    }
  });

  window.addEventListener('scroll', function () {
    updateProgressBar();
    if (!syncNavRaf) {
      syncNavRaf = requestAnimationFrame(function () { syncNavRaf = 0; syncNavToScroll(); });
    }
  }, { passive: true });
  window.addEventListener('resize', updateProgressBar);
  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', function () {
    if (state.detail && state.detail.vid) {
      saveTime(state.detail.item.id, state.detail.vid.currentTime, state.detail.vid.duration);
    }
  });

  /* --------------------------------------------------------------------- boot */
  fetch('data/works.json', { cache: 'no-store' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      state.data = data;
      renderHome();
      collectNavTargets();
      route();
    })
    .catch(function (err) {
      viewHome.innerHTML = '<div class="wrap err-box">' +
        '<h2>数据加载失败</h2>' +
        '<p>请用本地服务器打开这个站点（<code>node server.mjs</code>），而不是直接双击 index.html。</p>' +
        '<p style="color:var(--ink-3);font-size:13px">' + esc(err.message) + '</p></div>';
    });
})();
