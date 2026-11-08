const {test} = require('node:test');
const assert = require('node:assert');
const {floodStations, floodNear, isoOf} = require('../server/src/flood.js');

/* rows in the shape of JPS's latestreadingstrendabc.json (real values,
   8 November 2026) */
const row = o => Object.assign({a:'x', b:'Sg. Binjai di Pekan Meru', c:'3.1155', d:'101.4253', e:'Klang', f:'SELANGOR',
  i:'RF,WL', m:'4.08', n:'Warning', o:'4', p:'0.08', q:'08/11/2026 16:15', s:'Receding'}, o);
const NOW = '2026-11-08T16:30';

test('日期格式', () => {
  assert.strictEqual(isoOf('08/11/2026 16:15'), '2026-11-08T16:15');
  assert.strictEqual(isoOf(''), null);
});

test('只留警告和危险；注意和正常不算', () => {
  const s = floodStations([row({a:'1'}), row({a:'2', n:'Danger'}), row({a:'3', n:'Alert'}), row({a:'4', n:'Normal'}), row({a:'5', n:'Error'})], NOW);
  assert.deepStrictEqual(s.map(x => x.id), ['1', '2']);
});

test('警戒线是 0 的站（沙巴那批）当作没设定，不算危险', () => {
  assert.strictEqual(floodStations([row({n:'Danger', o:'0', m:'315.5'})], NOW).length, 0);
});

test('两小时没更新的站不算；只有雨量计、没有水位的站不算', () => {
  assert.strictEqual(floodStations([row({q:'08/11/2026 03:15'})], NOW).length, 0);
  assert.strictEqual(floodStations([row({i:'RF'})], NOW).length, 0);
  assert.strictEqual(floodStations([row({c:''})], NOW).length, 0);
});

test('10 km 内才算，危险排在警告前面', () => {
  const s = floodStations([row({a:'w'}), row({a:'d', n:'Danger', c:'3.13', d:'101.44'}), row({a:'far', c:'3.5'})], NOW);
  const near = floodNear(s, 3.1036, 101.461);   // Setia Alam
  assert.deepStrictEqual(near.map(x => x.id), ['d', 'w']);
  assert.ok(near[1].km > 3 && near[1].km < 6, '距离不对：' + near[1].km);
});

test('不是数组就当没有', () => {
  assert.deepStrictEqual(floodStations(null, NOW), []);
});

test('直接从文字里挑出警告和危险的站，结果跟完整解析一样', () => {
  const {floodStationsFromText} = require('../server/src/flood.js');
  const list = [row({a:'1'}), row({a:'2', n:'Normal'}), row({a:'3', n:'Danger'}), row({a:'4', n:'Danger', o:'0'})];
  const text = JSON.stringify(list);
  assert.deepStrictEqual(floodStationsFromText(text, NOW).map(x => x.id).sort(), floodStations(list, NOW).map(x => x.id).sort());
  assert.deepStrictEqual(floodStationsFromText(null, NOW), []);
  assert.deepStrictEqual(floodStationsFromText('<html>error</html>', NOW), []);
});
