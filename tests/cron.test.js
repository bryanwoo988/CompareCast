const {test} = require('node:test');
const assert = require('node:assert');
const {runDevice} = require('../server/src/cron.js');

/* The cron loop end to end, with KV, Open-Meteo and the push service all
   stood in. Every scenario here is one the audit found failing silently:
   reminders replacing each other, failures never retried, an evening
   reminder describing a morning already gone, and a plot's model ignored. */

/* throwaway key material, the same pair send.test.js uses — the library
   really encrypts, so placeholders would throw */
const P256DH = 'BIJ7_6fCuHIGqiaM98xjRy_s5QgJ3ea8xuf5Fngx1iJo5O8_DuaKulY-oFHX-fdRezaLS0t6hrvFS6hoROxcaso';
const AUTH = 'azNDjVHPx0DLt25K4u5NMg';

function mkEnv(){
  const store = new Map();
  return {
    store, deleted:[],
    KV:{
      async get(k){ return store.has(k) ? store.get(k) : null; },
      async put(k, v){ store.set(k, v); },
      async delete(k){ store.delete(k); }
    },
    VAPID_SUBJECT:'mailto:a@b.c',
    VAPID_PUBLIC_KEY:'BGJeNBIeMsmfIK_tmAdS6ttS1scBmOTdVQxUg1zEqaK1pW1U9BKtkWNK4F3yTVsHGL6gNiHfK3ORLPdEM85Lp50',
    VAPID_PRIVATE_KEY:'8W_kk0VdwFXgM9ncShpoSBfBaPNG-2p-Zb3OLII6gA8'
  };
}

/* three local days of hourly data, as Open-Meteo returns with timezone=… */
const DAYS = ['2026-09-30', '2026-10-01', '2026-10-02'];
function hourly(fn, suffix){
  const s = suffix ? '_' + suffix : '';
  const h = {time:[]};
  ['temperature_2m', 'precipitation', 'precipitation_probability', 'wind_speed_10m', 'wind_gusts_10m']
    .forEach(k => { h[k + s] = []; });
  DAYS.forEach((d, di) => {
    for(let hr = 0; hr < 24; hr++){
      h.time.push(`${d}T${String(hr).padStart(2, '0')}:00`);
      const v = fn(di, hr);
      h['temperature_2m' + s].push(v.t ?? 30);
      h['precipitation' + s].push(v.mm ?? 0);
      h['precipitation_probability' + s].push(v.p ?? 10);
      h['wind_speed_10m' + s].push(5);
      h['wind_gusts_10m' + s].push(9);
    }
  });
  return h;
}

/* one run's context: a forecast per latitude (null = that fetch fails), and a
   push service answering from a queue of statuses */
function mkRun(forecasts, statuses){
  const run = {cache:new Map(), seen:new Set(), urls:[], posts:0, queue:(statuses || []).slice()};
  run.fetchJson = async url => {
    run.urls.push(url);
    const lat = +new URL(url).searchParams.get('latitude');
    const f = forecasts[lat];
    return typeof f === 'function' ? f(url) : f;
  };
  run.post = async () => { run.posts++; return {status:run.queue.length ? run.queue.shift() : 201}; };
  return run;
}

const WET = {hourly:hourly(() => ({p:90}))};
const DRY = {hourly:hourly(() => ({p:10}))};
const AFTERNOON = {id:'afternoon', on:true, from:'12:00', to:'18:00', at:'12:00', mode:'threshold'};
const mkDev = (blocks, windows) => ({
  id:'dev123456', tz:'Asia/Kuala_Lumpur', lang:'zh', units:{temp:'celsius', wind:'kmh', rain:'mm'},
  sub:{endpoint:'https://fcm.googleapis.com/fcm/send/x', keys:{p256dh:P256DH, auth:AUTH}},
  notify:{windows:windows || [AFTERNOON], rules:{rainProb:{on:true, v:60}}},
  blocks
});
const A = {id:'A', name:'Alpha', lat:1, lon:101, windows:['afternoon']};
const B = {id:'B', name:'Beta',  lat:2, lon:101, windows:['afternoon']};
/* 12:00 in Kuala Lumpur is 04:00 UTC */
const at = (h, m) => new Date(Date.UTC(2026, 8, 30, h - 8, m || 0));

