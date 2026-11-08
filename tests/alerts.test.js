const {test} = require('node:test');
const assert = require('node:assert');
const {gif} = require('./helpers/gif.js');
const R = require('../server/src/radar.js');
const {runStorm, runRadar} = require('../server/src/cron.js');
const {scheduledRadar} = require('../server/src/index.js');
const {radarMessage, floodMessage} = require('../server/src/message.js');

/* Radar and flood alerts end to end: KV, the radar GIF, JPS's feed and the
   push service all stood in. */

const P256DH = 'BIJ7_6fCuHIGqiaM98xjRy_s5QgJ3ea8xuf5Fngx1iJo5O8_DuaKulY-oFHX-fdRezaLS0t6hrvFS6hoROxcaso';
const AUTH = 'azNDjVHPx0DLt25K4u5NMg';
function mkEnv(devs){
  const store = new Map();
  (devs || []).forEach(d => store.set('dev:' + d.id, JSON.stringify(d)));
  return {
    store,
    KV:{
      async get(k){ return store.has(k) ? store.get(k) : null; },
      async put(k, v){ store.set(k, v); },
      async delete(k){ store.delete(k); },
      async list({prefix}){ return {keys:[...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({name})), list_complete:true}; }
    },
    VAPID_SUBJECT:'mailto:a@b.c',
    VAPID_PUBLIC_KEY:'BGJeNBIeMsmfIK_tmAdS6ttS1scBmOTdVQxUg1zEqaK1pW1U9BKtkWNK4F3yTVsHGL6gNiHfK3ORLPdEM85Lp50',
    VAPID_PRIVATE_KEY:'8W_kk0VdwFXgM9ncShpoSBfBaPNG-2p-Zb3OLII6gA8'
  };
}
const SETIA = {id:'s', name:'Setia Alam', lat:3.1036, lon:101.461, tz:'Asia/Kuala_Lumpur', windows:[], storm:true,
               geo:{iso:'MY-10', state:'Selangor', district:'Petaling'}};
function dev(storm, blocks){
  return {id:'device-0001', tz:'Asia/Kuala_Lumpur', lang:'zh',
          sub:{endpoint:'https://fcm.googleapis.com/fcm/send/x', keys:{p256dh:P256DH, auth:AUTH}},
          notify:{windows:[], rules:{}, storm}, blocks};
}

/* ---- radar ---- */
const W = 1352, H = 570;
const P = R.toPx(SETIA.lat, SETIA.lon);
const PAL = {0:[102, 102, 170], 2:[0, 240, 0], 3:[220, 0, 0]};
function frame(dx){
  const f = new Uint8Array(W * H);
  for(let y = -6; y <= 6; y++) for(let x = -6; x <= 6; x++){
    const d = Math.hypot(x, y), i = Math.round(P.y + y) * W + Math.round(P.x + dx + x);
    if(d <= 3) f[i] = 3; else if(d <= 6) f[i] = 2;
  }
  return f;
}
/* heavy rain 12 px (≈30 km) west of Setia Alam, moving east 4 px a frame */
const COMING = gif(W, H, [frame(-20), frame(-16), frame(-12)], PAL);
/* 07:51 UTC written → 07:40 frame (15:40 in Malaysia); the run is at 07:52,
   and the rain is due about 07:54 */
const LM = 'Sun, 08 Nov 2026 07:51:05 GMT';
const NOW = new Date('2026-11-08T07:52:00Z');

function radarFetch(bytes, lm, calls){
  return async (url, init) => {
    calls.push({url, ims:init && init.headers && init.headers['If-Modified-Since']});
    if(init && init.headers && init.headers['If-Modified-Since'] === lm) return new Response(null, {status:304});
    return new Response(bytes, {status:200, headers:{'Last-Modified':lm}});
  };
}

test('雷达：西边的大雨往地块移过来，发一则「约几点到」的通知', async () => {
  const env = mkEnv([dev({radar:true}, [SETIA])]);
  const calls = [], posts = [];
  const r = await scheduledRadar({}, env, {now:NOW, fetch:radarFetch(COMING, LM, calls), post:async (u, i) => { posts.push(i); return {status:201}; }});
  assert.strictEqual(r.sent, 1);
  assert.strictEqual(posts.length, 1);
  assert.strictEqual(env.store.get('radar:lm'), LM);
  assert.ok(env.store.has('storm:r:device-0001:s'), '要记下冷却');
  assert.ok(env.store.has('storm:m:device-0001:s'), '雷达看到了，就不再发模式提醒');
});

test('雷达图没更新就不重新处理；冷却期间也不重发', async () => {
  const env = mkEnv([dev({radar:true}, [SETIA])]);
  const opts = {now:NOW, post:async () => ({status:201})};
  await scheduledRadar({}, env, Object.assign({fetch:radarFetch(COMING, LM, [])}, opts));
  const calls = [];
  const r = await scheduledRadar({}, env, Object.assign({fetch:radarFetch(COMING, LM, calls)}, opts));
  assert.strictEqual(calls[0].ims, LM, '要带上 If-Modified-Since');
  assert.deepStrictEqual(r, {skipped:'unchanged'});
});

