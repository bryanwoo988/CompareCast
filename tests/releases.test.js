const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const {cmpVersion, notesSince} = require('../notifylogic.js');

const app = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const appVer = (app.match(/const APP_VERSION = '([^']+)'/) || [])[1];
const versions = [...app.matchAll(/^\s*\{v:'([^']+)'/gm)].map(m => m[1]);

/* The release notes only work if they are actually written. This is the thing
   that makes "every update shows what changed" hold six months from now. */
test('当前版本必须有一条更新说明', () => {
  assert.ok(versions.includes(appVer),
    `APP_VERSION ${appVer} 在 RELEASES 里没有对应条目——加一条再发版`);
});
test('更新说明按版本从新到旧排列', () => {
  const sorted = versions.slice().sort(cmpVersion).reverse();
  assert.deepStrictEqual(versions, sorted, '顺序乱了，用户会先看到旧的');
});
test('每条说明三种语言都要有内容', () => {
  const blocks = [...app.matchAll(/\{v:'[^']+',\s*zh:\[([\s\S]*?)\],\s*en:\[([\s\S]*?)\],\s*ms:\[([\s\S]*?)\]\s*\}/g)];
  assert.ok(blocks.length >= 1, '解析不到任何更新说明');
  blocks.forEach(b => {
    [1,2,3].forEach(i => assert.ok(b[i].trim().length > 4, '有语言是空的: ' + b[0].slice(0,24)));
  });
});

test('版本比较', () => {
  assert.ok(cmpVersion('3.9.0', '3.8.0') > 0);
  assert.ok(cmpVersion('3.8.0', '3.10.0') < 0, '10 要按数字比，不是按字符串');
  assert.strictEqual(cmpVersion('3.8.0', '3.8.0'), 0);
  assert.ok(cmpVersion('4.0.0', '3.99.99') > 0);
});

const R = [{v:'3.9.0'}, {v:'3.8.0'}, {v:'3.7.0'}];
test('只返回比已看版本更新的条目', () => {
  assert.deepStrictEqual(notesSince(R, '3.7.0').map(x => x.v), ['3.9.0','3.8.0']);
});
test('已是最新时没有条目', () => {
  assert.deepStrictEqual(notesSince(R, '3.9.0'), []);
});
test('已看版本比全部都新时也不报错', () => {
  assert.deepStrictEqual(notesSince(R, '9.0.0'), []);
});
test('没有已看版本时返回全部——由调用方决定要不要显示', () => {
  assert.strictEqual(notesSince(R, null).length, 3);
});
