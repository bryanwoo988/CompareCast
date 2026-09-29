const {test} = require('node:test');
const assert = require('node:assert');
/* test-only key material in the real encoded shapes */
const K_P = 'BIJ7_6fCuHIGqiaM98xjRy_s5QgJ3ea8xuf5Fngx1iJo5O8_DuaKulY-oFHX-fdRezaLS0t6hrvFS6hoROxcaso';
const K_A = 'azNDjVHPx0DLt25K4u5NMg';
const {validateSub} = require('../server/src/validate.js');

const NOTIFY = {
  enabled:true,
  windows:[
    {id:'morning',   on:true,  from:'06:00', to:'12:00', at:'06:00', mode:'threshold'},
    {id:'afternoon', on:true,  from:'12:00', to:'18:00', at:'12:00', mode:'digest'},
    {id:'evening',   on:false, from:'18:00', to:'23:59', at:'18:00', mode:'digest'}
  ],
  rules:{rainProb:{on:true, v:60}}
};
const ok = over => Object.assign({
  id:'abcdefgh1234', tz:'Asia/Kuala_Lumpur', lang:'zh',
  sub:{endpoint:'https://fcm.googleapis.com/fcm/send/xyz', keys:{p256dh:K_P, auth:K_A}},
  notify:NOTIFY,
  blocks:[{id:'l1', name:'Alpha', lat:3.139, lon:101.687, windows:['morning']}]
}, over || {});

test('合法请求通过', () => {
  const r = validateSub(ok());
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.id, 'abcdefgh1234');
});
test('id 太短被拒', () => {
  assert.strictEqual(validateSub(ok({id:'abc'})).ok, false);
});
test('id 含非法字符被拒', () => {
  assert.strictEqual(validateSub(ok({id:'abcdefgh/../x'})).ok, false);
});
test('时区非法被拒', () => {
  assert.strictEqual(validateSub(ok({tz:'Not/AZone'})).ok, false);
});
test('endpoint 非 https 被拒', () => {
  assert.strictEqual(validateSub(ok({sub:{endpoint:'http://x/y', keys:{p256dh:K_P, auth:K_A}}})).ok, false);
});
test('缺少推送密钥被拒', () => {
  assert.strictEqual(validateSub(ok({sub:{endpoint:'https://x/y', keys:{}}})).ok, false);
});
test('地块超过 50 条被拒', () => {
  const many = Array.from({length:51}, (_,i) =>
    ({id:'l'+i, name:'n', lat:1, lon:2, windows:['morning']}));
  assert.strictEqual(validateSub(ok({blocks:many})).ok, false);
});
test('坐标越界被拒', () => {
  assert.strictEqual(validateSub(ok({blocks:[{id:'l1', name:'n', lat:99, lon:0, windows:['morning']}]})).ok, false);
});

/* Review Focus #5: 服务端不信任客户端提交的时段 id */
test('过滤掉不存在的时段 id', () => {
  const r = validateSub(ok({blocks:[{id:'l1', name:'A', lat:1, lon:2, windows:['morning','ghost']}]}));
  assert.deepStrictEqual(r.value.blocks[0].windows, ['morning']);
});
test('过滤掉已关闭的时段 id', () => {
  const r = validateSub(ok({blocks:[{id:'l1', name:'A', lat:1, lon:2, windows:['morning','evening']}]}));
  assert.deepStrictEqual(r.value.blocks[0].windows, ['morning']);
});
test('过滤后为空的地块整条剔除', () => {
  const r = validateSub(ok({blocks:[
    {id:'l1', name:'A', lat:1, lon:2, windows:['evening']},
    {id:'l2', name:'B', lat:1, lon:2, windows:['afternoon']}
  ]}));
  assert.strictEqual(r.value.blocks.length, 1);
  assert.strictEqual(r.value.blocks[0].id, 'l2');
});
test('没有任何有效地块时被拒', () => {
  assert.strictEqual(validateSub(ok({blocks:[{id:'l1', name:'A', lat:1, lon:2, windows:['evening']}]})).ok, false);
});
test('语言非法时回落到 en', () => {
  assert.strictEqual(validateSub(ok({lang:'xx'})).value.lang, 'en');
});

test('地块自带的合法时区被保留', () => {
  const r = validateSub(ok({blocks:[{id:'l1', name:'A', lat:1, lon:2, windows:['morning'], tz:'Asia/Kuala_Lumpur'}]}));
  assert.strictEqual(r.value.blocks[0].tz, 'Asia/Kuala_Lumpur');
});
test('地块时区非法时丢弃而不是让整条请求失败', () => {
  const r = validateSub(ok({blocks:[{id:'l1', name:'A', lat:1, lon:2, windows:['morning'], tz:'Not/AZone'}]}));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.blocks[0].tz, undefined);
});