test('两个地块同一时段只发一条通知，两个都列出', async () => {
  const env = mkEnv(), run = mkRun({1:WET, 2:WET});
  const rep = await runDevice(env, mkDev([A, B]), at(12), run);
  assert.strictEqual(run.posts, 1);
  assert.strictEqual(rep[0].title, '下午 · 2 个地块');
  assert.match(rep[0].body, /Alpha/);
  assert.match(rep[0].body, /Beta/);
});

test('发过之后，宽限期内的下一次运行不重发', async () => {
  const env = mkEnv();
  await runDevice(env, mkDev([A, B]), at(12), mkRun({1:WET, 2:WET}));
  const again = mkRun({1:WET, 2:WET});
  await runDevice(env, mkDev([A, B]), at(12, 15), again);
  assert.strictEqual(again.posts, 0);
});

test('推送失败，下一次运行补发', async () => {
  const env = mkEnv();
  const first = mkRun({1:WET, 2:WET}, [500]);
  const r1 = await runDevice(env, mkDev([A, B]), at(12), first);
  assert.strictEqual(r1[0].result, 'failed');
  const second = mkRun({1:WET, 2:WET});
  const r2 = await runDevice(env, mkDev([A, B]), at(12, 15), second);
  assert.strictEqual(second.posts, 1);
  assert.strictEqual(r2[0].result, 'sent');
});

test('超过宽限期就不再补发', async () => {
  const env = mkEnv();
  await runDevice(env, mkDev([A]), at(12), mkRun({1:WET}, [500]));
  const late = mkRun({1:WET});
  await runDevice(env, mkDev([A]), at(13, 15), late);
  assert.strictEqual(late.posts, 0);
});

test('一个地块取数失败，另一个照发；失败的下一次单独补', async () => {
  const env = mkEnv();
  const r1 = await runDevice(env, mkDev([A, B]), at(12), mkRun({1:WET, 2:null}));
  assert.strictEqual(r1[0].title, 'Alpha');
  const second = mkRun({1:WET, 2:WET});
  const r2 = await runDevice(env, mkDev([A, B]), at(12, 15), second);
  assert.strictEqual(second.posts, 1);
  assert.strictEqual(r2[0].title, 'Beta');
  /* two separate notifications for one window: they must not share a tag,
     or the second would silently replace the first */
  assert.notStrictEqual(r1[0].tag, r2[0].tag);
});

test('没到门槛的地块不进通知，也不会每次运行重新取数', async () => {
  const env = mkEnv();
  const r1 = await runDevice(env, mkDev([A, B]), at(12), mkRun({1:WET, 2:DRY}));
  assert.strictEqual(r1[0].title, 'Alpha');
  const second = mkRun({1:WET, 2:DRY});
  await runDevice(env, mkDev([A, B]), at(12, 15), second);
  assert.strictEqual(second.urls.length, 0, '已经判定过的地块不该再取数');
});

test('全部没到门槛：不发，但记下来', async () => {
  const env = mkEnv(), run = mkRun({1:DRY});
  const rep = await runDevice(env, mkDev([A]), at(12), run);
  assert.strictEqual(run.posts, 0);
  assert.strictEqual(rep[0].result, 'quiet');
});

test('晚上九点提醒早上时段，说的是明天早上', async () => {
  const morning = {id:'morning', on:true, from:'06:00', to:'12:00', at:'21:00', mode:'digest'};
  /* today's morning dry, tomorrow's wet — the answer tells which was read */
  const f = {hourly:hourly((di, hr) => ({p:di === 1 && hr >= 6 && hr < 12 ? 95 : 5}))};
  const blk = {id:'A', name:'Alpha', lat:1, lon:101, windows:['morning']};
  const rep = await runDevice(mkEnv(), mkDev([blk], [morning]), at(21), mkRun({1:f}));
  assert.match(rep[0].body, /95%/);
});

