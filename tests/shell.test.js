const {test} = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');

/* The worker now refuses to install unless every one of our own shell files
   caches — which is what keeps a half-downloaded update from wiping the
   offline copy. The price is that a listed file which does not exist would
   block every future update, so the list is checked against the repo. */
const root = path.join(__dirname, '..');
const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const list = eval(sw.slice(sw.indexOf('['), sw.indexOf('];') + 1));
const own = list.filter(u => !/^https?:/.test(u) && u !== './');

test('缓存清单里自己的文件都存在', () => {
  own.forEach(u => assert.ok(fs.existsSync(path.join(root, u)), '不存在：' + u));
});

/* and the other way round: a script the page loads but the worker never
   caches is a script missing on the first offline launch */
test('index.html 加载的每个本地脚本都在缓存清单里', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
  scripts.forEach(u => assert.ok(own.includes('./' + u.replace(/^\.\//, '')), '没进缓存清单：' + u));
});
