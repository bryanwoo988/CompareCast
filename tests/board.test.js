/* InfoBanjir's notice board: reading JPS's poster list, passing it and the
   posters through to the app, and telling each device about new ones. */
const {test} = require('node:test');
const assert = require('node:assert');
const B = require('../server/src/board.js');
const {runBoard} = require('../server/src/cron.js');
const {handle} = require('../server/src/index.js');
const {boardMessage} = require('../server/src/message.js');
const {validateSub} = require('../server/src/validate.js');

/* the live list on 27 Nov 2026 */
const LIST = [
  {MemoDT:'2026-11-26 20:00:00', MemoName:'JPS-PRABN-TRG.JPG', MimeType:'image/jpeg', StartPublishDT:'2026-11-26 20:00:00', EndPublishDT:'2026-11-30 23:59:00'},
  {MemoDT:'2026-11-26 20:00:00', MemoName:'JPS-PRABN-KEL-RA.JPG', MimeType:'image/jpeg', StartPublishDT:'2026-11-26 20:00:00', EndPublishDT:'2026-11-30 23:59:00'},
  {MemoDT:'2026-11-23 22:00:00', MemoName:'Amaran Banjir Negeri Terengganu.jfif', MimeType:'image/jpeg', StartPublishDT:'2026-11-23 22:00:00', EndPublishDT:'2026-11-28 00:00:00'}
];
const NOW = '2026-11-27T21:00';

test('the states a poster is about, from its name', () => {
  assert.deepStrictEqual(B.boardStates('JPS-PRABN-TRG.JPG'), ['Terengganu']);
  assert.deepStrictEqual(B.boardStates('JPS-PRABN-KEL-RA.JPG'), ['Kelantan']);
  assert.deepStrictEqual(B.boardStates('Amaran Banjir Negeri Terengganu.jfif'), ['Terengganu']);
  assert.deepStrictEqual(B.boardStates('Amaran Banjir Kelantan dan Pahang.jpg'), ['Pahang', 'Kelantan']);
  /* a three-letter code inside a word is not a state */
  assert.deepStrictEqual(B.boardStates('Kenyataan Media.jpg'), []);
});

test('the posters up now, newest first, with what the app needs', () => {
  const items = B.boardItems(LIST, NOW);
  assert.deepStrictEqual(items.map(x => x.name), ['JPS-PRABN-TRG.JPG', 'JPS-PRABN-KEL-RA.JPG', 'Amaran Banjir Negeri Terengganu.jfif']);
  assert.deepStrictEqual(items[0], {id:'JPS-PRABN-TRG.JPG|2026-11-26T20:00', name:'JPS-PRABN-TRG.JPG', title:'', kind:'forecast',
    states:['Terengganu'], at:'2026-11-26T20:00', from:'2026-11-26T20:00', to:'2026-11-30T23:59', mime:'image/jpeg'});
  assert.strictEqual(items[2].title, 'Amaran Banjir Negeri Terengganu');
  assert.strictEqual(items[2].kind, 'notice');
  /* taken down at 00:00 on the 28th; not yet up before 20:00 on the 26th */
  assert.deepStrictEqual(B.boardItems(LIST, '2026-11-28T00:00').map(x => x.name), ['JPS-PRABN-TRG.JPG', 'JPS-PRABN-KEL-RA.JPG']);
  assert.deepStrictEqual(B.boardItems(LIST, '2026-11-26T19:59').map(x => x.name), ['Amaran Banjir Negeri Terengganu.jfif']);
});

test('names that could reach anything else are refused', () => {
  const bad = ['../wp-config.php', 'a/b.jpg', 'x.php', 'x.jpg?y=1', '', 'x.html'];
  assert.deepStrictEqual(B.boardItems(bad.map(n => ({MemoName:n, MemoDT:'2026-11-26 20:00:00'})), NOW), []);
  bad.forEach(n => assert.deepStrictEqual(B.fileCandidates(n), [], n));
});

test('a poster is tried as listed, then with its extension in the other case', () => {
  assert.deepStrictEqual(B.fileCandidates('Amaran Banjir Negeri Terengganu.jfif'),
    ['Amaran Banjir Negeri Terengganu.jfif', 'Amaran Banjir Negeri Terengganu.JFIF']);
  assert.strictEqual(B.fileUrl('Amaran Banjir Negeri Terengganu.JFIF'),
    'https://publicinfobanjir.water.gov.my/wp-content/themes/enlighten/assets/images/shared/Amaran%20Banjir%20Negeri%20Terengganu.JFIF');
  assert.strictEqual(B.mimeOf('x.JFIF'), 'image/jpeg');
});

test('the message: one poster, or several in one', () => {
  const items = B.boardItems(LIST, NOW);
  assert.deepStrictEqual(boardMessage('zh', items.slice(0, 1)),
    {title:'📢 InfoBanjir 新公告', body:'洪水预测 · Terengganu\n点开查看海报', ids:[], kind:'board'});
  const m = boardMessage('en', items);
  assert.strictEqual(m.title, '📢 3 new InfoBanjir notices');
  assert.strictEqual(m.body, 'Flood forecast · Terengganu\nFlood forecast · Kelantan\nAmaran Banjir Negeri Terengganu\nTap to see the poster');
});

