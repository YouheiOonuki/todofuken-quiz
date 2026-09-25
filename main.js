// ===========================
// こども都道府県クイズ — 画面の制御
// 出題は calc.js（純粋関数）、都道府県のデータは data.js、地図は map.svg（Natural Earth を簡略化）
// ===========================
(function () {
  'use strict';

  var Calc = window.Calc;
  var D = window.PREF_DATA;
  var PREF = {};
  D.PREFS.forEach(function (p) { PREF[p.code] = p; });

  // --- ブラウザへの保存（README「ツールを追加するとき」12） ---
  // キーは必ず "todofuken-quiz_" で始める。全ツールが同じオリジンで localStorage を共有しているため
  var KEY_PREFIX = 'todofuken-quiz_';
  var store = {
    get: function (name, fallback) {
      try {
        var v = localStorage.getItem(KEY_PREFIX + name);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }   // 保存できない環境（プライベートモードなど）でも動くように
    },
    set: function (name, value) {
      try { localStorage.setItem(KEY_PREFIX + name, JSON.stringify(value)); } catch (e) { /* 保存できなくても続ける */ }
    },
  };

  // 設定を今の形にそろえる（起動時と、ファイルから読み込んだとき）
  function normalizeSettings(saved) {
    var s = Object.assign({ level: 'kana', regions: [], sound: true, speech: false }, saved);
    if (['kana', 'ruby', 'kanji'].indexOf(s.level) < 0) s.level = 'kana';
    if (!Array.isArray(s.regions)) s.regions = [];
    s.regions = s.regions.filter(function (k) { return D.REGIONS.some(function (r) { return r.key === k; }); });
    return { level: s.level, regions: s.regions, sound: s.sound !== false, speech: s.speech === true };
  }
  var settings = normalizeSettings(store.get('settings', {}));
  var stats = store.get('stats', {}) || {};

  function $(id) { return document.getElementById(id); }
  function R(text) { return Calc.ruby(text, settings.level); }                 // HTML（ふりがなのときは <ruby>）
  function K(text) { return Calc.ruby(text, 'kana'); }                         // 読み上げ用
  function setR(el, text) {
    if (settings.level === 'ruby') el.innerHTML = R(text); else el.textContent = R(text);
  }
  function show(id) {
    ['scr-menu', 'scr-play', 'scr-result', 'scr-collection'].forEach(function (s) { $(s).hidden = s !== id; });
    document.body.classList.toggle('playing', id === 'scr-play');   // 遊んでいる間はヘッダーを小さくして地図を広く
    window.scrollTo(0, 0);
  }

  // --- 効果音（Web Audio API で作る。音の素材ファイルは使わない。決定 D20） ---
  var audio = null;
  function beep(notes) {
    if (!settings.sound) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      notes.forEach(function (n) {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = n.type || 'sine'; o.frequency.value = n.f;
        g.gain.setValueAtTime(0.0001, t + n.at);
        g.gain.exponentialRampToValueAtTime(0.25, t + n.at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n.at + n.d);
        o.connect(g); g.connect(audio.destination);
        o.start(t + n.at); o.stop(t + n.at + n.d + 0.05);
      });
    } catch (e) { /* 音が出せない環境では鳴らさない */ }
  }
  var SOUND_OK = [{ f: 784, at: 0, d: 0.15 }, { f: 1047, at: 0.12, d: 0.3 }];
  var SOUND_NG = [{ f: 294, at: 0, d: 0.25, type: 'triangle' }, { f: 262, at: 0.18, d: 0.35, type: 'triangle' }];
  var SOUND_END = [{ f: 523, at: 0, d: 0.15 }, { f: 659, at: 0.13, d: 0.15 }, { f: 784, at: 0.26, d: 0.15 }, { f: 1047, at: 0.39, d: 0.45 }];

  // --- 読み上げ（Web Speech API。使えない環境ではボタンを隠す） ---
  var canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  function speak(text) {
    if (!canSpeak) return;
    try {
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(K(text));
      u.lang = 'ja-JP'; u.rate = 0.95;
      speechSynthesis.speak(u);
    } catch (e) { /* 読み上げできなくても続ける */ }
  }

  // --- 地図 ---
  var mapText = null;
  function loadMap() {
    return mapText ? Promise.resolve(mapText) : fetch('./map.svg').then(function (r) { return r.text(); }).then(function (t) { mapText = t; return t; });
  }
  function mountMap(box) {
    box.innerHTML = mapText.replace(/<!--[\s\S]*?-->/, '');
    var svg = box.querySelector('svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'にほんの ちず');
    svg.querySelectorAll('path').forEach(function (p) {
      var pref = PREF[+p.getAttribute('data-code')];
      p.setAttribute('data-region', pref.region);
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      t.textContent = Calc.ruby(pref.name, 'kanji');
      p.appendChild(t);
    });
    return svg;
  }
  // 地方で絞っているときは、その地方が大きく見えるように表示範囲を合わせる
  function fitRegions(svg, regions) {
    var base = svg.getAttribute('data-base') || svg.getAttribute('viewBox');
    svg.setAttribute('data-base', base);
    if (!regions.length) { svg.setAttribute('viewBox', base); return; }
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    svg.querySelectorAll('path').forEach(function (p) {
      if (regions.indexOf(p.getAttribute('data-region')) < 0) return;
      var b = p.getBBox();
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
    });
    if (!isFinite(x1)) { svg.setAttribute('viewBox', base); return; }
    var pad = Math.max(20, (x2 - x1) * 0.08);
    svg.setAttribute('viewBox', [x1 - pad, y1 - pad, x2 - x1 + pad * 2, y2 - y1 + pad * 2].join(' '));
  }
  function pathOf(svg, code) { return svg.querySelector('path[data-code="' + code + '"]'); }
  function clearMarks(svg) {
    svg.querySelectorAll('path').forEach(function (p) { p.classList.remove('target', 'ok', 'ng', 'dim'); });
    var m = svg.querySelector('.marker'); if (m) m.remove();
  }
  // 小さい県でも見つけられるよう、正解の県のまわりに丸をかく
  function marker(svg, code, cls) {
    var b = pathOf(svg, code).getBBox();
    var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('class', 'marker ' + (cls || ''));
    c.setAttribute('cx', b.x + b.width / 2); c.setAttribute('cy', b.y + b.height / 2);
    c.setAttribute('r', Math.max(18, Math.max(b.width, b.height) / 2 + 8));
    svg.appendChild(c);
  }

  // --- メニュー ---
  function renderMenu() {
    document.querySelectorAll('[data-ruby]').forEach(function (el) { setR(el, el.getAttribute('data-ruby')); });
    var box = $('regions');
    box.textContent = '';
    var all = document.createElement('button');
    all.type = 'button'; all.className = 'chip' + (settings.regions.length ? '' : ' on');
    all.setAttribute('aria-pressed', !settings.regions.length); all.textContent = 'ぜんこく';
    all.addEventListener('click', function () { settings.regions = []; saveSettings(); renderMenu(); });
    box.appendChild(all);
    D.REGIONS.forEach(function (r) {
      var on = settings.regions.indexOf(r.key) >= 0;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (on ? ' on' : ''); b.setAttribute('aria-pressed', on);
      setR(b, r.name);
      b.addEventListener('click', function () {
        var i = settings.regions.indexOf(r.key);
        if (i >= 0) settings.regions.splice(i, 1); else settings.regions.push(r.key);
        if (settings.regions.length === D.REGIONS.length) settings.regions = [];
        saveSettings(); renderMenu();
      });
      box.appendChild(b);
    });
    document.querySelectorAll('input[name="level"]').forEach(function (r) { r.checked = r.value === settings.level; });
    $('opt-sound').checked = settings.sound;
    $('opt-speech').checked = settings.speech && canSpeak;
    $('speech-opt').hidden = !canSpeak;
    $('learned-count').textContent = Calc.learned(stats).length + ' / 47';
  }
  function saveSettings() { store.set('settings', settings); }
  document.querySelectorAll('input[name="level"]').forEach(function (r) {
    r.addEventListener('change', function () { settings.level = r.value; saveSettings(); renderMenu(); });
  });
  $('opt-sound').addEventListener('change', function (e) { settings.sound = e.target.checked; saveSettings(); });
  $('opt-speech').addEventListener('change', function (e) { settings.speech = e.target.checked; saveSettings(); });
  $('modes').addEventListener('click', function (e) {
    var b = e.target.closest('.mode[data-mode]');
    if (b) start(b.getAttribute('data-mode'));
  });

  // --- 出題 ---
  var round = null;   // { mode, qs, i, score, miss: [], answered }
  var playSvg = null;

  function start(mode) {
    loadMap().then(function () {
      var qs = Calc.makeRound(D.PREFS, { mode: mode, regions: settings.regions, count: 10, seed: Date.now() });
      round = { mode: mode, qs: qs, i: 0, score: 0, miss: [] };
      show('scr-play');
      playSvg = mountMap($('map-wrap'));
      fitRegions(playSvg, settings.regions);
      playSvg.addEventListener('click', onMapTap);
      ask();
    });
  }

  function questionText(q) {
    var p = PREF[q.code];
    if (q.mode === 'touch') return p.name + ' は どこ？';
    if (q.mode === 'name') return 'ひかっている ところは どこ？';
    if (q.mode === 'shape') return 'この かたちは どこ？';
    if (q.mode === 'capital') return p.name + 'の {県庁所在地|けんちょうしょざいち}は？';
    return '「' + q.fact + '」で しられているのは どこ？';
  }

  function ask() {
    var q = round.qs[round.i];
    round.answered = false;
    $('progress').textContent = (round.i + 1) + ' / ' + round.qs.length + ' もんめ';
    $('score').textContent = '⭐ ' + round.score;
    setR($('question'), questionText(q));
    $('speak').hidden = !canSpeak;
    $('feedback').hidden = true;
    clearMarks(playSvg);
    var shape = q.mode === 'shape';
    $('map-wrap').hidden = shape;
    $('shape-wrap').hidden = !shape;
    if (shape) drawShape(q.code);
    if (q.mode === 'name' || q.mode === 'capital') { pathOf(playSvg, q.code).classList.add('target'); marker(playSvg, q.code); }
    $('map-wrap').classList.toggle('tappable', q.mode === 'touch');
    renderChoices(q);
    if (settings.speech) speak(questionText(q));
  }

  function drawShape(code) {
    var box = $('shape-wrap');
    box.textContent = '';
    var src = pathOf(playSvg, code);
    var b = src.getBBox();
    var pad = Math.max(b.width, b.height) * 0.08;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', [b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2].join(' '));
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'けんの かたち');
    var p = src.cloneNode(true);
    p.removeAttribute('class');
    var t = p.querySelector('title'); if (t) t.remove();
    p.setAttribute('class', 'shape');
    p.style.strokeWidth = Math.max(b.width, b.height) / 150;
    svg.appendChild(p);
    box.appendChild(svg);
  }

  function renderChoices(q) {
    var box = $('choices');
    box.textContent = '';
    if (!q.choices) return;
    q.choices.forEach(function (code) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'choice';
      b.setAttribute('data-code', code);
      setR(b, q.mode === 'capital' ? PREF[code].cap : PREF[code].name);
      b.addEventListener('click', function () { answer(code, b); });
      box.appendChild(b);
    });
  }

  function onMapTap(e) {
    if (!round || round.answered || round.qs[round.i].mode !== 'touch') return;
    var p = e.target.closest('path[data-code]');
    if (p) answer(+p.getAttribute('data-code'));
  }

  function answer(code, btn) {
    if (round.answered) return;
    round.answered = true;
    var q = round.qs[round.i];
    var ok = Calc.isCorrect(q, code);
    var p = PREF[q.code];
    stats = Calc.record(stats, q.code, ok);
    store.set('stats', stats);
    if (ok) round.score += 1; else round.miss.push(q.code);
    $('score').textContent = '⭐ ' + round.score;
    beep(ok ? SOUND_OK : SOUND_NG);

    // 地図と選択肢に、正解（と間違えたところ）を出す
    $('map-wrap').hidden = false;
    $('shape-wrap').hidden = true;
    clearMarks(playSvg);
    pathOf(playSvg, q.code).classList.add('ok');
    marker(playSvg, q.code, 'ok');
    if (!ok && PREF[code]) pathOf(playSvg, code).classList.add('ng');
    document.querySelectorAll('.choice').forEach(function (b) {
      b.disabled = true;
      var c = +b.getAttribute('data-code');
      if (c === q.code) b.classList.add('ok'); else if (c === +code) b.classList.add('ng');
    });

    $('fb-title').textContent = ok ? 'せいかい！' : 'ざんねん…';
    $('fb-title').className = 'fb-title ' + (ok ? 'ok' : 'ng');
    var body = p.name + (p.cap ? '（{県庁所在地|けんちょうしょざいち}：' + p.cap + '）' : '') + '。' + p.facts.join('、') + 'で しられているよ。';
    setR($('fb-body'), body);
    $('next').textContent = round.i + 1 < round.qs.length ? 'つぎへ' : 'けっかを みる';
    $('feedback').hidden = false;
    $('next').focus();
    if (settings.speech) speak((ok ? 'せいかい。' : 'ざんねん。こたえは ') + p.name);
  }

  $('next').addEventListener('click', function () {
    round.i += 1;
    if (round.i < round.qs.length) ask(); else finish();
  });
  $('speak').addEventListener('click', function () { if (round) speak(questionText(round.qs[round.i])); });
  $('quit').addEventListener('click', function () { if (canSpeak) speechSynthesis.cancel(); round = null; renderMenu(); show('scr-menu'); });

  function finish() {
    var n = round.qs.length, s = round.score;
    beep(SOUND_END);
    $('h-result').textContent = n + 'もん ちゅう ' + s + 'もん せいかい！';
    var stars = s === n ? 3 : s >= n * 0.7 ? 2 : s >= n * 0.4 ? 1 : 0;
    $('result-stars').textContent = '★★★'.slice(0, stars) + '☆☆☆'.slice(0, 3 - stars);
    var miss = $('result-miss');
    miss.textContent = '';
    if (round.miss.length) {
      var h = document.createElement('p'); h.textContent = 'まちがえた ところ：'; miss.appendChild(h);
      var ul = document.createElement('ul');
      round.miss.forEach(function (c) { var li = document.createElement('li'); setR(li, PREF[c].name); ul.appendChild(li); });
      miss.appendChild(ul);
    } else {
      var pp = document.createElement('p'); pp.textContent = 'ぜんぶ せいかい！ すごい！'; miss.appendChild(pp);
    }
    show('scr-result');
    if (settings.speech) speak($('h-result').textContent);
  }
  $('again').addEventListener('click', function () { start(round.mode); });
  $('to-menu').addEventListener('click', function () { renderMenu(); show('scr-menu'); });

  // --- おぼえた地図 ---
  $('open-collection').addEventListener('click', function () {
    loadMap().then(function () {
      var svg = mountMap($('col-map'));
      var list = Calc.learned(stats);
      list.forEach(function (c) { pathOf(svg, c).classList.add('learned'); });
      $('col-count').textContent = list.length + ' / 47 おぼえたよ';
      show('scr-collection');
    });
  });
  $('col-back').addEventListener('click', function () { renderMenu(); show('scr-menu'); });

  // --- ファイルへの書き出し・読み込み（README「ツールを追加するとき」20。決定 D31） ---
  // 中身はこの端末の中で作り、どこにも送信しない。機種変更のときはファイルを移して読み込む
  var TOOL = 'todofuken-quiz';
  $('backup-export').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify(Calc.buildBackup(TOOL, { settings: settings, stats: stats }), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = Calc.backupFileName(TOOL);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    $('backup-msg').textContent = 'ファイルに書き出しました。機種変更のときは、このファイルを新しい端末に移して「ファイルから よみこむ」を押してください。';
  });
  $('backup-import').addEventListener('click', function () { $('backup-file').click(); });
  $('backup-file').addEventListener('change', function () {
    var file = this.files && this.files[0];
    this.value = '';
    if (!file) return;
    if (file.size > 1024 * 1024) { $('backup-msg').textContent = 'ファイルが大きすぎます。このツールで書き出したファイルを選んでください。'; return; }
    file.text().then(function (text) {
      var r = Calc.parseBackup(text, TOOL, ['stats']);
      if (!r.ok) { $('backup-msg').textContent = r.error; return; }
      if (!window.confirm('きろく（おぼえた ちず）と せっていを、ファイルの ないようで おきかえますか？')) return;
      settings = normalizeSettings(r.data.settings);
      stats = Calc.normalizeStats(r.data.stats);
      saveSettings(); store.set('stats', stats);
      renderMenu();
      $('open-collection').click();
      $('backup-msg').textContent = 'ファイルから読み込みました。';
    }, function () { $('backup-msg').textContent = 'ファイルを読み取れませんでした。'; });
  });

  // 記録を消すのは保護者だけ: 全ツール共通の「保存した内容をすべて消す」ボタン（reset-storage.js）を
  // data-reset-hold（1 秒の長押しで確認を出す）で置いている（子どもの誤操作を防ぐ）

  renderMenu();
  show('scr-menu');
  document.documentElement.classList.remove('js-loading');

  // PWA: オフラインでも遊べるように（登録は './sw.js' だけ。scope: '/' を指定しない。README「ツールを追加するとき」13）
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
  }
})();
