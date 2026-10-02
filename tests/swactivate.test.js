const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');

/* Every one of Bryan's apps is served from bryanwoo988.github.io, and Cache
   Storage is shared per origin. When this worker activates it may clear its
   own old caches ('pw-v3.x-shell'), but never another app's offline copy.
   Runs the real sw.js's activate handler against a fake Cache Storage. */
const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

function worker(names){
  const store = new Set(names), handlers = {};
  const self = {
    addEventListener: (t, h) => { handlers[t] = h; },
    location: new URL('https://bryanwoo988.github.io/CompareCast/sw.js'),
    clients: {claim: async () => {}},
    skipWaiting: () => {},
  };
  const ctx = {self, caches: {keys: async () => [...store], delete: async n => store.delete(n), open: async () => ({})},
    importScripts: () => {}, URL, console};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return {store, async activate(){ let p; handlers.activate({waitUntil: x => { p = x; }}); await p; }};
}

test('激活：只清掉自己旧版本的缓存', async () => {
  const w = worker(['pw-shell', 'pw-notice', 'pw-v3.21.0-shell']);
  await w.activate();
  assert.deepStrictEqual([...w.store].sort(), ['pw-notice', 'pw-shell']);
});

test('激活：同一个网域上其他 App 的缓存不能删', async () => {
  const others = ['opwiki-936c9276a0', 'opb-shell', 'ndvi-shell', 'meteo-0123456789'];
  const w = worker(['pw-shell', 'pw-notice', ...others]);
  await w.activate();
  assert.deepStrictEqual([...w.store].sort(), ['pw-notice', 'pw-shell', ...others].sort());
});