/* ---- cron ---- */
const P256DH = 'BIJ7_6fCuHIGqiaM98xjRy_s5QgJ3ea8xuf5Fngx1iJo5O8_DuaKulY-oFHX-fdRezaLS0t6hrvFS6hoROxcaso';
const AUTH = 'azNDjVHPx0DLt25K4u5NMg';
function mkEnv(){
  const store = new Map();
  return {store, ORIGIN:'https://bryanwoo988.github.io',
    KV:{async get(k){ return store.has(k) ? store.get(k) : null; }, async put(k, v){ store.set(k, v); }, async delete(k){ store.delete(k); }},
    VAPID_SUBJECT:'mailto:a@b.c',
    VAPID_PUBLIC_KEY:'BGJeNBIeMsmfIK_tmAdS6ttS1scBmOTdVQxUg1zEqaK1pW1U9BKtkWNK4F3yTVsHGL6gNiHfK3ORLPdEM85Lp50',
    VAPID_PRIVATE_KEY:'8W_kk0VdwFXgM9ncShpoSBfBaPNG-2p-Zb3OLII6gA8'};
}
const DEV = board => ({id:'device-0001', tz:'Asia/Kuala_Lumpur', lang:'zh',
  sub:{endpoint:'https://web.push.apple.com/x', keys:{p256dh:P256DH, auth:AUTH}},
  notify:{windows:[], rules:{}, storm:{}, board}, blocks:[]});
const WHEN = new Date('2026-11-27T13:07:00Z');            /* 21:07 in Malaysia */
const mkRun = (list, posts) => ({cache:new Map(), seen:new Set(), stats:{},
  fetchJson:async () => list, post:async () => { posts.push(1); return {status:201}; }});

test('new posters are told once, all at once; nothing new, nothing sent', async () => {
  const env = mkEnv(), posts = [];
  let r = await runBoard(env, DEV(true), WHEN, mkRun(LIST, posts));
  assert.deepStrictEqual(r.map(x => [x.kind, x.n, x.result]), [['board', 3, 'sent']]);
  assert.strictEqual(r[0].title, '📢 InfoBanjir 3 则新公告');
  r = await runBoard(env, DEV(true), WHEN, mkRun(LIST, posts));
  assert.deepStrictEqual(r, []);
  /* one more goes up */
  const more = LIST.concat([{MemoDT:'2026-11-27 21:00:00', MemoName:'JPS-PRABN-PHG.JPG', StartPublishDT:'2026-11-27 21:00:00', EndPublishDT:'2026-11-30 23:59:00'}]);
  r = await runBoard(env, DEV(true), WHEN, mkRun(more, posts));
  assert.deepStrictEqual(r.map(x => [x.n, x.body]), [[1, '洪水预测 · Pahang\n点开查看海报']]);
  assert.strictEqual(posts.length, 2);
});

test('switched off, or the list could not be read: nothing is sent or forgotten', async () => {
  const env = mkEnv(), posts = [];
  assert.deepStrictEqual(await runBoard(env, DEV(false), WHEN, mkRun(LIST, posts)), []);
  await runBoard(env, DEV(true), WHEN, mkRun(LIST, posts));
  const before = env.store.get('board:device-0001');
  assert.deepStrictEqual(await runBoard(env, DEV(true), WHEN, mkRun(null, posts)), []);
  assert.strictEqual(env.store.get('board:device-0001'), before);
  /* posters taken down drop out of the list kept */
  await runBoard(env, DEV(true), new Date('2026-11-28T00:07:00Z'), mkRun(LIST, posts));
  assert.strictEqual(JSON.parse(env.store.get('board:device-0001')).length, 2);
});

test('a phone that wants only the board still registers', () => {
  const body = {id:'abcdefgh1234', tz:'Asia/Kuala_Lumpur', lang:'zh',
    sub:{endpoint:'https://web.push.apple.com/x', keys:{p256dh:P256DH, auth:AUTH}},
    notify:{windows:[{id:'morning', on:true, from:'06:00', to:'12:00', at:'06:00', mode:'threshold'}], rules:{}, app:false, board:true}, blocks:[]};
  const r = validateSub(body);
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.value.notify.board, true);
  body.notify.board = false;
  assert.strictEqual(validateSub(body).error, 'noBlocks');
});

/* ---- the app's two requests ---- */
const ORIGIN = 'https://bryanwoo988.github.io';
const get = (p) => new Request('https://w.example' + p, {headers:{Origin:ORIGIN}});

test('GET /board passes the list on, read and trimmed', async () => {
  const calls = [];
  const res = await handle(get('/board'), mkEnv(), async (url, init) => { calls.push([url, init.cf]); return new Response(JSON.stringify(LIST)); });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.deepStrictEqual(calls[0], [B.BOARD_URL, {cacheTtl:300, cacheEverything:true}]);
  const j = await res.json();
  assert.ok(Array.isArray(j.items) && j.items.every(x => x.name && x.id));
});

test('GET /board/file tries the other case, and labels the picture', async () => {
  const tried = [];
  const res = await handle(get('/board/file?n=' + encodeURIComponent('Amaran Banjir Negeri Terengganu.jfif')), mkEnv(), async url => {
    tried.push(url);
    return /JFIF$/.test(url) ? new Response('JPEGDATA', {headers:{'Content-Type':'application/octet-stream'}})
      : new Response('<html>', {status:404, headers:{'Content-Type':'text/html'}});
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.headers.get('Content-Type'), 'image/jpeg');
  assert.strictEqual(await res.text(), 'JPEGDATA');
  assert.strictEqual(tried.length, 2);
  assert.strictEqual((await handle(get('/board/file?n=../x.php'), mkEnv(), async () => { throw new Error('fetched'); })).status, 400);
  /* InfoBanjir's "not found" page arrives as a 200 HTML page */
  const html = await handle(get('/board/file?n=x.jpg'), mkEnv(), async () => new Response('<html>', {headers:{'Content-Type':'text/html'}}));
  assert.strictEqual(html.status, 404);
});
