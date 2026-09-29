/* CompareCast push worker.

   Two jobs: hold each device's subscription and reminder settings, and every
   quarter hour send the reminders that have come due. Request bodies carry the
   user's plot coordinates, so nothing here logs them. */
import {validateSub} from './validate.js';

const cors = env => ({
  'Access-Control-Allow-Origin': env.ORIGIN,
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
});

const reply = (env, status, body) =>
  new Response(body === undefined ? null : JSON.stringify(body),
    {status, headers:Object.assign({'Content-Type':'application/json'}, cors(env))});

export default {
  async fetch(request, env){
    const origin = request.headers.get('Origin');
    /* same-origin tools and curl send no Origin; a browser from anywhere else
       is refused outright rather than relying on the browser to enforce it */
    if(origin && origin !== env.ORIGIN) return new Response('forbidden', {status:403});

    if(request.method === 'OPTIONS') return new Response(null, {status:204, headers:cors(env)});

    const url = new URL(request.url);
    if(url.pathname !== '/sub') return reply(env, 404, {error:'not found'});

    let body;
    try{ body = await request.json(); }
    catch(e){ return reply(env, 400, {error:'json'}); }

    if(request.method === 'DELETE'){
      if(!body || typeof body.id !== 'string') return reply(env, 400, {error:'id'});
      await env.KV.delete('dev:' + body.id);
      return reply(env, 204);
    }

    if(request.method === 'POST'){
      const r = validateSub(body);
      /* the error names a field, never echoes its value */
      if(!r.ok) return reply(env, 400, {error:r.error});
      await env.KV.put('dev:' + r.value.id, JSON.stringify(r.value));
      return reply(env, 204);
    }

    return reply(env, 405, {error:'method'});
  }
};
