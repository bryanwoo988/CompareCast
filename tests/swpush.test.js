/* The service worker's push handler, run for real against a fake
   registration: a warning that reaches the phone after it has ended says
   so in its title. One issued at 12:00 until 15:00 once arrived at 18:46. */
const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

async function push(payload){
  const handlers = {}, shown = [];
  const self = {
    addEventListener: (t, h) => { handlers[t] = h; },
    location: new URL('https://bryanwoo988.github.io/CompareCast/sw.js'),
    clients: {claim: async () => {}, matchAll: async () => []},
    skipWaiting: () => {},
    registration: {showNotification: async (title, opts) => { shown.push({title, opts}); }}
  };
  const ctx = {self, caches: {keys: async () => [], delete: async () => true, open: async () => ({})},
    importScripts: () => {}, URL, console, Date};
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  let p;
  handlers.push({data: {json: () => payload}, waitUntil: x => { p = x; }});
  await p;
  return shown[0];
}

test('a warning that has already ended says so', async () => {
  const n = await push({title:'⚡ 雷暴警告 · Setia Alam', body:'至 15:00', until:Date.now() - 3 * 3600e3, ended:'已结束'});
  assert.strictEqual(n.title, '已结束 · ⚡ 雷暴警告 · Setia Alam');
});

test('a current warning, and a message without an end, are shown as sent', async () => {
  assert.strictEqual((await push({title:'⚡ 雷暴警告 · A', until:Date.now() + 3600e3, ended:'已结束'})).title, '⚡ 雷暴警告 · A');
  assert.strictEqual((await push({title:'新 · 3.32.1 版已推出', kind:'app'})).title, '新 · 3.32.1 版已推出');
});
