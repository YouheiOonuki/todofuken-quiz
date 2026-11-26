// バックアップを読んだ中身の正規化など、この repo だけの確かめ。形の確かめは共通の本体（同じフォルダの backup.test.js。値は backup.values.json）にある（yorozu-plans 7.271）。
const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeStats } = require('../calc.js');

test('normalizeStats: 県コード 1〜47 と 0 以上の整数の回数だけ残す', () => {
  const r = normalizeStats({ 13: { ok: 3, ng: 1 }, 1: { ok: '2', ng: -4 }, 0: { ok: 1, ng: 0 }, 48: { ok: 9, ng: 0 }, '01': { ok: 1 }, x: { ok: 1 }, 27: null, 40: { ok: 2.7 } });
  assert.deepEqual(r, { 1: { ok: 2, ng: 0 }, 13: { ok: 3, ng: 1 }, 40: { ok: 2, ng: 0 } });
});

test('normalizeStats: オブジェクトでなければ空の記録', () => {
  for (const v of [null, undefined, [], 'abc', 3]) assert.deepEqual(normalizeStats(v), {});
});
