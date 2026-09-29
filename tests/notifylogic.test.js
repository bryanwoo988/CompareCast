const {test} = require('node:test');
const assert = require('node:assert');
const {minutesOf, inWindow, windowSlice, breaches} = require('../notifylogic.js');

test('minutesOf 正常值', () => {
  assert.strictEqual(minutesOf('00:00'), 0);
  assert.strictEqual(minutesOf('06:30'), 390);
  assert.strictEqual(minutesOf('23:59'), 1439);
});
test('minutesOf 非法值返回 -1', () => {
  ['', '6:30', 'abc', '25:00', '06:60', null, undefined].forEach(v =>
    assert.strictEqual(minutesOf(v), -1, String(v)));
});
test('普通时段', () => {
  const w = {from:'06:00', to:'12:00'};
  assert.strictEqual(inWindow(w, minutesOf('06:00')), true);
  assert.strictEqual(inWindow(w, minutesOf('09:00')), true);
  assert.strictEqual(inWindow(w, minutesOf('12:00')), false);
  assert.strictEqual(inWindow(w, minutesOf('05:59')), false);
});
test('跨午夜时段', () => {
  const w = {from:'00:00', to:'06:00'};
  assert.strictEqual(inWindow(w, minutesOf('03:00')), true);
  assert.strictEqual(inWindow(w, minutesOf('23:30')), false);
});
test('真正跨午夜：22:00-02:00', () => {
  const w = {from:'22:00', to:'02:00'};
  assert.strictEqual(inWindow(w, minutesOf('23:30')), true);
  assert.strictEqual(inWindow(w, minutesOf('01:00')), true);
  assert.strictEqual(inWindow(w, minutesOf('12:00')), false);
});
test('windowSlice 取出该时段的小时', () => {
  const times = [];
  for(let i = 0; i < 24; i++) times.push(`2026-09-29T${String(i).padStart(2,'0')}:00`);
  for(let i = 0; i < 24; i++) times.push(`2026-09-30T${String(i).padStart(2,'0')}:00`);
  assert.deepStrictEqual(windowSlice(times, '2026-09-29', {from:'06:00', to:'12:00'}), {start:6, n:6});
});
test('windowSlice 找不到该日', () => {
  assert.deepStrictEqual(windowSlice([], '2026-09-29', {from:'06:00', to:'12:00'}), {start:-1, n:0});
});
test('breaches 没有开启的规则时为空', () => {
  assert.deepStrictEqual(breaches({rainProb:{on:false, v:60}}, {rainProb:90}), []);
});
test('breaches 大于等于方向', () => {
  const rules = {rainProb:{on:true, v:60}, wind:{on:true, v:20}};
  assert.deepStrictEqual(breaches(rules, {rainProb:60, wind:5}), ['rainProb']);
  assert.deepStrictEqual(breaches(rules, {rainProb:59, wind:25}), ['wind']);
});
test('breaches 最低温是小于等于', () => {
  const rules = {tMin:{on:true, v:22}};
  assert.deepStrictEqual(breaches(rules, {tMin:22}), ['tMin']);
  assert.deepStrictEqual(breaches(rules, {tMin:23}), []);
  assert.deepStrictEqual(breaches(rules, {tMin:18}), ['tMin']);
});
test('breaches 缺失的统计值不算超标', () => {
  assert.deepStrictEqual(breaches({tMax:{on:true, v:35}}, {}), []);
  assert.deepStrictEqual(breaches({tMax:{on:true, v:35}}, {tMax:null}), []);
});

/* ---- dueWindows / spanDays / aggregate ---- */
const {dueWindows, spanDays, aggregate} = require('../notifylogic.js');

const W = (id, on, at, from, to) => ({id, on, at, from:from||'06:00', to:to||'12:00', mode:'digest'});

test('提醒时间正好等于当前分钟时触发', () => {
  assert.deepStrictEqual(dueWindows([W('a', true, '06:00')], 360, 15).map(w => w.id), ['a']);
});
test('提醒时间在窗口内触发', () => {
  assert.deepStrictEqual(dueWindows([W('a', true, '06:50')], 420, 15).map(w => w.id), ['a']);
});
test('提醒时间正好等于窗口起点时不触发——那属于上一个窗口', () => {
  assert.deepStrictEqual(dueWindows([W('a', true, '06:00')], 375, 15).map(w => w.id), []);
});
test('关闭的时段永不触发', () => {
  assert.deepStrictEqual(dueWindows([W('a', false, '06:00')], 360, 15).map(w => w.id), []);
});
test('窗口跨越 0 点时能取到前一天深夜的提醒', () => {
  assert.deepStrictEqual(dueWindows([W('a', true, '23:55')], 5, 15).map(w => w.id), ['a']);
});
test('跨 0 点的窗口不会误伤白天的时段', () => {
  assert.deepStrictEqual(dueWindows([W('a', true, '12:00')], 5, 15).map(w => w.id), []);
});

test('不跨午夜的时段只覆盖一天', () => {
  assert.deepStrictEqual(spanDays({from:'06:00', to:'12:00'}, '2026-09-29'), ['2026-09-29']);
});
test('跨午夜的时段覆盖两天', () => {
  assert.deepStrictEqual(spanDays({from:'22:00', to:'02:00'}, '2026-09-29'), ['2026-09-29','2026-09-30']);
});
test('跨月底的时段日期进位正确', () => {
  assert.deepStrictEqual(spanDays({from:'22:00', to:'02:00'}, '2026-09-30'), ['2026-09-30','2026-10-01']);
});

const HH = {
  precipitation_probability:[10, 80, 30],
  precipitation:[0, 2.5, 1.5],
  temperature_2m:[24, 31, 28],
  wind_speed_10m:[5, 18, 9],
  wind_gusts_10m:[9, 30, 14]
};
test('聚合取最大、求和与极值', () => {
  assert.deepStrictEqual(aggregate(HH, [0,1,2]),
    {rainProb:80, rainSum:4, tMax:31, tMin:24, wind:18, gust:30});
});
test('只聚合给定的索引', () => {
  const a = aggregate(HH, [0]);
  assert.strictEqual(a.rainProb, 10);
  assert.strictEqual(a.tMax, 24);
});
test('空索引集合每项为 null', () => {
  assert.deepStrictEqual(aggregate(HH, []),
    {rainProb:null, rainSum:null, tMax:null, tMin:null, wind:null, gust:null});
});
test('全 null 的序列返回 null 而不是 0 或 Infinity', () => {
  const empty = {precipitation_probability:[null,null], precipitation:[null,null],
                 temperature_2m:[null,null], wind_speed_10m:[null,null], wind_gusts_10m:[null,null]};
  assert.deepStrictEqual(aggregate(empty, [0,1]),
    {rainProb:null, rainSum:null, tMax:null, tMin:null, wind:null, gust:null});
});
test('缺失的字段不抛错', () => {
  assert.strictEqual(aggregate({temperature_2m:[20,25]}, [0,1]).tMax, 25);
  assert.strictEqual(aggregate({temperature_2m:[20,25]}, [0,1]).rainProb, null);
});
