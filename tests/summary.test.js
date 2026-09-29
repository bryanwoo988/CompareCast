const {test} = require('node:test');
const assert = require('node:assert');
const {rainRuns, partOfDay, summarize} = require('../summary.js');

const P = a => a;   // hourly probabilities, index = hour

test('连续两小时达标算一段', () => {
  const r = rainRuns(P([0,0,50,50,0]), 50, 2);
  assert.deepStrictEqual(r, [{from:2, to:3, peak:50}]);
});
test('只有一小时不算段', () => {
  assert.deepStrictEqual(rainRuns(P([0,0,90,0]), 50, 2), []);
});
test('恰好等于阈值算达标', () => {
  assert.strictEqual(rainRuns(P([50,50]), 50, 2).length, 1);
});
test('低于阈值一点就不算', () => {
  assert.strictEqual(rainRuns(P([49,49]), 50, 2).length, 0);
});
test('一天两头各一段', () => {
  const r = rainRuns(P([80,80,0,0,0,0,70,70,70]), 50, 2);
  assert.deepStrictEqual(r.map(x => [x.from, x.to]), [[0,1],[6,8]]);
});
test('峰值取该段最大', () => {
  assert.strictEqual(rainRuns(P([60,95,70]), 50, 2)[0].peak, 95);
});
test('null 打断连续', () => {
  assert.deepStrictEqual(rainRuns(P([80,null,80,80]), 50, 2).map(x=>[x.from,x.to]), [[2,3]]);
});
test('空数组不抛错', () => {
  assert.deepStrictEqual(rainRuns([], 50, 2), []);
});

test('时段归类', () => {
  assert.strictEqual(partOfDay(0), 'night');
  assert.strictEqual(partOfDay(5), 'night');
  assert.strictEqual(partOfDay(6), 'morning');
  assert.strictEqual(partOfDay(11), 'morning');
  assert.strictEqual(partOfDay(12), 'afternoon');
  assert.strictEqual(partOfDay(17), 'afternoon');
  assert.strictEqual(partOfDay(18), 'evening');
  assert.strictEqual(partOfDay(23), 'evening');
});

const hours = n => Array.from({length:n}, (_, i) => i);
test('成段的雨报出起止与峰值', () => {
  const s = summarize({probs:[...Array(14).fill(5), 60, 86, 70, ...Array(7).fill(5)], tMax:32, from:0});
  assert.strictEqual(s.kind, 'rain');
  assert.strictEqual(s.peak, 86);
  assert.strictEqual(s.from, 14);
  assert.strictEqual(s.to, 16);
});
test('零星阵雨单独归类', () => {
  const s = summarize({probs:[...Array(13).fill(5), 62, ...Array(10).fill(5)], tMax:32, from:0});
  assert.strictEqual(s.kind, 'showers');
  assert.strictEqual(s.peak, 62);
});
test('无雨但高温', () => {
  const s = summarize({probs:Array(24).fill(3), tMax:35, from:0});
  assert.strictEqual(s.kind, 'hot');
  assert.strictEqual(s.tMax, 35);
});
test('无雨也不热', () => {
  assert.strictEqual(summarize({probs:Array(24).fill(3), tMax:29, from:0}).kind, 'calm');
});
test('今天只看当前小时之后——早上下过的雨不再提', () => {
  const probs = [...Array(8).fill(90), ...Array(16).fill(2)];
  assert.strictEqual(summarize({probs, tMax:30, from:0}).kind, 'rain');
  assert.strictEqual(summarize({probs, tMax:30, from:12}).kind, 'calm');
});
test('全 null 时不下结论', () => {
  assert.strictEqual(summarize({probs:Array(24).fill(null), tMax:null, from:0}).kind, 'unknown');
});
test('数据为空时不下结论', () => {
  assert.strictEqual(summarize({probs:[], tMax:null, from:0}).kind, 'unknown');
});

/* ---- scope of the sentence ----
   The judgement only ever looks from `from` onward, so the wording has to be
   able to say "from here on" instead of "all day". Without this the sentence
   read "no rain all day" on an evening when 1.1 mm had already fallen, while
   the ten-day row directly below it said 1.1 mm — the same page contradicting
   itself. */
test('整天的结论标记为非局部', () => {
  assert.strictEqual(summarize({probs:Array(24).fill(3), tMax:30, from:0}).rest, false);
});
test('只看剩余时段的结论标记为局部', () => {
  assert.strictEqual(summarize({probs:Array(24).fill(3), tMax:30, from:12}).rest, true);
});
test('局部标记在有雨的结论上也带着', () => {
  const probs = [...Array(12).fill(2), ...Array(12).fill(90)];
  const s = summarize({probs, tMax:30, from:6});
  assert.strictEqual(s.kind, 'rain');
  assert.strictEqual(s.rest, true);
});
test('高温结论也带局部标记', () => {
  const s = summarize({probs:Array(24).fill(3), tMax:36, from:9});
  assert.strictEqual(s.kind, 'hot');
  assert.strictEqual(s.rest, true);
});
test('数据不足时不谈范围', () => {
  assert.strictEqual(summarize({probs:[], tMax:null, from:5}).kind, 'unknown');
});