/* ---- push endpoint: only real push services ----
   The cron POSTs to whatever endpoint is stored, carrying a JWT signed with
   the app's VAPID key, so an arbitrary https URL would make this worker a
   relay to any host anyone cared to register. */
const withEndpoint = e => ok({sub:{endpoint:e, keys:{p256dh:K_P, auth:K_A}}});
test('Apple / Google / Mozilla / Microsoft 的推送服务都接受', () => {
  ['https://web.push.apple.com/QK4x',
   'https://fcm.googleapis.com/fcm/send/abc',
   'https://updates.push.services.mozilla.com/wpush/v2/x',
   'https://wns2-par02p.notify.windows.com/w/?token=x'
  ].forEach(e => assert.strictEqual(validateSub(withEndpoint(e)).ok, true, e));
});
test('其他主机一律拒绝', () => {
  ['https://evil.example/x', 'https://fcm.googleapis.com.evil.example/x',
   'https://notapple.push.apple.com.evil.example/x'
  ].forEach(e => assert.strictEqual(validateSub(withEndpoint(e)).ok, false, e));
});

/* ---- nothing is stored verbatim ----
   These three objects used to be written to KV exactly as sent, so one request
   could park megabytes that the cron then parses for every device, every
   quarter hour, on a 10 ms CPU budget shared by everyone. */
test('单位只保留认识的键和值，其余回落默认', () => {
  const r = validateSub(ok({units:{temp:'fahrenheit', wind:'lightyears', rain:'inch', junk:'x'.repeat(9999)}}));
  assert.deepStrictEqual(r.value.units, {temp:'fahrenheit', wind:'kmh', rain:'inch'});
});
test('时段只保留认识的字段，时间不合法的整段丢掉', () => {
  const r = validateSub(ok({notify:{rules:{}, windows:[
    {id:'morning', on:true, from:'06:00', to:'12:00', at:'06:00', mode:'threshold', blob:'x'.repeat(9999)},
    {id:'afternoon', on:true, from:'12:00', to:'25:00', at:'12:00', mode:'digest'},
    {id:'ghost', on:true, from:'01:00', to:'02:00', at:'01:00', mode:'digest'}
  ]}}));
  assert.deepStrictEqual(r.value.notify.windows,
    [{id:'morning', on:true, from:'06:00', to:'12:00', at:'06:00', mode:'threshold'}]);
});
test('规则只保留认识的键和数值', () => {
  const r = validateSub(ok({notify:{windows:NOTIFY.windows, rules:{
    rainProb:{on:true, v:60}, wind:{on:'yes', v:'20'}, evil:{on:true, v:1}}}}));
  assert.deepStrictEqual(r.value.notify.rules, {rainProb:{on:true, v:60}});
});

/* ---- blocks ---- */
test('地块的模式在清单内时保留', () => {
  const r = validateSub(ok({blocks:[{id:'l1', name:'A', lat:1, lon:2, windows:['morning'], model:'ecmwf_ifs025'}]}));
  assert.strictEqual(r.value.blocks[0].model, 'ecmwf_ifs025');
});
test('不认识的模式丢掉，按 Best Match 处理', () => {
  const r = validateSub(ok({blocks:[{id:'l1', name:'A', lat:1, lon:2, windows:['morning'], model:'mystery'}]}));
  assert.strictEqual(r.value.blocks[0].model, undefined);
});
test('地块 id 过长被拒', () => {
  assert.strictEqual(validateSub(ok({blocks:[{id:'x'.repeat(65), name:'A', lat:1, lon:2, windows:['morning']}]})).ok, false);
});

/* keys used to be checked only for being non-empty strings; the cron would
   then fail to encrypt for them on every run */
test('推送密钥必须是真正的格式', () => {
  const withKeys = (p, a) => ok({sub:{endpoint:'https://fcm.googleapis.com/fcm/send/x', keys:{p256dh:p, auth:a}}});
  assert.strictEqual(validateSub(withKeys(K_P, K_A)).ok, true);
  assert.strictEqual(validateSub(withKeys('p', K_A)).ok, false, 'p256dh 太短');
  assert.strictEqual(validateSub(withKeys(K_P, 'a')).ok, false, 'auth 太短');
  assert.strictEqual(validateSub(withKeys(K_P.replace('B', 'A'), K_A)).ok, false, '不是未压缩的 P-256 点');
  assert.strictEqual(validateSub(withKeys(K_P + '!!', K_A)).ok, false, '不是 base64url');
});
