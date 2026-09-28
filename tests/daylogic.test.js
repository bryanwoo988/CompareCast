const {test} = require('node:test');
const assert = require('node:assert');
const {sliceDay, extremaOf, nowIndex} = require('../daylogic.js');

const mk = (day, hours) => Array.from({length: hours}, (_, h) =>
  `${day}T${String(h).padStart(2,'0')}:00`);

test('普通一天切出 24 点', () => {
  const times = [...mk('2026-09-28',24), ...mk('2026-09-29',24)];
  assert.deepStrictEqual(sliceDay(times, '2026-09-29'), {start:24, n:24});
});

test('夏令时短日只有 23 点', () => {
  const times = [...mk('2026-03-28',24), ...mk('2026-03-29',23), ...mk('2026-03-30',24)];
  assert.deepStrictEqual(sliceDay(times, '2026-03-29'), {start:24, n:23});
});

test('夏令时长日有 25 点', () => {
  const times = [...mk('2026-10-24',24), ...mk('2026-10-25',25)];
  assert.deepStrictEqual(sliceDay(times, '2026-10-25'), {start:24, n:25});
});

test('末日数据被截断时按实际长度返回', () => {
  const times = [...mk('2026-09-28',24), ...mk('2026-09-29',7)];
  assert.deepStrictEqual(sliceDay(times, '2026-09-29'), {start:24, n:7});
});

test('找不到该日返回 start -1', () => {
  assert.deepStrictEqual(sliceDay(mk('2026-09-28',24), '2026-12-01'), {start:-1, n:0});
});

test('空数组不抛错', () => {
  assert.deepStrictEqual(sliceDay([], '2026-09-28'), {start:-1, n:0});
});

test('极值点索引', () => {
  assert.deepStrictEqual(extremaOf([22,25,31,28,24]), {hiIdx:2, loIdx:0});
});

test('极值跳过 null', () => {
  assert.deepStrictEqual(extremaOf([null,25,null,31,24]), {hiIdx:3, loIdx:4});
});

test('全 null 返回 -1', () => {
  assert.deepStrictEqual(extremaOf([null,null]), {hiIdx:-1, loIdx:-1});
});

test('当前小时定位', () => {
  assert.strictEqual(nowIndex(mk('2026-09-28',24), '2026-09-28T14:30'), 14);
});

test('当前时刻不在该日返回 -1', () => {
  assert.strictEqual(nowIndex(mk('2026-09-28',24), '2026-09-29T03:00'), -1);
});
