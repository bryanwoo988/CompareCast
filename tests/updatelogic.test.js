const {test} = require('node:test');
const assert = require('node:assert');
const {parseSwVersion, updateAction} = require('../updatelogic.js');

/* ---- which build is live ----
   The running page knows its own APP_VERSION; the live sw.js carries the
   deployed one (tests/version.test.js keeps the two in step). A difference
   means the page on screen is not the build on the server. */
test('从 sw.js 读出线上版本', () => {
  assert.strictEqual(parseSwVersion("const VERSION = 'pw-v3.21.0';\nconst SHELL = VERSION + '-shell';"), '3.21.0');
});
test('读不出来就是 null，不当成新版本', () => {
  assert.strictEqual(parseSwVersion('<!doctype html>'), null);
  assert.strictEqual(parseSwVersion(''), null);
  assert.strictEqual(parseSwVersion(undefined), null);
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
test('第一次自动更新可以', () => {
  assert.strictEqual(mayAutoReload(null, '3.21.0', T0), true);
});
test('同一个版本十分钟内已经自动试过：不再自动重载', () => {
  assert.strictEqual(mayAutoReload({v:'3.21.0', at:T0}, '3.21.0', T0 + 60e3), false);
});
test('十分钟后可以再试', () => {
  assert.strictEqual(mayAutoReload({v:'3.21.0', at:T0}, '3.21.0', T0 + 11 * 60e3), true);
});
test('换了一个更新的版本：可以', () => {
  assert.strictEqual(mayAutoReload({v:'3.21.0', at:T0}, '3.22.0', T0 + 60e3), true);
});
