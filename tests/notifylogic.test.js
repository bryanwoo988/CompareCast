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

/* ---- addDays ---- */
const {addDays, occurrence} = require('../notifylogic.js');
test('addDays 跨月', () => { assert.strictEqual(addDays('2026-09-30', 1), '2026-10-01'); });
test('addDays 往回跨年', () => { assert.strictEqual(addDays('2027-01-01', -1), '2026-12-31'); });
test('addDays 闰年二月', () => { assert.strictEqual(addDays('2028-02-28', 1), '2028-02-29'); });

/* ---- occurrence: which instance of a window a reminder describes ----
   The bug this exists for: a 21:00 reminder for the 06:00-12:00 slot used to
   summarise that morning — already over — instead of the next one. */
const OW = (from, to, at) => ({id:'x', on:true, from, to, at, mode:'digest'});
const D0 = '2026-09-30';

test('提醒时间就是开始时间：今天这一段', () => {
  assert.deepStrictEqual(occurrence(OW('06:00','12:00','06:00'), 360, D0),
    {atDay:D0, day:D0, cutoff:D0 + 'T06:00'});
});
test('晚上提醒早上时段：说的是明天早上', () => {
  const o = occurrence(OW('06:00','12:00','21:00'), 21 * 60, D0);
  assert.strictEqual(o.day, '2026-10-01');
  assert.strictEqual(o.atDay, D0);
});
test('时段刚好在提醒时间结束：也算明天的', () => {
  assert.strictEqual(occurrence(OW('06:00','12:00','12:00'), 720, D0).day, '2026-10-01');
});
test('时段进行中提醒：今天的，已经过去的小时切掉', () => {
  const o = occurrence(OW('06:00','12:00','09:30'), 9 * 60 + 30, D0);
  assert.strictEqual(o.day, D0);
  assert.strictEqual(o.cutoff, D0 + 'T09:00');   // the 09:00 hour is still partly ahead
});
test('午夜后补发前一天 23:50 的提醒：归属前一天', () => {
  const o = occurrence(OW('18:00','23:59','23:50'), 5, '2026-10-01');
  assert.strictEqual(o.atDay, D0);
  assert.strictEqual(o.day, D0);
});
test('跨午夜的时段，开始前提醒：今晚这一段', () => {
  assert.strictEqual(occurrence(OW('22:00','06:00','21:00'), 21 * 60, D0).day, D0);
});
test('跨午夜的时段，凌晨里提醒：昨晚开始、还在进行的那一段', () => {
  const o = occurrence(OW('22:00','06:00','03:00'), 180, D0);
  assert.strictEqual(o.day, '2026-09-29');
  assert.strictEqual(o.cutoff, D0 + 'T03:00');
});
test('跨午夜的时段，白天提醒：今晚那一段', () => {
  assert.strictEqual(occurrence(OW('22:00','06:00','07:00'), 7 * 60, D0).day, D0);
});
test('时间不合法时不给结果', () => {
  assert.strictEqual(occurrence(OW('06:00','12:00',''), 360, D0), null);
  assert.strictEqual(occurrence(OW('06:00','12:00','06:00'), 360, ''), null);
});

/* ---- windowIndices: one dated interval, explicit indices ----
   windowSlice returned a start and a count, which only describes a run of
   consecutive hours. For a window crossing midnight the matches on one date
   are not consecutive (00:00, 01:00 … then 22:00, 23:00), so the cron read
   00:00-03:00 twice and never the evening at all. */
