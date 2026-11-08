/* The notification inbox: every push this phone receives, kept on the phone.

   iOS gives a web app no way to read back notifications it has already
   shown, so the service worker files a copy of each one here as it shows
   it, and the app's Alerts tab reads them. Shared by sw.js (importScripts)
   and the page, so both agree on the shape and the limits.

   Kept on this device only: nothing is sent anywhere, and deleting the app
   or clearing Safari's website data empties it. */

var INBOX_DAYS = 30, INBOX_MAX = 100;
var INBOX_DB = 'pw-inbox', INBOX_STORE = 'kv', INBOX_KEY = 'list';

/* Newest first, nothing older than INBOX_DAYS, at most INBOX_MAX. Entries
   that are not objects with a time are dropped rather than trusted. */
function pruneInbox(list, nowMs){
  var cutoff = nowMs - INBOX_DAYS * 86400000;
  return (Array.isArray(list) ? list : [])
    .filter(function(e){ return e && typeof e === 'object' && typeof e.at === 'number' && e.at >= cutoff && e.at <= nowMs + 60000; })
    .sort(function(a, b){ return b.at - a.at; })
    .slice(0, INBOX_MAX);
}

/* One inbox entry from a push payload: only the fields the app shows. */
function inboxEntry(d, nowMs, rand){
  d = d && typeof d === 'object' ? d : {};
  var str = function(v, n){ return typeof v === 'string' ? v.slice(0, n) : ''; };
  return {
    id:String(nowMs) + '-' + String(rand === undefined ? Math.random() : rand).slice(2, 8),
    at:nowMs,
    title:str(d.title, 200) || 'CompareCast',
    body:str(d.body, 2000),
    loc:str(d.loc, 64),
    detail:Array.isArray(d.detail) ? d.detail.slice(0, 60) : null,
    more:typeof d.more === 'number' ? d.more : 0,
    read:false
  };
}

var unreadCount = function(list){
  return (Array.isArray(list) ? list : []).filter(function(e){ return e && !e.read; }).length;
};

/* ---- storage: one IndexedDB record holding the list, so every change is a
   single read-modify-write inside one transaction and two pushes landing at
   once cannot lose each other ---- */
function inboxDb(){
  return new Promise(function(res, rej){
    var r = indexedDB.open(INBOX_DB, 1);
    r.onupgradeneeded = function(){ r.result.createObjectStore(INBOX_STORE); };
    r.onsuccess = function(){ res(r.result); };
    r.onerror = function(){ rej(r.error); };
  });
}
function inboxUpdate(fn){
  return inboxDb().then(function(db){
    return new Promise(function(res, rej){
      var tx = db.transaction(INBOX_STORE, 'readwrite'), st = tx.objectStore(INBOX_STORE), out;
      var g = st.get(INBOX_KEY);
      g.onsuccess = function(){ out = pruneInbox(fn(g.result || []), Date.now()); st.put(out, INBOX_KEY); };
      tx.oncomplete = function(){ db.close(); res(out); };
      tx.onerror = tx.onabort = function(){ db.close(); rej(tx.error); };
    });
  });
}
function inboxAll(){ return inboxUpdate(function(l){ return l; }); }
function inboxAdd(entry){ return inboxUpdate(function(l){ return [entry].concat(l); }); }
function inboxMarkRead(id){
  return inboxUpdate(function(l){ return l.map(function(e){ return (!id || e.id === id) ? Object.assign({}, e, {read:true}) : e; }); });
}
function inboxClear(){ return inboxUpdate(function(){ return []; }); }

if(typeof module !== 'undefined') module.exports = {pruneInbox, inboxEntry, unreadCount, INBOX_DAYS, INBOX_MAX};