test('地块用自己的模式取数，降雨机率仍取 Best Match', async () => {
  const digest = {id:'afternoon', on:true, from:'12:00', to:'18:00', at:'12:00', mode:'digest'};
  const h = Object.assign({},
    hourly(() => ({t:33, p:10}), 'ecmwf_ifs025'),
    hourly(() => ({t:36, p:70}), 'best_match'));
  const run = mkRun({1:{hourly:h}});
  const blk = Object.assign({}, A, {model:'ecmwf_ifs025'});
  const rep = await runDevice(mkEnv(), mkDev([blk], [digest]), at(12), run);
  assert.match(run.urls[0], /models=ecmwf_ifs025%2Cbest_match/);
  assert.match(rep[0].body, /33°/);
  assert.doesNotMatch(rep[0].body, /36°/);
  assert.match(rep[0].body, /70%/);
});

test('订阅失效时删除设备并停止', async () => {
  const env = mkEnv();
  env.store.set('dev:dev123456', '{}');
  const rep = await runDevice(env, mkDev([A]), at(12), mkRun({1:WET}, [410]));
  assert.strictEqual(rep[0].result, 'expired');
  assert.strictEqual(env.store.has('dev:dev123456'), false);
});

test('设备记录残缺时不抛出', async () => {
  const bad = {id:'x', tz:'Asia/Kuala_Lumpur', notify:null, blocks:[A]};
  assert.deepStrictEqual(await runDevice(mkEnv(), bad, at(12), mkRun({})), []);
});

/* ---- from the external reviews (v3.10.0 snapshot), still open in 3.17.0 ---- */

test('跨午夜的时段读的是当晚到次日凌晨那几个小时', async () => {
  /* rain chance = the hour on 30 Sep, 50 + hour on 1 Oct: the reported
     maximum says exactly which hours were read */
  const f = {hourly:hourly((di, hr) => ({p:di === 0 ? hr : 50 + hr}))};
  const night = {id:'night', on:true, from:'22:00', to:'02:00', at:'21:00', mode:'digest'};
  const blk = {id:'A', name:'Alpha', lat:1, lon:101, windows:['night']};
  const rep = await runDevice(mkEnv(), mkDev([blk], [night]), at(21), mkRun({1:f}));
  /* 30 Sep 22:00, 23:00 and 1 Oct 00:00, 01:00 → max is 51, never 53 */
  assert.match(rep[0].body, /51%/);
});

test('一小时内都取不到预报：最后一次机会时发一条告知，不再沉默', async () => {
  const env = mkEnv();
  for(const m of [0, 15, 30]){
    const r = await runDevice(env, mkDev([A]), at(12, m), mkRun({1:null}));
    assert.deepStrictEqual(r, [], `第 ${m} 分钟不该发`);
  }
  const last = mkRun({1:null});
  const rep = await runDevice(env, mkDev([A]), at(12, 45), last);
  assert.strictEqual(last.posts, 1);
  assert.match(rep[0].body, /暂时查不到预报/);
  /* and it is not repeated */
  const after = mkRun({1:null});
  await runDevice(env, mkDev([A]), at(12, 45), after);
  assert.strictEqual(after.posts, 0);
});

test('取不到的地块和有数据的地块在同一条通知里', async () => {
  const rep = await runDevice(mkEnv(), mkDev([A, B]), at(12, 45), mkRun({1:WET, 2:null}));
  assert.match(rep[0].body, /Alpha：降雨概率 90%/);
  assert.match(rep[0].body, /Beta：暂时查不到预报/);
});

test('只讲一个地块的通知带上地块 id，点开能直达；多个地块的不带', async () => {
  const one = await runDevice(mkEnv(), mkDev([A, B]), at(12), mkRun({1:WET, 2:DRY}));
  assert.strictEqual(one[0].loc, 'A');
  const two = await runDevice(mkEnv(), mkDev([A, B]), at(12), mkRun({1:WET, 2:WET}));
  assert.strictEqual(two[0].loc, undefined);
});
