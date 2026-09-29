const {test} = require('node:test');
const assert = require('node:assert');
const {moveItem, targetIndex} = require('../listlogic.js');

/* ---- moveItem ---- */
test('往后移', () => {
  assert.deepStrictEqual(moveItem(['a','b','c','d'], 0, 2), ['b','c','a','d']);
});
test('往前移', () => {
  assert.deepStrictEqual(moveItem(['a','b','c','d'], 3, 1), ['a','d','b','c']);
});
test('移到最前', () => {
  assert.deepStrictEqual(moveItem(['a','b','c'], 2, 0), ['c','a','b']);
});
test('移到最后', () => {
  assert.deepStrictEqual(moveItem(['a','b','c'], 0, 2), ['b','c','a']);
});
test('原地不动', () => {
  assert.deepStrictEqual(moveItem(['a','b','c'], 1, 1), ['a','b','c']);
});
test('不修改原数组', () => {
  const src = ['a','b','c'];
  moveItem(src, 0, 2);
  assert.deepStrictEqual(src, ['a','b','c']);
});
test('越界索引原样返回副本', () => {
  assert.deepStrictEqual(moveItem(['a','b'], 5, 0), ['a','b']);
  assert.deepStrictEqual(moveItem(['a','b'], 0, -3), ['a','b']);
});
test('空数组不抛错', () => {
  assert.deepStrictEqual(moveItem([], 0, 0), []);
});

/* ---- targetIndex ---- */
test('落在某张卡片正中', () => {
  assert.strictEqual(targetIndex([50, 150, 250], 150), 1);
});
test('拖到第一张之上', () => {
  assert.strictEqual(targetIndex([50, 150, 250], -400), 0);
});
test('拖到最后一张之下', () => {
  assert.strictEqual(targetIndex([50, 150, 250], 9999), 2);
});
test('取最近的一张', () => {
  assert.strictEqual(targetIndex([50, 150, 250], 160), 1);
  assert.strictEqual(targetIndex([50, 150, 250], 210), 2);
});
test('正好在中点时取靠前的那张', () => {
  assert.strictEqual(targetIndex([50, 150], 100), 0);
});
test('只有一张时恒为 0', () => {
  assert.strictEqual(targetIndex([120], 9999), 0);
});
test('空列表返回 -1', () => {
  assert.strictEqual(targetIndex([], 100), -1);
});

/* ---- pullOffset ---- */
const {pullOffset} = require('../listlogic.js');

test('没拉动就没有位移', () => {
  assert.strictEqual(pullOffset(0, 90), 0);
});
test('往上推不产生位移', () => {
  assert.strictEqual(pullOffset(-120, 90), 0);
});
test('拉到 max 时位移是一半——阻尼确实在起作用', () => {
  assert.strictEqual(pullOffset(90, 90), 45);
});
test('位移永远不超过 max', () => {
  [100, 500, 5000, 1e9].forEach(dy => assert.ok(pullOffset(dy, 90) < 90));
});
test('位移随拉动单调递增', () => {
  let prev = -1;
  for(let dy = 0; dy <= 600; dy += 20){
    const v = pullOffset(dy, 90);
    assert.ok(v >= prev, `dy=${dy}`);
    prev = v;
  }
});
test('小幅拉动时接近线性', () => {
  assert.ok(Math.abs(pullOffset(9, 90) - 9) < 1);
});

/* ---- cleanLocations ----
   Broken JSON was handled; valid JSON of the wrong shape was not. One null
   in the saved list crashed startup before anything drew, and the user saw
   no plots at all — including the good ones still in storage. */
const {cleanLocations} = require('../listlogic.js');
test('null 和非对象被丢掉，好的保留', () => {
  const out = cleanLocations([null, 7, 'x', {id:'a', name:'A', lat:3, lon:101}]);
  assert.deepStrictEqual(out.map(l => l.id), ['a']);
});
test('坐标不合法的丢掉', () => {
  const out = cleanLocations([
    {id:'a', lat:null, lon:101}, {id:'b', lat:95, lon:0}, {id:'c', lat:3, lon:'x'}, {id:'d', lat:'3.5', lon:'101.2'}]);
  assert.deepStrictEqual(out.map(l => [l.id, l.lat, l.lon]), [['d', 3.5, 101.2]]);
});
test('没有 id 或重复 id 的丢掉', () => {
  const out = cleanLocations([{lat:1, lon:1}, {id:'a', lat:1, lon:1}, {id:'a', lat:2, lon:2}]);
  assert.deepStrictEqual(out.map(l => l.lat), [1]);
});
test('名字和提醒勾选被整理成可用的形状', () => {
  const [l] = cleanLocations([{id:'a', lat:3.1, lon:101.7, name:'', notify:['morning', 5, null]}]);
  assert.strictEqual(l.name, '3.100, 101.700');
  assert.deepStrictEqual(l.notify, ['morning']);
  assert.strictEqual(l.region, '');
});
test('其他字段（模式等）原样保留', () => {
  const [l] = cleanLocations([{id:'a', lat:1, lon:1, name:'A', model:'ecmwf_ifs025'}]);
  assert.strictEqual(l.model, 'ecmwf_ifs025');
});
test('不是数组时得到空列表', () => {
  assert.deepStrictEqual(cleanLocations({}), []);
  assert.deepStrictEqual(cleanLocations(undefined), []);
});
