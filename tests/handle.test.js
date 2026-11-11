const {test} = require('node:test');
const assert = require('node:assert');
/* test-only key material in the real encoded shapes */
const K_P = 'BIJ7_6fCuHIGqiaM98xjRy_s5QgJ3ea8xuf5Fngx1iJo5O8_DuaKulY-oFHX-fdRezaLS0t6hrvFS6hoROxcaso';
const K_A = 'azNDjVHPx0DLt25K4u5NMg';
const {handle, MAX_BODY, MAX_DEVICES} = require('../server/src/index.js');

const ORIGIN = 'https://bryanwoo988.github.io';
function mkEnv(n){
  const store = new Map();
  for(let i = 0; i < (n || 0); i++) store.set('dev:existing' + String(i).padStart(4, '0'), '{}');
  return {ORIGIN, store, KV:{
    async get(k){ return store.has(k) ? store.get(k) : null; },
    async put(k, v){ store.set(k, v); },
    async delete(k){ store.delete(k); },
    async list({prefix, limit}){
      const keys = [...store.keys()].filter(k => k.startsWith(prefix)).slice(0, limit).map(name => ({name}));
      return {keys, list_complete:true};
    }
  }};
}
const BODY = id => ({
  id, tz:'Asia/Kuala_Lumpur', lang:'zh',
  sub:{endpoint:'https://web.push.apple.com/x', keys:{p256dh:K_P, auth:K_A}},
  notify:{windows:[{id:'morning', on:true, from:'06:00', to:'12:00', at:'06:00', mode:'threshold'}], rules:{}},
  blocks:[{id:'l1', name:'A', lat:3, lon:101, windows:['morning']}]
});
const post = (body, extra) => new Request('https://w.example/sub', Object.assign({
  method:'POST', headers:{'Content-Type':'application/json', Origin:ORIGIN},
  body:typeof body === 'string' ? body : JSON.stringify(body)}, extra || {}));

test('正常注册', async () => {
  const env = mkEnv();
  assert.strictEqual((await handle(post(BODY('abcdefgh1234')), env)).status, 204);
  assert.ok(env.store.has('dev:abcdefgh1234'));
});
test('超大的请求体被拒，什么都不存', async () => {
  const env = mkEnv();
  const big = JSON.stringify(Object.assign(BODY('abcdefgh1234'), {pad:'x'.repeat(MAX_BODY)}));
  assert.strictEqual((await handle(post(big), env)).status, 413);
  assert.strictEqual(env.store.size, 0);
});
test('设备数到上限后，新设备被拒', async () => {
  const env = mkEnv(MAX_DEVICES);
  assert.strictEqual((await handle(post(BODY('brandnew1234')), env)).status, 429);
  assert.ok(!env.store.has('dev:brandnew1234'));
});
test('到上限时，已有设备照常更新', async () => {
  const env = mkEnv(MAX_DEVICES);
  env.store.set('dev:abcdefgh1234', '{}');
  assert.strictEqual((await handle(post(BODY('abcdefgh1234')), env)).status, 204);
});
test('别的网站来的请求被拒', async () => {
  const r = await handle(post(BODY('abcdefgh1234'), {headers:{'Content-Type':'application/json', Origin:'https://evil.example'}}), mkEnv());
  assert.strictEqual(r.status, 403);
});
test('注销删除设备', async () => {
  const env = mkEnv();
  env.store.set('dev:abcdefgh1234', '{}');
  const r = await handle(new Request('https://w.example/sub', {method:'DELETE',
    headers:{'Content-Type':'application/json', Origin:ORIGIN}, body:JSON.stringify({id:'abcdefgh1234'})}), env);
  assert.strictEqual(r.status, 204);
  assert.ok(!env.store.has('dev:abcdefgh1234'));
});

/* A02: switching off every window a plot used made the POST fail validation
   (noBlocks), and the old record — with the old schedule — stayed and kept
   sending. An empty effective schedule now withdraws the record. */
test('生效的地块为零、新版本通知也关了时，服务器删掉旧记录', async () => {
  const env = mkEnv();
  await handle(post(BODY('abcdefgh1234')), env);
  assert.ok(env.store.has('dev:abcdefgh1234'));
  const off = BODY('abcdefgh1234');
  off.notify.windows[0].on = false;
  off.notify.app = false;
  const r = await handle(post(off), env);
  assert.strictEqual(r.status, 400);
  assert.ok(!env.store.has('dev:abcdefgh1234'), '旧排程还留着，会继续发');
});

/* GET /radar: MetMalaysia's image passed through for the app's map layer */
test('雷达转送：原封不动转给 App，允许 App 的网站读取，并带上 Last-Modified', async () => {
  const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
  let asked;
  const get = async (url, init) => { asked = {url, init}; return new Response(gif, {status:200, headers:{'Last-Modified':'Wed, 11 Nov 2026 05:21:06 GMT'}}); };
  const r = await handle(new Request('https://x.workers.dev/radar', {headers:{Origin:'https://bryanwoo988.github.io'}}), mkEnv(), get);
  assert.strictEqual(r.status, 200);
  assert.ok(asked.url.startsWith('https://api.met.gov.my/'));
  assert.strictEqual(r.headers.get('Access-Control-Allow-Origin'), 'https://bryanwoo988.github.io');
  assert.strictEqual(r.headers.get('Access-Control-Expose-Headers'), 'Last-Modified');
  assert.strictEqual(r.headers.get('Last-Modified'), 'Wed, 11 Nov 2026 05:21:06 GMT');
  assert.deepStrictEqual(new Uint8Array(await r.arrayBuffer()), gif);
});

test('雷达转送：别的网站拒绝；只接受 GET；上游出错回 502', async () => {
  const ok = async () => new Response('x', {status:200});
  assert.strictEqual((await handle(new Request('https://x.workers.dev/radar', {headers:{Origin:'https://evil.example'}}), mkEnv(), ok)).status, 403);
  assert.strictEqual((await handle(new Request('https://x.workers.dev/radar', {method:'POST', body:'{}'}), mkEnv(), ok)).status, 405);
  assert.strictEqual((await handle(new Request('https://x.workers.dev/radar'), mkEnv(), async () => new Response('', {status:500}))).status, 502);
});

test('正式入口不会把 Cloudflare 的 ctx 当成下载函数', async () => {
  const worker = require('../server/src/index.js').default;
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('GIF89a', {status:200});
  try{
    const r = await worker.fetch(new Request('https://x.workers.dev/radar'), mkEnv(), {waitUntil(){}, passThroughOnException(){}});
    assert.strictEqual(r.status, 200);
  }finally{ globalThis.fetch = real; }
});
