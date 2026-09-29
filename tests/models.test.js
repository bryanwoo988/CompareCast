const {test} = require('node:test');
const assert = require('node:assert');
const {MODEL_IDS, forModel, modelsParam} = require('../server/src/models.js');

/* the worker's list must be the app's list, or a plot set to a model the
   worker does not know would silently fall back to Best Match */
test('服务器的模式清单与 App 一致', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const block = src.slice(src.indexOf('const MODELS = ['), src.indexOf('];', src.indexOf('const MODELS = [')));
  const ids = [...block.matchAll(/\{id:'([a-z0-9_]+)'/g)].map(m => m[1]);
  assert.deepStrictEqual([...MODEL_IDS].sort(), ids.sort());
});

test('Best Match 单独请求，不加后缀', () => {
  assert.strictEqual(modelsParam('best_match'), 'best_match');
});
test('其他模式连同 Best Match 一起请求', () => {
  assert.strictEqual(modelsParam('ecmwf_ifs025'), 'ecmwf_ifs025,best_match');
});
test('未知模式当作 Best Match', () => {
  assert.strictEqual(modelsParam('nope'), 'best_match');
  assert.strictEqual(modelsParam(undefined), 'best_match');
});

const H = {
  time:['t0', 't1'],
  temperature_2m_ecmwf_ifs025:[30, 31], precipitation_ecmwf_ifs025:[0, 2],
  wind_speed_10m_ecmwf_ifs025:[5, 6], wind_gusts_10m_ecmwf_ifs025:[9, 12],
  temperature_2m_best_match:[29, 30], precipitation_probability_best_match:[20, 80]
};

/* the same split the app makes: amounts from the plot's model, chance of
   rain from Best Match — the only source that always has it */
test('数值取所选模式，降雨机率取 Best Match', () => {
  const h = forModel(H, 'ecmwf_ifs025');
  assert.deepStrictEqual(h.temperature_2m, [30, 31]);
  assert.deepStrictEqual(h.precipitation, [0, 2]);
  assert.deepStrictEqual(h.wind_gusts_10m, [9, 12]);
  assert.deepStrictEqual(h.precipitation_probability, [20, 80]);
  assert.deepStrictEqual(h.time, ['t0', 't1']);
});
test('Best Match 原样返回', () => {
  const plain = {time:['t0'], temperature_2m:[28]};
  assert.strictEqual(forModel(plain, 'best_match'), plain);
});
test('没有 time 时不给结果', () => {
  assert.strictEqual(forModel({}, 'ecmwf_ifs025'), null);
  assert.strictEqual(forModel(null, 'best_match'), null);
});
