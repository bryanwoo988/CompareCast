const {test} = require('node:test');
const assert = require('node:assert');
const {findNearby} = require('../maplogic.js');

const L = (lat, lon) => ({id:`${lat},${lon}`, lat, lon});

test('同一点命中', () => {
  assert.strictEqual(findNearby([L(3.139, 101.6869)], 3.139, 101.6869).id, '3.139,101.6869');
});

test('10 米内命中', () => {
  assert.ok(findNearby([L(3.139, 101.6869)], 3.139 + 8e-5, 101.6869));
});

test('50 米外不命中', () => {
  assert.strictEqual(findNearby([L(3.139, 101.6869)], 3.139 + 5e-4, 101.6869), null);
});

test('空列表返回 null', () => {
  assert.strictEqual(findNearby([], 3.139, 101.6869), null);
});

test('换日线两侧 4.5 米内命中', () => {
  // 未做经度归一化时这两点会被算成相隔约 4 万公里
  assert.ok(findNearby([L(0, 179.99998)], 0, -179.99998));
});

test('换日线两侧真正相隔很远时不命中', () => {
  assert.strictEqual(findNearby([L(0, 179)], 0, -179), null);
});

test('高纬度：经度同样的差值对应更短的距离', () => {
  assert.ok(findNearby([L(80, 20)], 80, 20 + 4e-4));
  assert.strictEqual(findNearby([L(0, 20)], 0, 20 + 4e-4), null);
});

test('多个点时返回命中的那个', () => {
  const list = [L(1, 1), L(3.139, 101.6869), L(2, 2)];
  assert.strictEqual(findNearby(list, 3.139, 101.6869).id, '3.139,101.6869');
});

test('阈值可调', () => {
  assert.strictEqual(findNearby([L(3.139, 101.6869)], 3.139 + 8e-5, 101.6869, 5), null);
});

const {asFix, betterFix, fixDone, fixCoarse} = require('../maplogic.js');
const P = (lat, lon, accuracy) => ({coords:{latitude:lat, longitude:lon, accuracy}});

test('定位：坏的读数不收', () => {
  assert.strictEqual(asFix(null), null);
  assert.strictEqual(asFix(P(NaN, 101, 10)), null);
  assert.strictEqual(asFix(P(95, 101, 10)), null);
  assert.strictEqual(asFix(P(3, 101, NaN)).acc, Infinity, '没有精度的读数排在最后，不当成精准');
});
test('定位：误差圈小的赢——第一个网络定位不会盖过之后的 GPS', () => {
  const wifi = asFix(P(3.10, 101.60, 1500)), gps = asFix(P(3.1234, 101.6543, 8));
  assert.strictEqual(betterFix(wifi, gps), gps);
  assert.strictEqual(betterFix(gps, wifi), gps, '后来的粗读数不能把好的换掉');
  assert.strictEqual(betterFix(null, wifi), wifi);
  assert.strictEqual(betterFix(gps, null), gps);
});
test('定位：一样准时取新的', () => {
  const a = asFix(P(3, 101, 10)), b = asFix(P(3.0001, 101, 10));
  assert.strictEqual(betterFix(a, b), b);
});
test('定位：够准就停，太粗就提醒', () => {
  assert.ok(fixDone(asFix(P(3, 101, 12))));
  assert.ok(!fixDone(asFix(P(3, 101, 35))));
  assert.ok(fixCoarse(asFix(P(3, 101, 800))));
  assert.ok(!fixCoarse(asFix(P(3, 101, 40))));
});
