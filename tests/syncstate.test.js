const {test} = require('node:test');
const assert = require('node:assert');
const {syncMessage} = require('../notifylogic.js');

/* The bug this pins: syncState started as 'idle' and the renderer treated
   anything that was not 'syncing' or 'failed' as success, so a device that had
   never registered — KV empty, no subscription anywhere — was shown a green
   "registered" box. The user believed it was set up and waited for a
   notification that nothing was ever going to send. */

test('从未尝试过绝不能显示成功', () => {
  const m = syncMessage('unknown', true, 'granted');
  assert.notStrictEqual(m.kind, 'ok', '未登记却显示成功');
});
test('主开关关闭时提示去打开，而不是成功', () => {
  assert.notStrictEqual(syncMessage('unknown', false, 'granted').kind, 'ok');
  assert.strictEqual(syncMessage('synced', false, 'granted').kind, 'warn');
});
test('未授权时不显示成功', () => {
  assert.notStrictEqual(syncMessage('synced', true, 'default').kind, 'ok');
  assert.notStrictEqual(syncMessage('synced', true, 'denied').kind, 'ok');
});
test('只有真的登记成功才显示成功', () => {
  assert.strictEqual(syncMessage('synced', true, 'granted').kind, 'ok');
});
test('登记中是中间态，不是成功', () => {
  assert.strictEqual(syncMessage('syncing', true, 'granted').kind, 'busy');
});
test('各种失败都带上可辨认的原因', () => {
  ['nosw','unsupported','failed','http500','subscribe'].forEach(s => {
    const m = syncMessage(s, true, 'granted');
    assert.strictEqual(m.kind, 'err', s);
    assert.ok(m.reason, s + ' 缺少原因');
  });
});
