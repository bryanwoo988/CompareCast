/* CompareCast push worker.

   Two jobs: hold each device's subscription and reminder settings, and every
   quarter hour send the reminders that have come due (cron.js). Request bodies
   carry the user's plot coordinates, so nothing here logs them. */
import {validateSub} from './validate.js';
import {runDevice} from './cron.js';

/* A real payload is a few kilobytes even at the 50-plot ceiling. */
const MAX_BODY = 16 * 1024;
/* A family app: without a ceiling, anyone who can reach this URL could keep
   registering devices until the day's KV write quota ran out, and the cron —
   which reads every device every quarter hour — would drain the read quota
   behind it. Existing devices re-syncing are never counted against it. */
const MAX_DEVICES = 50;

const cors = env => ({
  'Access-Control-Allow-Origin': env.ORIGIN,
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
});

const reply = (env, status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body),
    {status, headers:Object.assign({'Content-Type':'application/json'}, cors(env))});

async function readBody(request){
  if(+(request.headers.get('Content-Length') || 0) > MAX_BODY) return {error:'size'};
  let text;
  try{ text = await request.text(); }catch(e){ return {error:'body'}; }
  if(text.length > MAX_BODY) return {error:'size'};
  try{ return {body:JSON.parse(text)}; }catch(e){ return {error:'json'}; }
}

async function handle(request, env){
  const origin = request.headers.get('Origin');
  /* same-origin tools and curl send no Origin; a browser from anywhere else
     is refused outright rather than relying on the browser to enforce it */
  if(origin && origin !== env.ORIGIN) return new Response('forbidden', {status:403});

  if(request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors(env)});

  const url = new URL(request.url);
  if(url.pathname !== '/sub') return reply(env, 404, {error:'not found'});
  if(request.method !== 'POST' && request.method !== 'DELETE') return reply(env, 405, {error:'method'});

  const {body, error} = await readBody(request);
  if(error) return reply(env, error === 'size' ? 413 : 400, {error});

  if(request.method === 'DELETE'){
    if(!body || typeof body.id !== 'string' || body.id.length > 64) return reply(env, 400, {error:'id'});
    await env.KV.delete('dev:' + body.id);
    return reply(env, 204);
  }

  const r = validateSub(body);
  /* the error names a field, never echoes its value */
  if(!r.ok) return reply(env, 400, {error:r.error});
  const key = 'dev:' + r.value.id;
  if(!(await env.KV.get(key))){
    const page = await env.KV.list({prefix:'dev:', limit:MAX_DEVICES});
    if(page.keys.length >= MAX_DEVICES) return reply(env, 429, {error:'full'});
  }
  await env.KV.put(key, JSON.stringify(r.value));
  return reply(env, 204);
}

export const scheduled = async (event, env) => {
  const now = new Date();
  const run = {
    cache:new Map(), seen:new Set(),
    fetchJson:url => fetch(url).then(r => (r.ok ? r.json() : null))
  };
  let cursor, devices = 0, sent = 0, failed = 0;
  do{
    const page = await env.KV.list({prefix:'dev:', cursor});
    for(const k of page.keys){
      const raw = await env.KV.get(k.name);
      if(!raw) continue;
      let dev;
      try{ dev = JSON.parse(raw); }catch(e){ continue; }
      devices++;
      try{
        const rep = await runDevice(env, dev, now, run);
        sent += rep.filter(x => x.result === 'sent').length;
        failed += rep.filter(x => x.result === 'failed').length;
      }catch(e){ console.log('device failed', e && e.name); }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while(cursor);
  /* counts only: titles and bodies name the user's plots */
  console.log('cron done, devices', devices, 'sent', sent, 'failed', failed);
};

export default {
  fetch:handle,
  scheduled(event, env, ctx){ return scheduled(event, env, ctx); }
};

export {handle, MAX_BODY, MAX_DEVICES};
