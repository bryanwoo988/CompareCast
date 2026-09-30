const {test} = require('node:test');
const assert = require('node:assert');
const {newerRevision, updateAction} = require('../updatelogic.js');

/* ---- which revision is live ----
   index.html's Last-Modified, which GitHub Pages sets on every deploy. The
   running page reads its own from document.lastModified — local time,
   "MM/DD/YYYY hh:mm:ss" — and the live one from a HEAD, as an HTTP date.
   Nothing has to be bumped by hand for a new revision to be noticed. */
const pad = n => String(n).padStart(2, '0');
const docStamp = ms => { const d = new Date(ms);          /* what document.lastModified looks like */
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
const httpStamp = ms => new Date(ms).toUTCString();      /* what the Last-Modified header looks like */
const DEPLOY = Date.UTC(2026, 8, 30, 8, 16, 54);

test('同一个版本：不算新（两种写法、时区不同也一样）', () => {
  assert.strictEqual(newerRevision(docStamp(DEPLOY), httpStamp(DEPLOY)), false);
});
test('服务器上的 index.html 比较新：算新', () => {
  assert.strictEqual(newerRevision(docStamp(DEPLOY), httpStamp(DEPLOY + 10 * 60e3)), true);
});
test('服务器上的比较旧（例如回滚）：不自动更新', () => {
  assert.strictEqual(newerRevision(docStamp(DEPLOY), httpStamp(DEPLOY - 10 * 60e3)), false);
});
test('读不到时间就不当成新版本', () => {
  assert.strictEqual(newerRevision(docStamp(DEPLOY), null), false);
  assert.strictEqual(newerRevision('', httpStamp(DEPLOY)), false);
  assert.strictEqual(newerRevision(docStamp(DEPLOY), 'garbage'), false);
});

/* ---- what to do when a newer build is live ----
   An update should never need a manual refresh or a close-and-reopen, and it
   should never yank the page from under someone mid-task. */
test('刚打开或刚回到 App：直接更新', () => {
  assert.strictEqual(updateAction({hidden:false, sinceVisibleMs:800, busy:false}), 'apply');
});
test('正在用、而且有东西开着：显示提示条，不打断', () => {
  assert.strictEqual(updateAction({hidden:false, sinceVisibleMs:800, busy:true}), 'banner');
});
test('已经在用一阵子：显示提示条', () => {
  assert.strictEqual(updateAction({hidden:false, sinceVisibleMs:60000, busy:false}), 'banner');
});
test('在后台：等回来再说', () => {
  assert.strictEqual(updateAction({hidden:true, sinceVisibleMs:0, busy:false}), 'defer');
});
test('用户自己下拉刷新：直接更新', () => {
  assert.strictEqual(updateAction({hidden:false, sinceVisibleMs:60000, busy:false, asked:true}), 'apply');
});

/* ---- no reload loops ----
   Without a service worker in control (private browsing, a first visit), the
   browser's HTTP cache can serve the old files for up to ten minutes after a
   deploy (GitHub Pages sends max-age=600). A reload would land on the old
   build again, see the new one live, and reload again — every 1.5 s. */
const {mayAutoReload} = require('../updatelogic.js');
const T0 = 1790000000000;
const R1 = 'Wed, 30 Sep 2026 08:16:54 GMT', R2 = 'Wed, 30 Sep 2026 09:02:10 GMT';
test('第一次自动更新可以', () => {
  assert.strictEqual(mayAutoReload(null, R1, T0), true);
});
test('同一个版本十分钟内已经自动试过：不再自动重载', () => {
  assert.strictEqual(mayAutoReload({v:R1, at:T0}, R1, T0 + 60e3), false);
});
test('十分钟后可以再试', () => {
  assert.strictEqual(mayAutoReload({v:R1, at:T0}, R1, T0 + 11 * 60e3), true);
});
test('又有一个更新的版本：可以', () => {
  assert.strictEqual(mayAutoReload({v:R1, at:T0}, R2, T0 + 60e3), true);
});
