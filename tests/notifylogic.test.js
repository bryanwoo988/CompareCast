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
