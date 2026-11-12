/* The app's files are classic scripts sharing one global scope: a name
   declared at the top level of two of them stops the later file from
   loading at all ("Identifier has already been declared"). sharelogic.js
   once declared a `num` that summary.js already had. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const list = html.match(/APP_SCRIPTS\s*=\s*\[([^\]]*)\]/);

test('no two app scripts declare the same top-level name', () => {
  assert.ok(list, 'APP_SCRIPTS found in index.html');
  const files = list[1].match(/'[^']+\.js'/g).map(s => s.slice(1, -1));
  assert.ok(files.includes('app.js') && files.length > 5);
  const seen = {}, dups = [];
  for(const f of files){
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    const re = /^(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;
    let m;
    const own = new Set();
    while((m = re.exec(src))){
      const n = m[1];
      if(own.has(n)) continue;
      own.add(n);
      if(seen[n]) dups.push(`${n}: ${seen[n]} and ${f}`);
      else seen[n] = f;
    }
  }
  assert.deepStrictEqual(dups, []);
});
