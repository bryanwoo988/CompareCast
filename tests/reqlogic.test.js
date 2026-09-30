const {test} = require('node:test');
const assert = require('node:assert');
const {makeLatest, freshness} = require('../reqlogic.js');

/* ---- latest request wins ----
   The reviewers reproduced these with delayed fake replies: a Celsius reply
   landing after the Fahrenheit one left a card on "30°", and an older compare
   request overwrote a newer model selection. Every async write now asks the
   token it was issued whether it is still the latest. */
test('较新的请求发出后，较旧的请求作废', () => {
  const L = makeLatest();
  const a = L.begin('kl');
  const b = L.begin('kl');
  assert.strictEqual(a(), false);
  assert.strictEqual(b(), true);
});
test('不同的键互不影响', () => {
  const L = makeLatest();
  const kl = L.begin('kl');
  L.begin('ipoh');
  assert.strictEqual(kl(), true);
});
test('作废之后再发，新的有效', () => {
  const L = makeLatest();
  L.begin('kl');
  const c = L.begin('kl');
  assert.strictEqual(c(), true);
});
test('顺序颠倒的两个回复：只有最后发出的那个能写入', async () => {
  const L = makeLatest(), state = {v:null};
  const req = (v, ms) => { const ok = L.begin('card'); return new Promise(r => setTimeout(r, ms)).then(() => { if(ok()) state.v = v; }); };
  await Promise.all([req('30°C', 30), req('86°F', 5)]);
  assert.strictEqual(state.v, '86°F');
});

/* ---- freshness: when a payload was fetched, and how it should read ---- */
const NOW = Date.UTC(2026, 8, 30, 12, 0);
test('刚拿到的：新鲜', () => {
  const f = freshness(NOW - 5 * 60e3, NOW);
  assert.strictEqual(f.refresh, false);
  assert.strictEqual(f.stale, false);
});
test('超过 30 分钟：该刷新了，但还不算旧', () => {
  const f = freshness(NOW - 45 * 60e3, NOW);
  assert.strictEqual(f.refresh, true);
  assert.strictEqual(f.stale, false);
});
test('超过 3 小时：变灰', () => {
  const f = freshness(NOW - 14 * 3600e3, NOW);
  assert.strictEqual(f.stale, true);
  assert.strictEqual(f.hours, 14);
});
test('跨过午夜：标记为不是今天', () => {
  /* 23:00 yesterday local vs 08:00 today: same numbers, different day */
  const f = freshness(Date.UTC(2026, 8, 29, 15, 0), Date.UTC(2026, 8, 30, 0, 0), 8 * 60);
  assert.strictEqual(f.otherDay, true);
});
test('没有时间戳：当作要刷新、而且是旧的', () => {
  const f = freshness(undefined, NOW);
  assert.strictEqual(f.refresh, true);
  assert.strictEqual(f.stale, true);
});
