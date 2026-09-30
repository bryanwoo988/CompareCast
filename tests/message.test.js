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
/* ---- many plots: compact, grouped, worst first ----
   Eight plots as one line each ran to 250-360 characters; an iPhone banner
   shows about four lines, so only the first three or four plots were seen —
   in list order, so the wettest could be the one cut off. */
const W8 = {rainProb:{on:true, v:60}, wind:{on:true, v:20}};
const EIGHT = [['Blok A', 72, 24], ['Blok B', 95, 12], ['Blok C', 64, 12], ['Blok D', 88, 24],
               ['Blok E', 61, 12], ['Blok F', 90, 12], ['Blok G', 77, 24], ['Blok H', 83, 12]]
  .map(([name, p, w]) => ({id:name, name, stats:{rainProb:p, wind:w},
                           hits:w >= 20 ? ['rainProb', 'wind'] : ['rainProb']}));

test('门槛模式：按条件分组，一行放多个地块，最严重的在前', () => {
  const m = messageForWindow('zh', TH, EIGHT, W8, METRIC);
  assert.strictEqual(m.title, '下午 · 8 个地块超过门槛');
  assert.deepStrictEqual(m.body.split('\n'), [
    '降雨概率 ≥60%：Blok B 95%、Blok F 90%、Blok D 88%、Blok H 83%、Blok G 77%、Blok A 72%、Blok C 64%、Blok E 61%',
    /* equal values keep the rain order — the same "worst first" as the rest */
    '风 ≥20 km/h：Blok D 24、Blok G 24、Blok A 24']);
});
test('紧凑排版短得多（8 个地块）', () => {
  const m = messageForWindow('zh', TH, EIGHT, W8, METRIC);
  assert.ok(m.body.length < 140, '还是太长：' + m.body.length);
});
test('每个地块的完整内容另外带着，给 App 里的提醒页用，同样最严重的在前', () => {
  const m = messageForWindow('zh', TH, EIGHT, W8, METRIC);
  assert.strictEqual(m.detail.length, 8);
  assert.deepStrictEqual(m.detail[0], {id:'Blok B', name:'Blok B', text:'降雨概率 95% (≥60%)'});
  assert.strictEqual(m.detail.find(x => x.id === 'Blok A').text, '降雨概率 72% (≥60%) · 风 24 km/h (≥20 km/h)');
});
test('查不到预报的地块单独一行，排在最后', () => {
  const m = messageForWindow('zh', TH, [...EIGHT.slice(0, 2), {id:'X', name:'Blok X', noData:true}], W8, METRIC);
  const lines = m.body.split('\n');
  assert.strictEqual(lines[lines.length - 1], '暂时查不到预报：Blok X');
  assert.strictEqual(m.detail[m.detail.length - 1].id, 'X');
});
test('最低温的门槛是往下算，最冷的排前面', () => {
  const cold = [['P', 21], ['Q', 18], ['R', 20]].map(([n, v]) => ({id:n, name:n, stats:{tMin:v}, hits:['tMin']}));
  const m = messageForWindow('zh', TH, cold, {tMin:{on:true, v:22}}, METRIC);
  assert.strictEqual(m.body, '最低 ≤22°：Q 18°、R 20°、P 21°');
});
test('每天摘要：降雨机率最高的在前，标题带出最高值', () => {
  const dg = {id:'afternoon', mode:'digest'};
  const es = [['A', 40, 0], ['B', 95, 3.5], ['C', 70, 1]].map(([n, p, mm]) =>
    ({id:n, name:n, stats:{rainProb:p, rainSum:mm, tMax:33, tMin:24, wind:14}}));
  const m = messageForWindow('zh', dg, es, {}, METRIC);
  assert.strictEqual(m.title, '下午 · 3 个地块 · 降雨最高 95%');
  assert.deepStrictEqual(m.body.split('\n'), [
    'B 95% · 3.5 mm · 24°–33° · 14 km/h',
    'C 70% · 1 mm · 24°–33° · 14 km/h',
    'A 40% · 24°–33° · 14 km/h']);
});
test('英文和马来文的多地块标题与分隔', () => {
  const en = messageForWindow('en', TH, EIGHT.slice(0, 2), W8, METRIC);
  assert.strictEqual(en.title, 'Afternoon · 2 locations over your limits');
  assert.strictEqual(en.body.split('\n')[0], 'Rain ≥60%: Blok B 95%, Blok A 72%');
  const ms = messageForWindow('ms', TH, EIGHT.slice(0, 2), W8, METRIC);
  assert.strictEqual(ms.title, 'Petang · 2 lokasi melepasi had');
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
