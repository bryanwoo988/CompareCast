const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

/* The About line used to read a hardcoded "2.0" that nobody ever updated, so
   it told the user nothing about which build they were running — and they
   reasonably used it to check whether an update had landed. These pin the two
   places the version lives to each other so it can be trusted again. */

const app = fs.readFileSync(__dirname + '/../app.js', 'utf8');
const sw  = fs.readFileSync(__dirname + '/../sw.js', 'utf8');

const appVer = (app.match(/const APP_VERSION = '([^']+)'/) || [])[1];
const swVer  = (sw.match(/const VERSION = 'pw-v([^']+)'/) || [])[1];

test('app.js 声明了 APP_VERSION', () => {
  assert.match(appVer || '', /^\d+\.\d+\.\d+$/);
});
test('sw.js 声明了版本', () => {
  assert.match(swVer || '', /^\d+\.\d+\.\d+$/);
});
test('两处版本号一致——否则「关于」里显示的又会是假的', () => {
  assert.strictEqual(appVer, swVer);
});
test('三种语言的 version 文案都不再写死数字', () => {
  const hard = [...app.matchAll(/version:'[^']*\d+\.\d+[^']*'/g)].map(m => m[0]);
  assert.deepStrictEqual(hard, [], '还有写死版本号的文案: ' + hard.join(', '));
});
