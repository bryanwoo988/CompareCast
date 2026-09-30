const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

const app = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const sw  = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
const appVer = (app.match(/const APP_VERSION = '([^']+)'/) || [])[1];

/* APP_VERSION is the human-readable release — the About line and the
   release notes. It is no longer what tells a phone an update exists. */
test('app.js 声明了 APP_VERSION', () => {
  assert.match(appVer || '', /^\d+\.\d+\.\d+$/);
});
test('三种语言的 version 文案都不再写死数字', () => {
  const hard = [...app.matchAll(/version:'[^']*\d+\.\d+[^']*'/g)].map(m => m[0]);
  assert.deepStrictEqual(hard, [], '还有写死版本号的文案: ' + hard.join(', '));
});

/* sw.js used to carry the release number, and every release had to edit it
   or phones would never hear of the update. A new revision is now detected
   from index.html's Last-Modified, so sw.js changes only when the worker's
   own logic does. These pin that: nothing in it follows the release. */
test('sw.js 的缓存名不带版本号——发版不用改它', () => {
  assert.match(sw, /const SHELL = 'pw-shell';/);
});
test('sw.js 里唯一的版本行是固定的过渡标记，永远不用改', () => {
  const lines = [...sw.matchAll(/const VERSION = 'pw-v([^']+)'/g)].map(m => m[1]);
  assert.deepStrictEqual(lines, ['3.22.0']);
});
/* Pages from 3.21.x read that line with this very pattern and update when it
   differs from their own version — the marker is what moves them, once, onto
   the revision check. */
test('3.21.x 的旧页面读到这行会判定要更新', () => {
  const old = (/const VERSION = 'pw-v([0-9.]+)'/.exec(sw) || [])[1];
  assert.ok(old && old !== '3.21.0' && old !== '3.21.1');
});