test('雷达图太旧（MetMalaysia 停更）就不发', async () => {
  const env = mkEnv([dev({radar:true}, [SETIA])]);
  const r = await scheduledRadar({}, env, {now:new Date('2026-11-08T09:00:00Z'), fetch:radarFetch(COMING, LM, []), post:async () => ({status:201})});
  assert.deepStrictEqual(r, {skipped:'stale'});
});

test('没有人开雷达提醒，连雷达图都不下载', async () => {
  const env = mkEnv([dev({official:true}, [SETIA])]);
  const calls = [];
  const r = await scheduledRadar({}, env, {now:NOW, fetch:radarFetch(COMING, LM, calls)});
  assert.deepStrictEqual(r, {skipped:'nobody'});
  assert.strictEqual(calls.length, 0);
});

test('预计到达时间已经过了的，不发「即将到达」', async () => {
  const grids = R.radarGrids(COMING);
  const env = mkEnv();
  /* an hour after the frame: whatever was coming has come */
  const rep = await runRadar(env, dev({radar:true}, [SETIA]), grids, R.frameTime(LM), new Date('2026-11-08T08:40:00Z'),
                             {post:async () => ({status:201})});
  assert.strictEqual(rep.length, 0);
});

test('雷达通知文案：方向、距离、到达时间、雷达图时间都写出来', () => {
  const m = radarMessage('zh', [{id:'s', name:'Setia Alam', r:{kind:'coming', dir:'W', km:24, min:14}, at:'15:54'}], '15:40');
  assert.strictEqual(m.title, '⛈ 强降雨接近 · Setia Alam');
  assert.strictEqual(m.body, '西方 24 km · 约 15:54 到 · 雷达 15:40');
  const n = radarMessage('en', [{id:'s', name:'Farm', r:{kind:'near', dir:'SE', km:6}}], '15:40');
  assert.strictEqual(n.title, '⛈ Heavy rain nearby · Farm');
  assert.strictEqual(n.body, '6 km southeast · radar 15:40');
  const two = radarMessage('ms', [{id:'a', name:'A', r:{kind:'near', dir:'N', km:4}}, {id:'b', name:'B', r:{kind:'coming', dir:'E', km:20, min:10}, at:'16:00'}], '15:40');
  assert.strictEqual(two.title, '⛈ Hujan lebat · A, B');
  assert.strictEqual(two.body, 'A: 4 km utara · sudah dekat\nB: 20 km timur · tiba kira-kira 16:00\nradar 15:40');
});

/* ---- flood ---- */
const JPS = [
  {a:'meru', b:'Sg. Binjai di Pekan Meru', c:'3.1155', d:'101.4253', e:'Klang', i:'RF,WL', m:'4.08', n:'Warning', o:'4', q:'08/11/2026 16:15', s:'Receding'},
  {a:'sabah', b:'Meligan (F2)', c:'3.12', d:'101.45', e:'X', i:'WL', m:'315.5', n:'Danger', o:'0', q:'08/11/2026 16:15', s:''}
];
/* 08:30 UTC = 16:30 in Malaysia */
const FNOW = new Date('2026-11-08T08:30:00Z');
const frun = list => ({cache:new Map(), seen:new Set(), modelHour:false, post:async () => ({status:201}),
                      fetchJson:async url => (url.includes('publicinfobanjir') ? list : [])});

test('淹水：附近的站到了警告水位，发一次；没有升级就不重发', async () => {
  const env = mkEnv();
  const d = dev({flood:true}, [SETIA]);
  const r1 = await runStorm(env, d, FNOW, frun(JPS));
  assert.strictEqual(r1.length, 1);
  assert.strictEqual(r1[0].kind, 'flood');
  assert.strictEqual(r1[0].title, '🌊 河水警告 · Setia Alam');
  assert.strictEqual(r1[0].body, 'Sg. Binjai, Pekan Meru · 4 km\n4.08 m（警告 4.00 m） · 下降中 · 16:15');
  assert.strictEqual((await runStorm(env, d, FNOW, frun(JPS))).length, 0, '同一个站同一级不重发');

  const worse = [Object.assign({}, JPS[0], {n:'Danger', m:'4.60', o:'4.5'})];
  const r3 = await runStorm(env, d, FNOW, frun(worse));
  assert.strictEqual(r3.length, 1, '升到危险要再发');
  assert.strictEqual(r3[0].title, '🌊 河水危险 · Setia Alam');
});

test('淹水：没开就不读 JPS', async () => {
  const run = frun(JPS); const calls = [];
  run.fetchJson = async url => { calls.push(url); return []; };
  await runStorm(mkEnv(), dev({official:true}, [SETIA]), FNOW, run);
  assert.ok(!calls.some(u => u.includes('publicinfobanjir')));
});

test('淹水文案：英文和马来文', () => {
  const s = {name:'Sg. X', km:3.6, level:4.6, thr:4.5, severity:'Danger', trend:'Rising', time:'2026-11-08T16:15'};
  assert.strictEqual(floodMessage('en', [{id:'a', name:'Farm', stations:[s]}]).body,
    'Sg. X · 4 km\n4.60 m (Danger 4.50 m) · rising · 16:15');
  assert.strictEqual(floodMessage('ms', [{id:'a', name:'Ladang', stations:[s]}]).title, '🌊 Bahaya sungai · Ladang');
});
