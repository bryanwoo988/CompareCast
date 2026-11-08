const {test} = require('node:test');
const assert = require('node:assert');
const {parseAreas, plotInAreas, liveWarnings, modelSignal, modelAlert, STORM_MODELS} = require('../server/src/storm.js');
const {stormOfficialMessage, stormModelMessage} = require('../server/src/message.js');
const {runStorm} = require('../server/src/cron.js');
const {validateSub} = require('../server/src/validate.js');

/* the real text of a warning MetMalaysia issued on 8 November 2026 */
const BM = 'Ribut petir, hujan lebat dan angin kencang dijangka di negeri Terengganu (Kemaman dan Dungun) • Pahang (Kuantan, Pekan dan Rompin) • Johor (Mersing dan Kota Tinggi) • Sabah: Kudat (Pitas dan Kudat) sehingga 12:00 Tengah Hari; Ahad, 8 November 2026.';
const WARN = {
  warning_issue:{issued:'2026-11-08T08:50:00', title_bm:'Amaran Ribut Petir', title_en:'Thunderstorms Warning'},
  valid_from:'2026-11-08T08:00:00', valid_to:'2026-11-08T12:00:00',
  heading_en:'THUNDERSTORMS WARNING', text_bm:BM, text_en:'…'
};

/* what the app's OSM lookup returns, in Malay */
const KUANTAN = {iso:'MY-06', state:'Pahang', district:'Kuantan'};
const BENTONG = {iso:'MY-06', state:'Pahang', district:'Bentong'};
const PITAS = {iso:'MY-12', state:'Sabah', district:'Pitas', division:'Kudat'};
const KK = {iso:'MY-12', state:'Sabah', district:'Kota Kinabalu', division:'Pantai Barat'};
const KL = {iso:'MY-14', state:'Kuala Lumpur'};

test('警告文字拆成「州（区）」', () => {
  assert.deepStrictEqual(parseAreas(BM), [
    {state:'terengganu', places:['kemaman', 'dungun']},
    {state:'pahang', places:['kuantan', 'pekan', 'rompin']},
    {state:'johor', places:['mersing', 'kota tinggi']},
    {state:'sabah', places:['pitas', 'kudat']}
  ]);
});

test('只有列出的区才算：同一州别的区不算', () => {
  const a = parseAreas(BM);
  assert.strictEqual(plotInAreas(KUANTAN, a), true);
  assert.strictEqual(plotInAreas(BENTONG, a), false);
  assert.strictEqual(plotInAreas(PITAS, a), true);
  assert.strictEqual(plotInAreas(KK, a), false);
});

test('没有括号的州＝整个州', () => {
  const a = parseAreas('Ribut petir dijangka di negeri Perlis • Kedah (Kubang Pasu) sehingga 6:00 Petang');
  assert.strictEqual(plotInAreas({iso:'MY-09', state:'Perlis'}, a), true);
  assert.strictEqual(plotInAreas({iso:'MY-02', state:'Kedah', district:'Kota Setar'}, a), false);
});

test('吉隆坡写成 WP，或写在别的州名下面，都要认得', () => {
  assert.strictEqual(plotInAreas(KL, parseAreas('dijangka di negeri Selangor (Petaling) • WP Kuala Lumpur sehingga 5:00 Petang')), true);
  assert.strictEqual(plotInAreas(KL, parseAreas('dijangka di negeri Selangor (Petaling dan Kuala Lumpur) sehingga 5:00 Petang')), true);
  assert.strictEqual(plotInAreas(KL, parseAreas('dijangka di negeri Selangor (Petaling) sehingga 5:00 Petang')), false);
});

test('不在马来西亚、或没查到州的地块永远不配对', () => {
  const a = parseAreas(BM);
  assert.strictEqual(plotInAreas(undefined, a), false);
  assert.strictEqual(plotInAreas({iso:'TH-10', state:'Pahang'}, a), false);
});

