const {test} = require('node:test');
const assert = require('node:assert');
const {scheduled, FLOOD_CRON} = require('../server/src/index.js');

/* The two quarter-hourly schedules split the work: rivers alone on theirs,
   reminders, warnings and the model check on the main one. Each has the
   free plan's 10 ms to itself only if neither reaches for the other's data. */
function env(dev){
  const store = new Map([['dev:' + dev.id, JSON.stringify(dev)]]);
  return {KV:{get:async k => store.get(k) ?? null, put:async (k, v) => store.set(k, v), delete:async k => store.delete(k),
              list:async ({prefix}) => ({keys:[...store.keys()].filter(k => k.startsWith(prefix)).map(name => ({name})), list_complete:true})}};
}
const DEV = {id:'device-0001', tz:'Asia/Kuala_Lumpur', lang:'en', sub:{endpoint:'https://fcm.googleapis.com/x', keys:{}},
  notify:{windows:[], rules:{}, storm:{official:true, model:true, flood:true}},
  blocks:[{id:'s', name:'Setia Alam', lat:3.1, lon:101.46, tz:'Asia/Kuala_Lumpur', windows:[], storm:true, geo:{iso:'MY-10', state:'Selangor', district:'Petaling'}}]};

async function hosts(cron){
  const seen = [], real = globalThis.fetch;
  globalThis.fetch = async url => { seen.push(new URL(url).hostname); return new Response('[]', {status:200}); };
  try{ await scheduled({cron}, env(DEV), {}, {now:new Date('2026-11-08T11:00:00Z')}); }
  finally{ globalThis.fetch = real; }
  return [...new Set(seen)].sort();
}

test('河水那一轮只读 JPS', async () => {
  assert.deepStrictEqual(await hosts(FLOOD_CRON), ['publicinfobanjir.water.gov.my']);
});

test('主要那一轮读警告和模式，不读 JPS', async () => {
  const h = await hosts('*/15 * * * *');
  assert.ok(h.includes('api.data.gov.my'), h.join());
  assert.ok(!h.includes('publicinfobanjir.water.gov.my'), h.join());
});
