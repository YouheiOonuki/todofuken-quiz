// 地図をキーボードで選ぶ（「さがして タッチ」）: 県の中心と、矢印キーで移る先のテスト。node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../calc.js');
const D = require('../data.js');

// 画面と同じく、map.svg の形から中心を出す（表を手で書かない）
const svg = fs.readFileSync(path.join(__dirname, '..', 'map.svg'), 'utf8');
const centers = {};
for (const m of svg.matchAll(/<path id="p\d+" data-code="(\d+)" d="([^"]*)"/g)) centers[+m[1]] = C.shapeCenter(m[2]);
const ALL = D.PREFS.map((p) => p.code);
const KEYS = ['left', 'right', 'up', 'down'];

function reached(codes, start) {
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const from = queue.shift();
    for (const k of KEYS) {
      const n = C.nextPref(centers, codes, from, k);
      if (n !== null && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return seen;
}

test('地図のキー: 47 県のどれにも、map.svg の形から中心が出る', () => {
  assert.deepEqual(Object.keys(centers).map(Number).sort((a, b) => a - b), ALL);
  for (const c of ALL) assert.ok(centers[c].every(Number.isFinite), String(c));
});

test('地図のキー: 中心はいちばん大きい島から（鹿児島は奄美、長崎は五島に引かれない）', () => {
  const box = (d) => {
    const pts = d.replace(/[MZ]/g, ' ').trim().split(/\s+/).map((p) => p.split(',').map(Number));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
  };
  const d46 = svg.match(/data-code="46" d="([^"]*)"/)[1];
  assert.ok(centers[46][1] < box(d46)[1] - 20, '鹿児島の中心が南の島に寄っている');
});

test('地図のキー: 向きの ±45° の中で中心がいちばん近い県へ。無ければ動かない', () => {
  for (const from of ALL) {
    for (const k of KEYS) {
      const n = C.nextPref(centers, ALL, from, k);
      if (n === null) continue;
      const dx = centers[n][0] - centers[from][0], dy = centers[n][1] - centers[from][1];
      const along = { left: -dx, right: dx, up: -dy, down: dy }[k];
      const side = k === 'left' || k === 'right' ? Math.abs(dy) : Math.abs(dx);
      assert.ok(along > 0 && along >= side, `${from} ${k} → ${n}`);
    }
  }
  // 小さい合成の例: 真上の 2 つと斜め 60° の 1 つ。斜めは「上」に入らず、近いほうへ
  const cs = { 1: [0, 0], 2: [0, -10], 3: [0, -20], 4: [10, -5] };
  assert.equal(C.nextPref(cs, [1, 2, 3, 4], 1, 'up'), 2);
  assert.equal(C.nextPref(cs, [1, 2, 3, 4], 1, 'right'), 4);
  assert.equal(C.nextPref(cs, [1, 2, 3, 4], 1, 'left'), null);
  assert.equal(C.nextPref(cs, [1, 2, 3, 4], 1, 'down'), null);
  assert.equal(C.nextPref(cs, [1, 2, 3, 4], 1, 'nowhere'), null);
});

test('地図のキー: 47 県のどれから始めても、矢印だけで 47 県の全部に届く', () => {
  for (const start of ALL) {
    const seen = reached(ALL, start);
    assert.equal(seen.size, 47, `${start} から届かない: ${ALL.filter((c) => !seen.has(c)).join(',')}`);
  }
});

test('地図のキー: 地方で絞ったとき（255 通りの組み合わせ）も、その中の全部の県に届く', () => {
  const keys = D.REGIONS.map((r) => r.key);
  for (let mask = 1; mask < 1 << keys.length; mask++) {
    const on = keys.filter((_, i) => mask & (1 << i));
    const codes = D.PREFS.filter((p) => on.includes(p.region)).map((p) => p.code);
    for (const start of codes) assert.equal(reached(codes, start).size, codes.length, `${on.join('+')} の ${start}`);
  }
});

test('地図のキー: 画面は地図に Tab の止まりを 1 つだけ置き、県には名前を足さない', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.equal((main.match(/setAttribute\('tabindex'/g) || []).length, 1, 'tabindex を付けるのは svg の 1 か所');
  assert.ok(!/aria-label', *(?:Calc\.ruby\()?pref/.test(main), '県に aria-label を足していない');
  assert.ok(/pick\(kbdCode\)/.test(main) && /pick\(\+p\.getAttribute\('data-code'\)\)/.test(main), 'Enter と押したのが同じ pick を通る');
});
