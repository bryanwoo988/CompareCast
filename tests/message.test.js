const {test} = require('node:test');
const assert = require('node:assert');
const {messageFor} = require('../server/src/message.js');

const WIN = {id:'morning', mode:'digest'};
const STATS = {rainProb:80, rainSum:4.2, tMax:33, tMin:24, wind:18, gust:30};
const RULES = {rainProb:{on:true, v:60}, wind:{on:true, v:20}};
const METRIC = {temp:'celsius', wind:'kmh', rain:'mm'};

test('标题是地块名', () => {
  assert.strictEqual(messageFor('zh', WIN, STATS, [], RULES, METRIC, 'Alpha').title, 'Alpha');
});
test('摘要含时段名、降雨与温度', () => {
  const b = messageFor('zh', WIN, STATS, [], RULES, METRIC, 'Alpha').body;
  assert.ok(b.includes('早上'), b);
  assert.ok(b.includes('80%'), b);
  assert.ok(b.includes('33'), b);
});
test('阈值模式只列出超标项', () => {
  const w = {id:'morning', mode:'threshold'};
  const b = messageFor('zh', w, STATS, ['rainProb'], RULES, METRIC, 'Alpha').body;
  assert.ok(b.includes('80%'), b);
  assert.ok(!b.includes('33'), '不该出现未超标的温度: ' + b);
});
test('阈值模式带上阈值本身', () => {
  const w = {id:'morning', mode:'threshold'};
  const b = messageFor('zh', w, STATS, ['rainProb'], RULES, METRIC, 'Alpha').body;
  assert.ok(b.includes('60'), b);
});
test('三种语言都有输出且互不相同', () => {
  const out = ['zh','en','ms'].map(l => messageFor(l, WIN, STATS, [], RULES, METRIC, 'A').body);
  out.forEach(b => assert.ok(b && b.length > 4));
  assert.strictEqual(new Set(out).size, 3);
});
test('单位跟随设置：华氏与英里', () => {
  const b = messageFor('en', WIN, STATS, [], RULES, {temp:'fahrenheit', wind:'mph', rain:'mm'}, 'A').body;
  assert.ok(b.includes('91'), '33°C 应显示为 91°F: ' + b);
});
test('null 的项不出现在文案里', () => {
  const s = {rainProb:null, rainSum:null, tMax:30, tMin:22, wind:null, gust:null};
  const b = messageFor('zh', WIN, s, [], RULES, METRIC, 'A').body;
  assert.ok(!b.includes('null'), b);
  assert.ok(!b.includes('NaN'), b);
  assert.ok(b.includes('30'), b);
});
test('全部为 null 时返回 null，调用方据此不发送', () => {
  const s = {rainProb:null, rainSum:null, tMax:null, tMin:null, wind:null, gust:null};
  assert.strictEqual(messageFor('zh', WIN, s, [], RULES, METRIC, 'A'), null);
});

/* ---- one notification per window ----
   Separate pushes all carried the same tag, so each replaced the last and only
   one plot's warning survived. A window's plots now travel in one message. */
const {messageForWindow} = require('../server/src/message.js');
const TH = {id:'afternoon', mode:'threshold'};
const E = (name, rainProb) => ({name, stats:{rainProb}, hits:['rainProb']});

test('只有一个地块时保持原来的样子：标题是地块名', () => {
  const m = messageForWindow('zh', TH, [E('Alpha', 90)], RULES, METRIC);
  assert.strictEqual(m.title, 'Alpha');
  assert.strictEqual(m.body, '下午 · 降雨概率 90% (≥60%)');
});
test('多个地块合成一条，每个地块一行', () => {
  const m = messageForWindow('zh', TH, [E('Alpha', 90), E('Beta', 75), E('Gamma', 64)], RULES, METRIC);
  assert.strictEqual(m.title, '下午 · 3 个地块');
  assert.deepStrictEqual(m.body.split('\n'), [
    'Alpha：降雨概率 90% (≥60%)', 'Beta：降雨概率 75% (≥60%)', 'Gamma：降雨概率 64% (≥60%)']);
});
test('英文和马来文的多地块标题', () => {
  assert.strictEqual(messageForWindow('en', TH, [E('A', 90), E('B', 80)], RULES, METRIC).title, 'Afternoon · 2 locations');
  assert.strictEqual(messageForWindow('ms', TH, [E('A', 90), E('B', 80)], RULES, METRIC).title, 'Petang · 2 lokasi');
});
test('没话可说的地块不占一行', () => {
  const quiet = {name:'Quiet', stats:{}, hits:[]};
  const m = messageForWindow('zh', TH, [E('Alpha', 90), quiet], RULES, METRIC);
  assert.strictEqual(m.title, 'Alpha');
});
test('全部没话可说就不发', () => {
  assert.strictEqual(messageForWindow('zh', TH, [{name:'Q', stats:{}, hits:[]}], RULES, METRIC), null);
  assert.strictEqual(messageForWindow('zh', TH, [], RULES, METRIC), null);
});
test('旧的单地块函数结果不变', () => {
  assert.deepStrictEqual(messageFor('zh', TH, {rainProb:90}, ['rainProb'], RULES, METRIC, 'Alpha'),
    messageForWindow('zh', TH, [E('Alpha', 90)], RULES, METRIC));
});
