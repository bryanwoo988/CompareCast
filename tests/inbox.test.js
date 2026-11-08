const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const {pruneInbox, inboxEntry, unreadCount, INBOX_MAX} = require('../inbox.js');

const DAY = 86400000, NOW = Date.parse('2026-11-08T09:00:00Z');

test('最新的在前；超过 30 天的、超过 100 条的都丢掉', () => {
  const list = [{at:NOW - 31 * DAY, id:'old'}, {at:NOW - DAY, id:'b'}, {at:NOW, id:'a'}, null, {id:'no time'}];
  assert.deepStrictEqual(pruneInbox(list, NOW).map(e => e.id), ['a', 'b']);
  const many = Array.from({length:150}, (_, i) => ({at:NOW - i * 1000, id:String(i)}));
  const kept = pruneInbox(many, NOW);
  assert.strictEqual(kept.length, INBOX_MAX);
  assert.strictEqual(kept[0].id, '0', '留下的是最新的');
});

test('一条推送变成一笔记录：只留 App 会显示的栏位，标成未读', () => {
  const e = inboxEntry({title:'🌊 River at Warning level · Setia Alam', body:'Sg. Binjai …', loc:'s', tag:'x', junk:{a:1}}, NOW, 0.123456789);
  assert.deepStrictEqual(e, {id:NOW + '-123456', at:NOW, title:'🌊 River at Warning level · Setia Alam', body:'Sg. Binjai …',
                             loc:'s', detail:null, more:0, read:false});
  assert.strictEqual(inboxEntry(null, NOW, 0.5).title, 'CompareCast', '坏掉的推送也要有标题');
});

test('未读数', () => {
  assert.strictEqual(unreadCount([{read:false}, {read:true}, {read:false}]), 2);
  assert.strictEqual(unreadCount(null), 0);
});

/* The real sw.js's push handler, with inbox.js loaded the way importScripts
   loads it and its storage stood in: every push shown is also filed, and
   open windows are told so they can update the badge. */
test('Service Worker：收到推送时同时显示和存档，并通知打开着的 App', async () => {
  const root = path.join(__dirname, '..');
  const handlers = {}, shown = [], filed = [], told = [];
  const self = {
    addEventListener:(t, h) => { handlers[t] = h; },
    location:new URL('https://bryanwoo988.github.io/CompareCast/sw.js'),
    registration:{showNotification:async (title, opts) => { shown.push({title, opts}); }},
    clients:{matchAll:async () => [{postMessage:m => told.push(m)}]}
  };
  const ctx = {self, caches:{}, URL, console, Date, Math, Promise};
  ctx.importScripts = f => {
    if(!f.includes('inbox.js')) return;
    vm.runInContext(fs.readFileSync(path.join(root, 'inbox.js'), 'utf8'), ctx);
    ctx.inboxAdd = async e => { filed.push(e); return [e]; };
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), ctx);
  let done;
  handlers.push({data:{json:() => ({title:'⚡ Storm', body:'now', loc:'s'})}, waitUntil:p => { done = p; }});
  await done;
  assert.strictEqual(shown.length, 1);
  assert.strictEqual(filed.length, 1);
  assert.strictEqual(filed[0].title, '⚡ Storm');
  assert.strictEqual(shown[0].opts.data.inbox, filed[0].id, '通知要带着记录的 id，点开时才能标成已读');
  assert.strictEqual(JSON.stringify(told), JSON.stringify([{type:'inbox'}]));
});
