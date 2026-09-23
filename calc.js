// ===========================
// こども都道府県クイズ — 出題ロジック（画面から切り離した純粋関数）
// ブラウザでは window.Calc、Node（テスト）では module.exports で使う
// ===========================
(function (root) {
  'use strict';

  var RUBY_RE = /\{([^|{}]+)\|([^{}]+)\}/g;

  /**
   * {漢字|よみ} の書き方を、表示の段階に合わせて変換する
   * level: 'kana'（ひらがなだけ）| 'ruby'（漢字にふりがな。HTML）| 'kanji'（漢字だけ）
   * ruby のときは HTML を返すので、ほかの文字はエスケープする
   */
  function ruby(text, level) {
    var s = String(text == null ? '' : text);
    if (level === 'ruby') {
      var out = '', last = 0, m;
      RUBY_RE.lastIndex = 0;
      while ((m = RUBY_RE.exec(s))) {
        out += esc(s.slice(last, m.index)) + '<ruby>' + esc(m[1]) + '<rt>' + esc(m[2]) + '</rt></ruby>';
        last = RUBY_RE.lastIndex;
      }
      return out + esc(s.slice(last));
    }
    return s.replace(RUBY_RE, function (_, kanji, kana) { return level === 'kana' ? kana : kanji; });
  }
  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  /** 決まった順の乱数（テストで結果を固定できるように）。seed が同じなら同じ並び */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rand) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  var MODES = ['touch', 'name', 'shape', 'capital', 'fact'];

  /** そのモードで出題できる都道府県（地方で絞る。県庁所在地のモードでは東京都を除く） */
  function candidates(prefs, mode, regions) {
    return prefs.filter(function (p) {
      if (regions && regions.length && regions.indexOf(p.region) < 0) return false;
      if (mode === 'capital' && !p.cap) return false;
      return true;
    });
  }

  /**
   * 1 回分（count 問）の問題を作る
   * opts = { mode, regions: ['kanto', ...]（空なら全国）, count: 10, seed, choices: 4 }
   * 問題: { mode, code（正解の都道府県）, fact（名物・名所のとき）, choices（4 択のとき。正解を含む並び）}
   * 選択肢のまぎらわしさ: 正解と同じ地方から先に選ぶ（地方で絞っていないとき）。足りなければ全国から
   */
  function makeRound(prefs, opts) {
    var rand = rng(opts.seed || Date.now());
    var pool = candidates(prefs, opts.mode, opts.regions);
    var count = Math.min(opts.count || 10, pool.length);
    var nChoices = opts.choices || 4;
    var picked = shuffle(pool, rand).slice(0, count);
    return picked.map(function (p) {
      var q = { mode: opts.mode, code: p.code };
      if (opts.mode === 'fact') q.fact = p.facts[Math.floor(rand() * p.facts.length)];
      if (opts.mode !== 'touch') {
        var others = candidates(prefs, opts.mode, null).filter(function (x) { return x.code !== p.code; });
        var same = shuffle(others.filter(function (x) { return x.region === p.region; }), rand);
        var rest = shuffle(others.filter(function (x) { return x.region !== p.region; }), rand);
        var wrong = same.slice(0, Math.min(nChoices - 1, 2)).concat(rest).slice(0, nChoices - 1);
        if (wrong.length < nChoices - 1) wrong = wrong.concat(same.slice(2)).slice(0, nChoices - 1);
        q.choices = shuffle([p.code].concat(wrong.map(function (x) { return x.code; })), rand);
      }
      return q;
    });
  }

  function isCorrect(q, answerCode) { return +answerCode === q.code; }

  /** 県ごとの記録（正解した回数）を更新した新しいオブジェクトを返す */
  function record(stats, code, correct) {
    var s = Object.assign({}, stats || {});
    var r = Object.assign({ ok: 0, ng: 0 }, s[code] || {});
    if (correct) r.ok += 1; else r.ng += 1;
    s[code] = r;
    return s;
  }

  /** 「おぼえた県」: 正解が threshold 回以上 */
  function learned(stats, threshold) {
    var t = threshold || 3;
    return Object.keys(stats || {}).filter(function (k) { return stats[k].ok >= t; }).map(Number).sort(function (a, b) { return a - b; });
  }

  var Calc = { ruby: ruby, rng: rng, shuffle: shuffle, MODES: MODES, candidates: candidates, makeRound: makeRound, isCorrect: isCorrect, record: record, learned: learned };
  if (typeof module !== 'undefined' && module.exports) module.exports = Calc;
  else root.Calc = Calc;
})(this);
