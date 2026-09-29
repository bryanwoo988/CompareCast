/* Sending, de-duplication and dead-subscription cleanup.

   The encryption itself is not hand-written. RFC 8291 failures are silent —
   a botched key agreement or padding comes back as a bare 4xx with nothing
   to point at — so this delegates to a library built on Web Crypto. */
import {buildPushPayload} from '@block65/webcrypto-web-push';

/* one reminder per device, block, window and local day */
function sentKey(devId, blockId, winId, dayISO){
  return `sent:${devId}:${blockId}:${winId}:${dayISO}`;
}

const DEDUPE_TTL = 60 * 60 * 36;

/* `post` is injectable so the tests can drive every status path without a
   network; production passes nothing and it falls through to fetch */
async function sendOne(env, dev, payload, key, seen, post){
  /* KV is eventually consistent: a key written moments ago may still read as
     missing, so the run's own set is what stops a same-run repeat */
  if(seen.has(key)) return 'skipped';
  if(await env.KV.get(key)) return 'skipped';
  seen.add(key);

  const send = post || (async (url, init) => fetch(url, init));
  let res;
  try{
    const sub = {endpoint:dev.sub.endpoint, expirationTime:null, keys:dev.sub.keys};
    const built = await buildPushPayload(
      {data:payload, options:{ttl:3600, urgency:'normal'}},
      sub,
      {subject:env.VAPID_SUBJECT, publicKey:env.VAPID_PUBLIC_KEY, privateKey:env.VAPID_PRIVATE_KEY}
    );
    res = await send(dev.sub.endpoint, {method:built.method, headers:built.headers, body:built.body});
  }catch(e){
    /* never log the payload or the endpoint — both identify the user's plots */
    console.log('push error', e && e.name);
    seen.delete(key);
    return 'failed';
  }

  if(res.status === 404 || res.status === 410){
    await env.KV.delete('dev:' + dev.id);
    return 'expired';
  }
  if(res.status >= 200 && res.status < 300){
    await env.KV.put(key, '1', {expirationTtl:DEDUPE_TTL});
    return 'sent';
  }
  /* no retry by design; not marking it sent leaves the day open in case a
     later run happens to succeed */
  console.log('push rejected', res.status);
  seen.delete(key);
  return 'failed';
}

export {sentKey, sendOne, DEDUPE_TTL};
