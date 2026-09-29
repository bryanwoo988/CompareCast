const {test} = require('node:test');
const assert = require('node:assert');
const {sentKey, sendOne} = require('../server/src/send.js');

/* a KV stand-in that records what happened, plus a fetch stand-in whose
   status the test chooses — no network, no Cloudflare */
function fakeEnv(status){
  const store = new Map();
  return {
    deleted:[], puts:[],
    KV:{
      async get(k){ return store.has(k) ? store.get(k) : null; },
      async put(k, v, o){ store.set(k, v); this._env.puts.push(k); },
      async delete(k){ store.delete(k); this._env.deleted.push(k); }
    },
    _status:status,
    VAPID_SUBJECT:'mailto:a@b.c',
    VAPID_PUBLIC_KEY:VAPID_PUB,
    VAPID_PRIVATE_KEY:VAPID_PRV
  };
}
const mkEnv = status => { const e = fakeEnv(status); e.KV._env = e; return e; };
/* throwaway key material generated for these tests only — the library really
   does ECDH against it, so placeholder strings make it throw DataError */
const P256DH = 'BIJ7_6fCuHIGqiaM98xjRy_s5QgJ3ea8xuf5Fngx1iJo5O8_DuaKulY-oFHX-fdRezaLS0t6hrvFS6hoROxcaso';
const AUTH = 'azNDjVHPx0DLt25K4u5NMg';
const VAPID_PUB = 'BGJeNBIeMsmfIK_tmAdS6ttS1scBmOTdVQxUg1zEqaK1pW1U9BKtkWNK4F3yTVsHGL6gNiHfK3ORLPdEM85Lp50';
const VAPID_PRV = '8W_kk0VdwFXgM9ncShpoSBfBaPNG-2p-Zb3OLII6gA8';
const DEV = {id:'dev123456', sub:{endpoint:'https://push.example/x', keys:{p256dh:P256DH, auth:AUTH}}};
const PAYLOAD = {title:'Alpha', body:'早上 · 降雨 80%'};
const KEY = () => sentKey('dev123456', 'l1', 'morning', '2026-09-29');

test('sentKey 四个维度都参与，缺一不可', () => {
  const a = sentKey('d', 'l1', 'morning', '2026-09-29');
  assert.notStrictEqual(a, sentKey('d', 'l2', 'morning', '2026-09-29'));
  assert.notStrictEqual(a, sentKey('d', 'l1', 'evening', '2026-09-29'));
  assert.notStrictEqual(a, sentKey('d', 'l1', 'morning', '2026-09-30'));
  assert.notStrictEqual(a, sentKey('e', 'l1', 'morning', '2026-09-29'));
});

test('成功发送返回 sent 并写下去重键', async () => {
  const env = mkEnv(201), seen = new Set();
  const r = await sendOne(env, DEV, PAYLOAD, KEY(), seen, async () => ({status:201}));
  assert.strictEqual(r, 'sent');
  assert.ok(env.puts.includes(KEY()));
});

/* Review Focus #3: KV is eventually consistent, so the in-memory set has to
   catch the repeat inside a single cron run */
test('同一次运行内重复调用被内存集合挡住，不依赖 KV 读到', async () => {
  const env = mkEnv(201), seen = new Set();
  await sendOne(env, DEV, PAYLOAD, KEY(), seen, async () => ({status:201}));
  let calls = 0;
  const r = await sendOne(env, DEV, PAYLOAD, KEY(), seen, async () => { calls++; return {status:201}; });
  assert.strictEqual(r, 'skipped');
  assert.strictEqual(calls, 0, '不该再发一次');
});

test('KV 里已有去重键时跳过', async () => {
  const env = mkEnv(201);
  await env.KV.put(KEY(), '1');
  const r = await sendOne(env, DEV, PAYLOAD, KEY(), new Set(), async () => ({status:201}));
  assert.strictEqual(r, 'skipped');
});

test('404 视为订阅失效并删除该设备', async () => {
  const env = mkEnv(404);
  const r = await sendOne(env, DEV, PAYLOAD, KEY(), new Set(), async () => ({status:404}));
  assert.strictEqual(r, 'expired');
  assert.ok(env.deleted.includes('dev:dev123456'));
});
test('410 同样视为失效', async () => {
  const env = mkEnv(410);
  const r = await sendOne(env, DEV, PAYLOAD, KEY(), new Set(), async () => ({status:410}));
  assert.strictEqual(r, 'expired');
  assert.ok(env.deleted.includes('dev:dev123456'));
});
test('500 不删除、不重试', async () => {
  const env = mkEnv(500);
  let calls = 0;
  const r = await sendOne(env, DEV, PAYLOAD, KEY(), new Set(), async () => { calls++; return {status:500}; });
  assert.strictEqual(r, 'failed');
  assert.deepStrictEqual(env.deleted, []);
  assert.strictEqual(calls, 1, '不该重试');
});
test('失败时不写去重键——否则这一天就再也发不出去了', async () => {
  const env = mkEnv(500);
  await sendOne(env, DEV, PAYLOAD, KEY(), new Set(), async () => ({status:500}));
  assert.ok(!env.puts.includes(KEY()));
});

/* Review Focus #4: encryption fails silently in production, so assert here
   that the library actually produced an encrypted aes128gcm body and a VAPID
   authorization header — not that it merely returned without throwing */
test('确实产出了 aes128gcm 密文与 VAPID 授权头', async () => {
  const env = mkEnv(201);
  let seenInit = null;
  await sendOne(env, DEV, {title:'Alpha', body:'x'}, KEY(), new Set(),
    async (url, init) => { seenInit = init; return {status:201}; });
  assert.ok(seenInit, '没有发出请求');
  assert.strictEqual(seenInit.headers['content-encoding'], 'aes128gcm');
  assert.match(seenInit.headers.authorization, /^vapid /i);
  assert.ok(seenInit.body.byteLength > 80, '密文太短，像是没加密: ' + seenInit.body.byteLength);
  /* the plaintext must not be recoverable from the body */
  const raw = Buffer.from(seenInit.body).toString('latin1');
  assert.ok(!raw.includes('Alpha'), '明文泄漏在载荷里');
});
