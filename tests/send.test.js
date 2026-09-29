const {test} = require('node:test');
const assert = require('node:assert');
const {sentKey, sendOne, readLedger, writeLedger, DEDUPE_TTL} = require('../server/src/send.js');

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
const KEY = () => sentKey('dev123456', 'morning', '2026-09-29');

/* one reminder per device, window and local day — plots are listed inside the
   entry rather than keyed separately, since they now travel in one message */
test('sentKey 三个维度都参与', () => {
  const a = sentKey('d', 'morning', '2026-09-29');
  assert.notStrictEqual(a, sentKey('d', 'evening', '2026-09-29'));
  assert.notStrictEqual(a, sentKey('d', 'morning', '2026-09-30'));
  assert.notStrictEqual(a, sentKey('e', 'morning', '2026-09-29'));
});

/* ---- sendOne: send and classify, nothing else ---- */
test('成功发送返回 sent，本身不写任何键', async () => {
  const env = mkEnv(201);
  const r = await sendOne(env, DEV, PAYLOAD, async () => ({status:201}));
  assert.strictEqual(r, 'sent');
  assert.deepStrictEqual(env.puts, []);
});
test('404 视为订阅失效并删除该设备', async () => {
  const env = mkEnv(404);
  const r = await sendOne(env, DEV, PAYLOAD, async () => ({status:404}));
  assert.strictEqual(r, 'expired');
  assert.ok(env.deleted.includes('dev:dev123456'));
});
test('410 同样视为失效', async () => {
  const env = mkEnv(410);
  const r = await sendOne(env, DEV, PAYLOAD, async () => ({status:410}));
  assert.strictEqual(r, 'expired');
  assert.ok(env.deleted.includes('dev:dev123456'));
});
test('500 不删除，只发一次', async () => {
  const env = mkEnv(500);
  let calls = 0;
  const r = await sendOne(env, DEV, PAYLOAD, async () => { calls++; return {status:500}; });
  assert.strictEqual(r, 'failed');
  assert.deepStrictEqual(env.deleted, []);
  assert.strictEqual(calls, 1);
});
test('网络异常算失败，不抛出', async () => {
  const env = mkEnv(0);
  const r = await sendOne(env, DEV, PAYLOAD, async () => { throw new Error('boom'); });
  assert.strictEqual(r, 'failed');
});

/* ---- the ledger: which plots of a reminder are already handled ---- */
test('台账读写往返', async () => {
  const env = mkEnv(0);
  await writeLedger(env, KEY(), ['l1', 'l2']);
  assert.deepStrictEqual([...await readLedger(env, KEY())].sort(), ['l1', 'l2']);
});
test('没有台账时是空集', async () => {
  assert.strictEqual((await readLedger(mkEnv(0), KEY())).size, 0);
});
test('台账内容损坏时当作空集，不抛出', async () => {
  const env = mkEnv(0);
  await env.KV.put(KEY(), '{not json');
  assert.strictEqual((await readLedger(env, KEY())).size, 0);
  await env.KV.put(KEY(), '"a string"');
  assert.strictEqual((await readLedger(env, KEY())).size, 0);
});
test('台账带过期时间，不会无限堆积', async () => {
  const env = mkEnv(0);
  let opts = null;
  env.KV.put = async (k, v, o) => { opts = o; };
  await writeLedger(env, KEY(), ['l1']);
  assert.strictEqual(opts.expirationTtl, DEDUPE_TTL);
});

/* Review Focus #4: encryption fails silently in production, so assert here
   that the library actually produced an encrypted aes128gcm body and a VAPID
   authorization header — not that it merely returned without throwing */
test('确实产出了 aes128gcm 密文与 VAPID 授权头', async () => {
  const env = mkEnv(201);
  let seenInit = null;
  await sendOne(env, DEV, {title:'Alpha', body:'x'},
    async (url, init) => { seenInit = init; return {status:201}; });
  assert.ok(seenInit, '没有发出请求');
  assert.strictEqual(seenInit.headers['content-encoding'], 'aes128gcm');
  assert.match(seenInit.headers.authorization, /^vapid /i);
  assert.ok(seenInit.body.byteLength > 80, '密文太短，像是没加密: ' + seenInit.body.byteLength);
  /* the plaintext must not be recoverable from the body */
  const raw = Buffer.from(seenInit.body).toString('latin1');
  assert.ok(!raw.includes('Alpha'), '明文泄漏在载荷里');
});

/* the cron POSTs with a JWT signed by this app's key: a push service that
   redirects is not followed somewhere else */
test('推送请求不跟随重定向', async () => {
  let seen = null;
  await sendOne(mkEnv(201), DEV, PAYLOAD, async (url, init) => { seen = init; return {status:201}; });
  assert.strictEqual(seen.redirect, 'manual');
});