test('只留下还没结束的雷暴警告；海上和其他警告不算', () => {
  const other = Object.assign({}, WARN, {warning_issue:{issued:'2026-11-08T08:55:00', title_en:'Strong Winds and Rough Seas Warning'}});
  const none = {warning_issue:{issued:'2026-11-08T10:30:00', title_en:'No Advisory'}, valid_from:null, valid_to:null};
  assert.strictEqual(liveWarnings([WARN, other, none], '2026-11-08T10:00').length, 1);
  assert.strictEqual(liveWarnings([WARN], '2026-11-08T12:00').length, 0, '12:00 结束就不再算');
  assert.deepStrictEqual(liveWarnings(null, '2026-11-08T10:00'), []);
  const w = liveWarnings([WARN], '2026-11-08T07:00')[0];
  assert.deepStrictEqual([w.issued, w.from, w.to], ['2026-11-08T08:50', '2026-11-08T08:00', '2026-11-08T12:00']);
});

/* ---- wording: both ends of the validity, and when it was issued ---- */
const W = {issued:'2026-11-08T16:20', from:'2026-11-08T16:00', to:'2026-11-08T19:00'};

test('已经生效：现在至几点，加发布时间', () => {
  const m = stormOfficialMessage('zh', W, [{id:'a', name:'Setia Alam', geo:{district:'Petaling', state:'Selangor'}}], '2026-11-08T16:30');
  assert.strictEqual(m.title, '⚡ MetMalaysia 雷暴警告 · Setia Alam');
  assert.strictEqual(m.body, 'Petaling, Selangor · 现在至 19:00 有效（16:20 发布）');
});

test('还没开始：写出起止时间', () => {
  const w = Object.assign({}, W, {from:'2026-11-08T17:00'});
  const m = stormOfficialMessage('en', w, [{id:'a', name:'Farm', geo:{district:'Petaling', state:'Selangor'}}], '2026-11-08T16:30');
  assert.strictEqual(m.body, 'Petaling, Selangor · In effect 17:00 – 19:00 (issued 16:20)');
});

test('跨日：两边都写今天／明天', () => {
  const w = {issued:'2026-11-08T21:10', from:'2026-11-08T22:00', to:'2026-11-09T01:00'};
  const m = stormOfficialMessage('zh', w, [{id:'a', name:'X', geo:{}}], '2026-11-08T21:15');
  assert.strictEqual(m.body, '今天 22:00 – 明天 01:00 有效（21:10 发布）');
  const ms = stormOfficialMessage('ms', w, [{id:'a', name:'X', geo:{}}], '2026-11-08T22:30');
  assert.strictEqual(ms.body, 'Berkuat kuasa sekarang hingga esok 01:00 (dikeluarkan 21:10)');
});

test('几个地块同一条警告：一则通知，全部列出', () => {
  const m = stormOfficialMessage('zh', W, [
    {id:'a', name:'Setia Alam', geo:{district:'Petaling', state:'Selangor'}},
    {id:'b', name:'Sp.Pelangai', geo:{district:'Bentong', state:'Pahang'}}], '2026-11-08T16:30');
  assert.strictEqual(m.title, '⚡ MetMalaysia 雷暴警告 · 2 个地块');
  assert.strictEqual(m.body, '现在至 19:00 有效（16:20 发布）\nSetia Alam（Petaling, Selangor）、Sp.Pelangai（Bentong, Pahang）');
  assert.strictEqual(m.detail.length, 2);
});

/* ---- model signal ---- */
function stormHourly(per){
  /* per: model → [[code, rain, cape] for each of 6 hours] */
  const h = {time:[]};
  for(let i = 0; i < 6; i++) h.time.push(`2026-11-08T${String(12 + i).padStart(2, '0')}:00`);
  STORM_MODELS.forEach(m => {
    const rows = per[m] || Array(6).fill([2, 0, 500]);
    h['weather_code_' + m] = rows.map(r => r[0]);
    h['precipitation_' + m] = rows.map(r => r[1]);
    h['cape_' + m] = rows.map(r => r[2]);
  });
  return h;
}
const calm = Array(6).fill([2, 0, 2500]);
const storm = (at) => calm.map((r, i) => (i === at ? [80, 9, 2500] : r));

