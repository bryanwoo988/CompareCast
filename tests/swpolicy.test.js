const {test} = require('node:test');
const assert = require('node:assert');
const {cacheStrategy, cacheKey} = require('../swpolicy.js');

const O = 'https://bryanwoo988.github.io';
const s = u => cacheStrategy(u, O);

/* Weather and tiles must never be stored — a cached forecast is a wrong
   forecast, and tiles would fill the device. */
test('天气数据从不缓存', () => {
  assert.strictEqual(s('https://api.open-meteo.com/v1/forecast?x=1'), 'never');
  assert.strictEqual(s('https://archive-api.open-meteo.com/v1/archive'), 'never');
});
test('地图瓦片从不缓存', () => {
  assert.strictEqual(s('https://server.arcgisonline.com/ArcGIS/rest/tile/1/2/3'), 'never');
  assert.strictEqual(s('https://a.basemaps.cartocdn.com/dark_all/1/2/3.png'), 'never');
});

/* The point of this change: our own files come from the network first, so an
   update lands on the first launch rather than the second. */
test('自己的文件走网络优先', () => {
  ['/', '/index.html', '/app.js', '/sw.js', '/notifylogic.js', '/manifest.webmanifest']
    .forEach(p => assert.strictEqual(s(O + p), 'fresh', p));
});

/* The Leaflet URL is version-pinned, so it can never change under us and
   re-fetching it on every launch would only cost time. */
test('版本固定的第三方库走缓存优先', () => {
  assert.strictEqual(s('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'), 'immutable');
  assert.strictEqual(s('https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css'), 'immutable');
});

test('其他来源一律不接管', () => {
  assert.strictEqual(s('https://example.com/whatever.js'), 'never');
  assert.strictEqual(s('https://comparecast-push.hockhynnwoo.workers.dev/sub'), 'never');
});
test('无法解析的 URL 不抛错', () => {
  assert.strictEqual(s('not a url', O), 'never');
});
test('本地开发的 origin 同样算自己的文件', () => {
  assert.strictEqual(cacheStrategy('http://127.0.0.1:8777/app.js', 'http://127.0.0.1:8777'), 'fresh');
});

/* ---- one cache entry per file, whatever revision asked for it ----
   Scripts arrive as app.js?r=<revision>. Keyed by the full URL, every deploy
   would add another copy of every file, and an offline start could only find
   the copy for exactly its own revision. */
test('脚本的修订标记不进缓存键', () => {
  assert.strictEqual(cacheKey('https://a.github.io/CompareCast/app.js?r=09%2F30%2F2026'), 'https://a.github.io/CompareCast/app.js');
});
test('页面的查询参数也不进缓存键', () => {
  assert.strictEqual(cacheKey('https://a.github.io/CompareCast/index.html?loc=kl'), 'https://a.github.io/CompareCast/index.html');
});
test('没有查询参数的原样', () => {
  assert.strictEqual(cacheKey('https://a.github.io/CompareCast/sw.js'), 'https://a.github.io/CompareCast/sw.js');
});
