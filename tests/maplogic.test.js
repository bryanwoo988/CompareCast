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