test('高 CAPE 但没下大雨不算——马来西亚下午 CAPE 天天都高', () => {
  const sig = modelSignal(stormHourly(Object.fromEntries(STORM_MODELS.map(m => [m, calm]))), 0);
  assert.strictEqual(sig.count, 0);
  assert.strictEqual(sig.total, 7);
});

test('三个模式有大雨＋不稳定才提醒，并说最早几点', () => {
  const h = stormHourly({ecmwf_ifs025:storm(2), gfs_seamless:storm(1), icon_seamless:[[95, 1, 900]].concat(calm.slice(1))});
  const sig = modelSignal(h, 0);
  assert.strictEqual(sig.count, 3);
  assert.strictEqual(sig.first, '2026-11-08T12:00');
  assert.ok(modelAlert(sig));
  assert.ok(!modelAlert(modelSignal(stormHourly({ecmwf_ifs025:storm(2), gfs_seamless:storm(1)}), 0)), '两个不够');
});

test('三小时以外的不算', () => {
  const h = stormHourly({ecmwf_ifs025:storm(4), gfs_seamless:storm(4), icon_seamless:storm(4)});
  assert.strictEqual(modelSignal(h, 0).count, 0);
  assert.strictEqual(modelSignal(h, 2).count, 3);
});

test('模式提醒写明几个模式同意，并标明不是官方警告', () => {
  const m = stormModelMessage('zh', [{id:'a', name:'Setia Alam', sig:{count:4, total:7, first:'2026-11-08T15:00'}}]);
  assert.strictEqual(m.title, '⛈ 可能有雷雨 · Setia Alam');
  assert.strictEqual(m.body, '4/7 个模式显示未来 3 小时有雷雨，约 15:00 起 · 模式预测，不是官方警告');
});

/* ---- validation ---- */
const P256DH = 'BIJ7_6fCuHIGqiaM98xjRy_s5QgJ3ea8xuf5Fngx1iJo5O8_DuaKulY-oFHX-fdRezaLS0t6hrvFS6hoROxcaso';
const AUTH = 'azNDjVHPx0DLt25K4u5NMg';
const WINS = [{id:'morning', on:false, from:'06:00', to:'12:00', at:'06:00', mode:'threshold'}];
function body(over){
  return Object.assign({
    id:'device-0001', tz:'Asia/Kuala_Lumpur', lang:'zh',
    sub:{endpoint:'https://fcm.googleapis.com/fcm/send/x', keys:{p256dh:P256DH, auth:AUTH}},
    notify:{windows:WINS, rules:{}, storm:{official:true, model:false}},
    blocks:[{id:'a', name:'Setia Alam', lat:3.1, lon:101.46, windows:[], storm:true,
             geo:{iso:'MY-10', state:'Selangor', district:'Petaling', junk:'x'.repeat(500)}}]
  }, over);
}

test('只开了雷暴提醒的地块也要收下', () => {
  const r = validateSub(body());
  assert.ok(r.ok, r.error);
  assert.deepStrictEqual(r.value.notify.storm, {official:true, model:false, radar:false, flood:false});
  assert.strictEqual(r.value.blocks[0].storm, true);
  assert.deepStrictEqual(r.value.blocks[0].geo, {iso:'MY-10', state:'Selangor', district:'Petaling', division:undefined});
});

test('雷暴提醒两种都关了，这种地块就没东西可发', () => {
  const r = validateSub(body({notify:{windows:WINS, rules:{}, storm:{official:false, model:false}}}));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'noBlocks');
});

test('马来西亚以外的州代码不收', () => {
  const b = body();
  b.blocks[0].geo = {iso:'TH-10', state:'x'};
  assert.strictEqual(validateSub(b).value.blocks[0].geo, undefined);
});

