const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const {runAppUpdate, VERSION_URL} = require('../server/src/cron.js');
const {updateMessage} = require('../server/src/message.js');

/* New-version notices: who is told, about what, and only once. */
const REL = [
  {v:'3.29.0', zh:['新版本推出时会通知你'], en:['You are now notified when a new version comes out'], ms:['Anda kini dimaklumkan']},
  {v:'3.28.2', zh:['修好：限流时加倍请求'], en:['Fixed: asked again when rate-limited'], ms:['Dibaiki: had']},
  {v:'3.28.1', zh:['修好：地图版权标示'], en:['Fixed: map credit line'], ms:['Dibaiki: kredit peta']}
];
const P256DH = 'BIJ7_6fCuHIGqiaM98xjRy_s5QgJ3ea8xuf5Fngx1iJo5O8_DuaKulY-oFHX-fdRezaLS0t6hrvFS6hoROxcaso';
const AUTH = 'azNDjVHPx0DLt25K4u5NMg';
function mkEnv(){
  const store = new Map();
  return {store, KV:{get:async k => store.get(k) ?? null, put:async (k, v) => store.set(k, v), delete:async k => store.delete(k)},
    VAPID_SUBJECT:'mailto:a@b.c',
    VAPID_PUBLIC_KEY:'BGJeNBIeMsmfIK_tmAdS6ttS1scBmOTdVQxUg1zEqaK1pW1U9BKtkWNK4F3yTVsHGL6gNiHfK3ORLPdEM85Lp50',
    VAPID_PRIVATE_KEY:'8W_kk0VdwFXgM9ncShpoSBfBaPNG-2p-Zb3OLII6gA8'};
}
const dev = over => Object.assign({id:'device-0001', lang:'zh', sub:{endpoint:'https://fcm.googleapis.com/x', keys:{p256dh:P256DH, auth:AUTH}},
  notify:{windows:[], rules:{}, app:true}, blocks:[]}, over);
const run = (releases, calls) => ({cache:new Map(), seen:new Set(), post:async () => ({status:201}),
  fetchJson:async url => { if(calls) calls.push(url); return releases === null ? null : {v:releases[0].v, releases}; }});
const NOW = new Date('2026-11-11T00:00:00Z');

test('文案：标题只有版本号，内容一行说点开看改了什么；不放改动细节', () => {
  const m = updateMessage('zh', REL.slice(0, 2));
  assert.strictEqual(m.title, '新 · 3.29.0 版已推出');
  assert.strictEqual(m.body, '点开查看更新内容');
  assert.strictEqual(m.kind, 'app');
  assert.strictEqual(updateMessage('en', REL.slice(0, 1)).title, 'New · Version 3.29.0 is out');
  assert.strictEqual(updateMessage('ms', REL.slice(0, 1)).title, 'Baharu · Versi 3.29.0 kini tersedia');
  assert.strictEqual(updateMessage('xx', REL.slice(0, 1)).body, 'Tap to see what\u2019s new', '不认识的语言用英文');
});

test('手机还在旧版：推一次，标题是最新的版本；第二次不重推', async () => {
  const env = mkEnv(), calls = [];
  const r = await runAppUpdate(env, dev({appv:'3.28.1'}), NOW, run(REL, calls));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].result, 'sent');
  assert.strictEqual(r[0].title, '新 · 3.29.0 版已推出');
  assert.ok(calls[0].startsWith(VERSION_URL));
  assert.strictEqual(env.store.get('upd:device-0001'), '3.29.0');
  assert.strictEqual((await runAppUpdate(env, dev({appv:'3.28.1'}), NOW, run(REL))).length, 0);
});

test('手机已经打开过新版本：不推', async () => {
  assert.strictEqual((await runAppUpdate(mkEnv(), dev({appv:'3.29.0'}), NOW, run(REL))).length, 0);
});

test('旧手机没报过版本：只推最新的一版', async () => {
  const r = await runAppUpdate(mkEnv(), dev({}), NOW, run(REL));
  assert.strictEqual(r[0].v, '3.29.0');
});

test('关掉新版本通知、读不到 version.json、或推送失败：都不记账', async () => {
  assert.strictEqual((await runAppUpdate(mkEnv(), dev({appv:'3.28.1', notify:{app:false}}), NOW, run(REL))).length, 0);
  assert.strictEqual((await runAppUpdate(mkEnv(), dev({appv:'3.28.1'}), NOW, run(null))).length, 0);
  const env = mkEnv(), rn = run(REL);
  rn.post = async () => ({status:500});
  const r = await runAppUpdate(env, dev({appv:'3.28.1'}), NOW, rn);
  assert.strictEqual(r[0].result, 'failed');
  assert.ok(!env.store.has('upd:device-0001'), '失败的要下一轮再试');
});

/* the real sw.js: tapping a new-version notice opens the app, nothing else */
test('Service Worker：点「新版本」通知只打开 App，不弹出通知详情', async () => {
  const handlers = {}, opened = [];
  const self = {addEventListener:(t, h) => { handlers[t] = h; }, location:new URL('https://bryanwoo988.github.io/CompareCast/sw.js'),
    clients:{matchAll:async () => [], openWindow:async u => { opened.push(u); }}};
  const ctx = {self, caches:{open:async () => ({put:async () => { opened.push('parked a notice'); }})}, URL, console, importScripts:() => {}};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), ctx);
  let done;
  handlers.notificationclick({notification:{close(){}, title:'🆕', body:'x', data:{kind:'app'}}, waitUntil:p => { done = p; }});
  await done;
  assert.strictEqual(JSON.stringify(opened), JSON.stringify(['./']));
});
