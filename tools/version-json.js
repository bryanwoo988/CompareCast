/* Builds version.json from RELEASES in app.js.

   The push worker reads version.json from the site to learn that a new
   version is out and what changed in it, so it can tell each phone in its
   own language. It is generated rather than written by hand, and
   tests/releases.test.js fails if it is stale, so it can never disagree
   with the notes the app itself shows.

   Run from the repository root after adding a release note:
     node tools/version-json.js */
const fs = require('fs'), path = require('path'), vm = require('vm');

const KEEP = 8;   // enough to cover every version a phone could have missed between checks

function releasesFrom(appSource){
  const start = appSource.indexOf('const RELEASES = [');
  const end = appSource.indexOf('\n];', start);
  if(start < 0 || end < 0) throw new Error('RELEASES not found in app.js');
  const literal = appSource.slice(start + 'const RELEASES = '.length, end + 2);
  return vm.runInNewContext('(' + literal + ')');
}

function build(appSource){
  const rel = releasesFrom(appSource).slice(0, KEEP)
    .map(r => ({v:r.v, date:r.date, time:r.time, zh:r.zh, en:r.en, ms:r.ms}));
  return JSON.stringify({v:rel[0].v, releases:rel}, null, 1) + '\n';
}

if(require.main === module){
  const root = path.join(__dirname, '..');
  const out = build(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
  fs.writeFileSync(path.join(root, 'version.json'), out);
  console.log('version.json', JSON.parse(out).v);
}

module.exports = {build, releasesFrom, KEEP};
