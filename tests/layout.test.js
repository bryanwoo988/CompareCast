const {test} = require('node:test');
const assert = require('node:assert');
const {resolveLayout, normalizeLayout, isDefaultLayout} = require('../layout.js');

const REG = ['summary', 'hourly', 'tenday', 'cards', 'cells', 'chartT', 'chartP', 'accuracy'];
const ids = res => res.map(x => x.id);
const shown = res => res.filter(x => x.on).map(x => x.id);

/* ---- nothing saved ---- */
test('没存过就是注册表原顺序，全部显示', () => {
  const r = resolveLayout(null, REG);
  assert.deepStrictEqual(ids(r), REG);
  assert.deepStrictEqual(shown(r), REG);
});

test('空对象等同没存过', () => {
  assert.deepStrictEqual(ids(resolveLayout({}, REG)), REG);
});

test('order 是空数组也回到注册表顺序', () => {
  assert.deepStrictEqual(ids(resolveLayout({order:[], hidden:[]}, REG)), REG);
});

/* ---- reordering ---- */
test('存下来的顺序被照用', () => {
  const saved = {order:['tenday', 'hourly', 'summary', 'cards', 'cells', 'chartT', 'chartP', 'accuracy']};
  assert.deepStrictEqual(ids(resolveLayout(saved, REG)), saved.order);
});

test('隐藏的区块还在列表里，只是 on 为 false', () => {
  const r = resolveLayout({order:REG, hidden:['cells', 'accuracy']}, REG);
  assert.deepStrictEqual(ids(r), REG);
  assert.deepStrictEqual(shown(r), ['summary', 'hourly', 'tenday', 'cards', 'chartT', 'chartP']);
});

/* ---- the upgrade contract: new sections must reach existing users ----
   This is the whole reason the saved value is an override rather than a
   literal list. A regression here is silent: nobody sees the new card and
   nothing throws. */
test('新区块插在它注册顺序里前一个还在的区块后面', () => {
  const old = ['summary', 'hourly', 'tenday', 'cards', 'cells', 'chartT', 'chartP', 'accuracy'];
  const grown = ['summary', 'hourly', 'tenday', 'radar', 'cards', 'cells', 'chartT', 'chartP', 'accuracy'];
  assert.deepStrictEqual(ids(resolveLayout({order:old}, grown)),
    ['summary', 'hourly', 'tenday', 'radar', 'cards', 'cells', 'chartT', 'chartP', 'accuracy']);
});

test('用户改过顺序，新区块跟着它的锚点走而不是回到注册位置', () => {
  /* the user put tenday first; radar registers after tenday, so it follows
     tenday to the top rather than appearing where the registry lists it */
  const saved = {order:['tenday', 'summary', 'hourly']};
  const grown = ['summary', 'hourly', 'tenday', 'radar'];
  assert.deepStrictEqual(ids(resolveLayout(saved, grown)),
    ['tenday', 'radar', 'summary', 'hourly']);
});

test('前面没有锚点时插在后一个锚点之前', () => {
  const grown = ['alpha', 'beta', 'gamma'];
  assert.deepStrictEqual(ids(resolveLayout({order:['gamma']}, grown)),
    ['alpha', 'beta', 'gamma']);
});

test('两个新区块都落在最前面时保持彼此的注册顺序', () => {
  const grown = ['alpha', 'beta', 'gamma'];
  assert.deepStrictEqual(ids(resolveLayout({order:['gamma']}, grown)), ['alpha', 'beta', 'gamma']);
});

test('存的全是已删除的 id 时退回完整注册表', () => {
  assert.deepStrictEqual(ids(resolveLayout({order:['ghost1', 'ghost2']}, REG)), REG);
});

/* ---- ids that no longer exist ---- */
test('order 里已删除的区块被忽略', () => {
  const saved = {order:['hourly', 'ghost', 'summary', 'tenday', 'cards', 'cells', 'chartT', 'chartP', 'accuracy']};
  assert.deepStrictEqual(ids(resolveLayout(saved, REG)),
    ['hourly', 'summary', 'tenday', 'cards', 'cells', 'chartT', 'chartP', 'accuracy']);
});

test('hidden 里已删除的区块不影响结果', () => {
  const r = resolveLayout({order:REG, hidden:['ghost', 'cells']}, REG);
  assert.deepStrictEqual(shown(r).includes('cells'), false);
  assert.strictEqual(r.length, REG.length);
});

test('order 里重复的 id 只保留第一次', () => {
  const saved = {order:['hourly', 'hourly', 'summary']};
  const out = ids(resolveLayout(saved, ['summary', 'hourly']));
  assert.deepStrictEqual(out, ['hourly', 'summary']);
});

/* ---- defensive: callers pass whatever localStorage held ---- */
test('order 不是数组时当作没存过', () => {
  assert.deepStrictEqual(ids(resolveLayout({order:'hourly'}, REG)), REG);
});

test('hidden 不是数组时当作没有隐藏', () => {
  assert.deepStrictEqual(shown(resolveLayout({order:REG, hidden:'cells'}, REG)), REG);
});

test('空注册表得到空结果', () => {
  assert.deepStrictEqual(resolveLayout({order:['a']}, []), []);
});

/* ---- normalizeLayout ---- */
test('normalize 产出可以直接存的规范形式', () => {
  const n = normalizeLayout({order:['tenday', 'ghost', 'hourly'], hidden:['cells', 'ghost']}, REG);
  assert.deepStrictEqual(n.order, ids(resolveLayout({order:['tenday', 'hourly']}, REG)));
  assert.deepStrictEqual(n.hidden, ['cells']);
});

test('normalize 的结果再解析一次不变', () => {
  const once = normalizeLayout({order:['cells', 'summary'], hidden:['chartP']}, REG);
  const twice = normalizeLayout(once, REG);
  assert.deepStrictEqual(twice, once);
});

test('normalize 的 hidden 按 order 排列，便于比较', () => {
  const n = normalizeLayout({order:REG, hidden:['accuracy', 'summary']}, REG);
  assert.deepStrictEqual(n.hidden, ['summary', 'accuracy']);
});

/* ---- isDefaultLayout ---- */
test('没存过算默认', () => {
  assert.strictEqual(isDefaultLayout(null, REG), true);
  assert.strictEqual(isDefaultLayout({}, REG), true);
});

test('顺序原样且没有隐藏算默认', () => {
  assert.strictEqual(isDefaultLayout({order:REG, hidden:[]}, REG), true);
});

test('改过顺序不算默认', () => {
  assert.strictEqual(isDefaultLayout({order:['hourly', 'summary'], hidden:[]}, REG), false);
});

test('藏了东西不算默认', () => {
  assert.strictEqual(isDefaultLayout({order:REG, hidden:['cells']}, REG), false);
});
