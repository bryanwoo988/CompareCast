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

/* The app's own scripts are loaded as file?r=<index.html's revision>, never by
   a plain <script src>. A plain one would be reused from the browser's memory
   cache on a reload within GitHub Pages' ten-minute max-age — a new
   index.html running an old app.js, which is exactly what an update reload
   produced before this. */
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const listed = (() => {
  const m = /const APP_SCRIPTS = (\[[^\]]*\])/.exec(html);
  return m ? JSON.parse(m[1].replace(/'/g, '"')) : [];
})();
test('index.html 里没有不带版本标记的本地 <script src>', () => {
  const plain = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
  assert.deepStrictEqual(plain, []);
});
test('加载器列出的每个脚本都在缓存清单里，而且文件存在', () => {
  assert.ok(listed.length >= 9, '加载器的清单是空的？');
  listed.forEach(u => {
    assert.ok(own.includes('./' + u), '没进缓存清单：' + u);
    assert.ok(fs.existsSync(path.join(root, u)), '不存在：' + u);
  });
});
test('app.js 最后加载（它用到前面所有模块）', () => {
  assert.strictEqual(listed[listed.length - 1], 'app.js');
});
