const {test} = require('node:test');
const assert = require('node:assert');
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
  sub:{endpoint:'https://fcm.googleapis.com/fcm/send/xyz', keys:{p256dh:'p', auth:'a'}},
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
  assert.strictEqual(validateSub(ok({sub:{endpoint:'http://x/y', keys:{p256dh:'p', auth:'a'}}})).ok, false);
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
