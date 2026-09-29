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