/* ---- the run, end to end ---- */
function mkEnv(){
  const store = new Map();
  return {
    store,
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
function mkRun(fetched, modelHour){
  const calls = [];
  return {calls, cache:new Map(), seen:new Set(), modelHour,
    fetchJson:async url => { calls.push(url); return fetched(url); },
    post:async () => ({status:201})};
}
function dev(storm, blocks){
  return {id:'device-0001', tz:'Asia/Kuala_Lumpur', lang:'zh',
          sub:{endpoint:'https://fcm.googleapis.com/fcm/send/x', keys:{p256dh:P256DH, auth:AUTH}},
          notify:{windows:[], rules:{}, storm}, blocks};
}
const KUANTAN_PLOT = {id:'k', name:'Kuantan', lat:3.8, lon:103.3, tz:'Asia/Kuala_Lumpur', windows:[], storm:true, geo:KUANTAN};
const BENTONG_PLOT = {id:'b', name:'Sp.Pelangai', lat:3.34, lon:102.08, tz:'Asia/Kuala_Lumpur', windows:[], storm:true, geo:BENTONG};
/* 02:30 UTC = 10:30 in Malaysia, inside the 08:00–12:00 warning */
const NOW = new Date('2026-11-08T02:30:00Z');

test('官方警告：配对到的地块发一次，下一轮不再重复', async () => {
  const env = mkEnv();
  const run = mkRun(url => (url.includes('data.gov.my') ? [WARN] : null), false);
  const d = dev({official:true, model:false}, [KUANTAN_PLOT, BENTONG_PLOT]);
  const r1 = await runStorm(env, d, NOW, run);
  assert.strictEqual(r1.length, 1);
  assert.strictEqual(r1[0].result, 'sent');
  assert.deepStrictEqual(r1[0].ids, ['k']);
  assert.strictEqual(r1[0].body, 'Kuantan, Pahang · 现在至 12:00 有效（08:50 发布）');
  assert.strictEqual(r1[0].loc, 'k', '只有一个地块时，点通知直接打开那块地');
  const r2 = await runStorm(env, d, new Date('2026-11-08T02:45:00Z'), mkRun(url => [WARN], false));
  assert.strictEqual(r2.length, 0);
});

test('官方警告发送失败时不记账，下一轮再试', async () => {
  const env = mkEnv();
  const run = mkRun(() => [WARN], false);
  run.post = async () => ({status:500});
  const r = await runStorm(env, dev({official:true, model:false}, [KUANTAN_PLOT]), NOW, run);
  assert.strictEqual(r[0].result, 'failed');
  assert.strictEqual([...env.store.keys()].filter(k => k.startsWith('storm:o:')).length, 0);
});

test('模式提醒：每小时第一轮才查，发过后三小时内不再发', async () => {
  const wet = {};
  ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'].forEach(m => { wet[m] = storm(1); });
  const h = stormHourly(wet);
  h.time = h.time.map((t, i) => `2026-11-08T${String(10 + i).padStart(2, '0')}:00`);
  const fetched = url => (url.includes('open-meteo') ? {hourly:h} : []);
  const env = mkEnv();
  const d = dev({official:false, model:true}, [BENTONG_PLOT]);

  assert.strictEqual((await runStorm(env, d, NOW, mkRun(fetched, false))).length, 0, '不是整点那一轮');
  const r = await runStorm(env, d, NOW, mkRun(fetched, true));
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].kind, 'model');
  assert.strictEqual(r[0].body, '3/7 个模式显示未来 3 小时有雷雨，约 11:00 起 · 模式预测，不是官方警告');
  assert.strictEqual((await runStorm(env, d, NOW, mkRun(fetched, true))).length, 0, '冷却中');
});

test('已有官方警告的地块不再加发模式提醒', async () => {
  const wet = {};
  ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'].forEach(m => { wet[m] = storm(0); });
  const h = stormHourly(wet);
  h.time = h.time.map((t, i) => `2026-11-08T${String(10 + i).padStart(2, '0')}:00`);
  const run = mkRun(url => (url.includes('open-meteo') ? {hourly:h} : [WARN]), true);
  const r = await runStorm(mkEnv(), dev({official:true, model:true}, [KUANTAN_PLOT]), NOW, run);
  assert.deepStrictEqual(r.map(x => x.kind), ['official']);
});

test('没开雷暴提醒的设备一个请求都不发', async () => {
  const run = mkRun(() => [WARN], true);
  const r = await runStorm(mkEnv(), dev(undefined, [KUANTAN_PLOT]), NOW, run);
  assert.strictEqual(r.length, 0);
  assert.strictEqual(run.calls.length, 0);
});
