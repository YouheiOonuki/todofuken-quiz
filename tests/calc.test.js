// 出題ロジックとデータのテスト: node --test tests/*.test.js
// （.github/workflows/test.yml で push・PR のたびに自動実行される）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../calc.js');
const D = require('../data.js');

test('データ: 47 都道府県、コードは 1〜47 で重複なし、地方は 8 つのどれか', () => {
  assert.equal(D.PREFS.length, 47);
  assert.deepEqual(D.PREFS.map((p) => p.code), Array.from({ length: 47 }, (_, i) => i + 1));
  const regions = new Set(D.REGIONS.map((r) => r.key));
  for (const p of D.PREFS) assert.ok(regions.has(p.region), p.name);
  const count = {};
  for (const p of D.PREFS) count[p.region] = (count[p.region] || 0) + 1;
  assert.deepEqual(count, { hokkaido: 1, tohoku: 6, kanto: 7, chubu: 9, kinki: 7, chugoku: 5, shikoku: 4, kyushu: 8 });
});

test('データ: 名前・県庁所在地・名物は {漢字|よみ} の形がこわれていない。よみはひらがな（とカタカナ・記号）だけ', () => {
  const ok = /^[぀-ゟ゠-ヿー・「」（）A-Za-z0-9]*$/;
  for (const p of D.PREFS) {
    for (const t of [p.name, p.cap, ...p.facts].filter(Boolean)) {
      assert.equal((t.match(/\{/g) || []).length, (t.match(/\}/g) || []).length, t);
      assert.ok(!/[{}|]/.test(C.ruby(t, 'kanji')), t);
      assert.ok(ok.test(C.ruby(t, 'kana').replace(/\s/g, '')), 'よみ: ' + C.ruby(t, 'kana'));
    }
    assert.equal(p.facts.length, 2, p.name);
  }
  // 名物・名所は全体で重複しない（「〜で知られるのは？」の答えが 1 つに決まるように）
  const all = D.PREFS.flatMap((p) => p.facts.map((f) => C.ruby(f, 'kanji')));
  assert.equal(new Set(all).size, all.length);
});

test('データ: 県庁所在地（都道府県名と違う 18 の道県）', () => {
  const diff = D.PREFS.filter((p) => p.cap && C.ruby(p.cap, 'kanji').replace(/市$/, '') !== C.ruby(p.name, 'kanji').replace(/[都道府県]$/, ''));
  assert.deepEqual(diff.map((p) => C.ruby(p.cap, 'kanji')), [
    '札幌市', '盛岡市', '仙台市', '水戸市', '宇都宮市', '前橋市', 'さいたま市', '横浜市', '金沢市', '甲府市',
    '名古屋市', '津市', '大津市', '神戸市', '松江市', '高松市', '松山市', '那覇市',
  ]);
  assert.equal(D.PREFS.find((p) => p.code === 13).cap, null);
});

test('ruby(): ひらがな・ふりがな（HTML）・漢字の 3 段階', () => {
  const t = '{東大寺|とうだいじ}の{大仏|だいぶつ}<';
  assert.equal(C.ruby(t, 'kana'), 'とうだいじのだいぶつ<');
  assert.equal(C.ruby(t, 'kanji'), '東大寺の大仏<');
  assert.equal(C.ruby(t, 'ruby'), '<ruby>東大寺<rt>とうだいじ</rt></ruby>の<ruby>大仏<rt>だいぶつ</rt></ruby>&lt;');
});

test('makeRound: 10 問、重複なし、4 択は正解を含み重複なし。seed が同じなら同じ問題', () => {
  for (const mode of C.MODES) {
    const r = C.makeRound(D.PREFS, { mode, count: 10, seed: 42 });
    assert.equal(r.length, 10, mode);
    assert.equal(new Set(r.map((q) => q.code)).size, 10, mode);
    for (const q of r) {
      if (mode === 'touch') { assert.equal(q.choices, undefined); continue; }
      assert.equal(q.choices.length, 4, mode);
      assert.ok(q.choices.includes(q.code), mode);
      assert.equal(new Set(q.choices).size, 4, mode);
      if (mode === 'fact') assert.ok(D.PREFS.find((p) => p.code === q.code).facts.includes(q.fact));
    }
    assert.deepEqual(C.makeRound(D.PREFS, { mode, count: 10, seed: 42 }), r);
  }
});

test('makeRound: 地方で絞ると、その地方からだけ出る。県庁所在地のモードに東京都は出ない', () => {
  const r = C.makeRound(D.PREFS, { mode: 'name', regions: ['shikoku'], count: 10, seed: 1 });
  assert.equal(r.length, 4);
  for (const q of r) assert.equal(D.PREFS.find((p) => p.code === q.code).region, 'shikoku');
  for (let s = 1; s < 30; s++) {
    for (const q of C.makeRound(D.PREFS, { mode: 'capital', regions: ['kanto'], count: 10, seed: s })) {
      assert.notEqual(q.code, 13);
      assert.ok(!q.choices.includes(13));
    }
  }
});

test('makeRound: 選択肢はなるべく同じ地方から（まぎらわしく）', () => {
  let same = 0, total = 0;
  for (let s = 1; s <= 20; s++) {
    for (const q of C.makeRound(D.PREFS, { mode: 'name', count: 10, seed: s })) {
      const reg = D.PREFS.find((p) => p.code === q.code).region;
      for (const c of q.choices) if (c !== q.code) { total++; if (D.PREFS.find((p) => p.code === c).region === reg) same++; }
    }
  }
  assert.ok(same / total > 0.5, `${same}/${total}`);
});

test('記録: 正解の回数を数え、3 回以上で「おぼえた」', () => {
  let s = {};
  s = C.record(s, 13, true); s = C.record(s, 13, true); s = C.record(s, 13, false); s = C.record(s, 13, true);
  s = C.record(s, 1, true);
  assert.deepEqual(s[13], { ok: 3, ng: 1 });
  assert.deepEqual(C.learned(s), [13]);
});

test('地図: map.svg に 47 の都道府県（data-code 1〜47）がある', () => {
  const svg = fs.readFileSync(path.join(__dirname, '..', 'map.svg'), 'utf8');
  const codes = [...svg.matchAll(/data-code="(\d+)"/g)].map((m) => +m[1]).sort((a, b) => a - b);
  assert.deepEqual(codes, Array.from({ length: 47 }, (_, i) => i + 1));
  assert.match(svg, /Natural Earth/);
});
