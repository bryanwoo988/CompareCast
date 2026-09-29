/* Sending, de-duplication and dead-subscription cleanup.

   The encryption itself is not hand-written. RFC 8291 failures are silent —
   a botched key agreement or padding comes back as a bare 4xx with nothing
   to point at — so this delegates to a library built on Web Crypto. */
import {buildPushPayload} from '@block65/webcrypto-web-push';

/* One reminder per device, window and local day. The plots it covered are
   the entry's value rather than part of the key: they travel in one message
   now, and a retry has to know which of them are already done. */
function sentKey(devId, winId, dayISO){
  return `sent:${devId}:${winId}:${dayISO}`;
}

const DEDUPE_TTL = 60 * 60 * 36;

/* The plots of a reminder already decided — sent, or judged to have nothing
   worth sending. Anything unreadable counts as nothing done: a repeat is a
   smaller harm than a reminder that can never go out again. */
async function readLedger(env, key){
  try{
    const v = JSON.parse(await env.KV.get(key) || '[]');
    return new Set(Array.isArray(v) ? v.filter(x => typeof x === 'string') : []);
  }catch(e){ return new Set(); }
}
async function writeLedger(env, key, ids){
  await env.KV.put(key, JSON.stringify([...ids]), {expirationTtl:DEDUPE_TTL});
}

/* Send one push and say how it went: 'sent', 'expired' (the subscription is
   gone and the device has been removed) or 'failed'. Nothing is recorded
   here — whether a failure is retried is the caller's call, and it is.

   `post` is injectable so the tests can drive every status path without a
   network; production passes nothing and it falls through to fetch. */
async function sendOne(env, dev, payload, post){
  const send = post || (async (url, init) => fetch(url, init));
  let res;
  try{
    const sub = {endpoint:dev.sub.endpoint, expirationTime:null, keys:dev.sub.keys};
    const built = await buildPushPayload(
      {data:payload, options:{ttl:3600, urgency:'normal'}},
      sub,
      {subject:env.VAPID_SUBJECT, publicKey:env.VAPID_PUBLIC_KEY, privateKey:env.VAPID_PRIVATE_KEY}
    );
    /* never followed: the request carries a JWT signed with this app's key,
       and a push service has no business sending it on somewhere else */
    res = await send(dev.sub.endpoint, {method:built.method, headers:built.headers, body:built.body, redirect:'manual'});
  }catch(e){
    /* never log the payload or the endpoint — both identify the user's plots */
    console.log('push error', e && e.name);
    return 'failed';
  }

  if(res.status === 404 || res.status === 410){
    await env.KV.delete('dev:' + dev.id);
    return 'expired';
  }
  if(res.status >= 200 && res.status < 300) return 'sent';
  console.log('push rejected', res.status);
  return 'failed';
}

export {sentKey, sendOne, readLedger, writeLedger, DEDUPE_TTL};