const {windowIndices} = require('../notifylogic.js');
const HOURS = days => days.flatMap(d => Array.from({length:24}, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`));
const at = (times, idx) => idx.map(i => times[i]);
const WW = (from, to) => ({id:'x', on:true, from, to, at:from, mode:'digest'});

test('跨午夜的时段：前一天晚上接到第二天凌晨，恰好四个小时', () => {
  const t = HOURS(['2026-09-29', '2026-09-30']);
  assert.deepStrictEqual(at(t, windowIndices(t, '2026-09-29', WW('22:00', '02:00'))),
    ['2026-09-29T22:00', '2026-09-29T23:00', '2026-09-30T00:00', '2026-09-30T01:00']);
});
test('跨月也对', () => {
  const t = HOURS(['2026-09-30', '2026-10-01']);
  assert.deepStrictEqual(at(t, windowIndices(t, '2026-09-30', WW('22:00', '02:00'))),
    ['2026-09-30T22:00', '2026-09-30T23:00', '2026-10-01T00:00', '2026-10-01T01:00']);
});
test('不跨午夜的时段照旧', () => {
  const t = HOURS(['2026-09-30']);
  assert.deepStrictEqual(at(t, windowIndices(t, '2026-09-30', WW('06:00', '09:00'))),
    ['2026-09-30T06:00', '2026-09-30T07:00', '2026-09-30T08:00']);
});
test('开始等于结束：一整天，从开始时间起算', () => {
  const t = HOURS(['2026-09-30', '2026-10-01']);
  const got = at(t, windowIndices(t, '2026-09-30', WW('06:00', '06:00')));
  assert.strictEqual(got.length, 24);
  assert.strictEqual(got[0], '2026-09-30T06:00');
  assert.strictEqual(got[23], '2026-10-01T05:00');
});
test('只有部分日期的数据时，只取得到的那些', () => {
  const t = HOURS(['2026-09-30']);
  assert.deepStrictEqual(at(t, windowIndices(t, '2026-09-30', WW('22:00', '02:00'))),
    ['2026-09-30T22:00', '2026-09-30T23:00']);
});
test('时间不合法时为空', () => {
  assert.deepStrictEqual(windowIndices(HOURS(['2026-09-30']), '2026-09-30', WW('', '02:00')), []);
});

/* ---- effectiveBlocks: what the server would actually send for ----
   The client used to ask only "does this plot have windows ticked", so a plot
   whose ticked windows had all been switched off was still POSTed, rejected,
   and the old schedule left running. */
const {effectiveBlocks, makeDeviceId, validDeviceId} = require('../notifylogic.js');
const WINS = [{id:'morning', on:true}, {id:'afternoon', on:false}, {id:'evening', on:true}];
test('只留下勾选且开着的时段', () => {
  const locs = [{id:'a', notify:['morning', 'afternoon']}, {id:'b', notify:['afternoon']}, {id:'c', notify:[]}, {id:'d'}];
  assert.deepStrictEqual(effectiveBlocks(locs, WINS).map(x => [x.id, x.windows]), [['a', ['morning']]]);
});
test('时段全关时为空', () => {
  assert.deepStrictEqual(effectiveBlocks([{id:'a', notify:['morning']}], WINS.map(w => ({...w, on:false}))), []);
});
test('本地的勾选不被改动（以后重新打开时段还在）', () => {
  const loc = {id:'a', notify:['morning', 'afternoon']};
  effectiveBlocks([loc], WINS);
  assert.deepStrictEqual(loc.notify, ['morning', 'afternoon']);
});

/* ---- device id ----
   Without crypto.randomUUID the fallback was Date.now() + Math.random(),
   which contains a '.', so the server rejected every registration — and the
   id was saved, so the phone stayed broken for good. */
const RE = /^[A-Za-z0-9_-]{8,64}$/;
test('有 randomUUID 时用它，去掉横线', () => {
  const id = makeDeviceId({randomUUID:() => '12345678-1234-1234-1234-123456789abc', getRandomValues:null});
  assert.strictEqual(id, '12345678123412341234123456789abc');
});
test('没有 randomUUID 时用 getRandomValues，结果服务器接受', () => {
  const id = makeDeviceId({getRandomValues:a => { a.fill(171); return a; }});
  assert.match(id, RE);
  assert.strictEqual(id.length, 32);
});
test('识别出旧的坏 id', () => {
  assert.strictEqual(validDeviceId('1790000000000' + 0.123), false);
  assert.strictEqual(validDeviceId('12345678123412341234123456789abc'), true);
  assert.strictEqual(validDeviceId(undefined), false);
});
