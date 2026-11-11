const {test} = require('node:test');
const assert = require('node:assert');
const O = require('../overlaylogic.js');
const {gif} = require('./helpers/gif.js');

/* The map's weather layers: radar frames decoded to rain only, their
   times, and which satellite times are shown. */
const W = 1352, H = 570;
const PAL = {0:[102, 102, 170], 1:[204, 153, 102], 2:[0, 240, 0], 3:[220, 0, 0], 4:[210, 10, 210]};

test('雷达：每一帧只留下雨，陆地、海、右边的图例都变透明', () => {
  const f1 = new Uint8Array(W * H).fill(0), f2 = new Uint8Array(W * H).fill(1);
  f1[100 * W + 200] = 2; f2[100 * W + 201] = 3;
  for(let x = 1112; x < 1186; x++) f2[90 * W + x] = 4;     // the legend panel
  const maps = O.radarFrameMaps(gif(W, H, [f1, f2], PAL));
  assert.strictEqual(maps.length, 2);
  assert.strictEqual(maps[0].length, O.OVL_MAP_W * O.OVL_MAP_H, '裁到地图范围');
  const band = (r, g, b) => O.OVL_RAIN.findIndex(c => c[0] === r && c[1] === g && c[2] === b) + 1;
  assert.strictEqual(maps[0][100 * O.OVL_MAP_W + 200], band(0, 240, 0));
  assert.strictEqual(maps[1][100 * O.OVL_MAP_W + 201], band(220, 0, 0));
  assert.strictEqual(maps[1][100 * O.OVL_MAP_W + 300], 0, '陆地不是雨');
  assert.strictEqual(maps[0][100 * O.OVL_MAP_W + 300], 0, '海不是雨');
});

test('雷达：不是 GIF 就不硬解', () => {
  assert.strictEqual(O.radarFrameMaps(Uint8Array.from([1, 2, 3])), null);
});

test('雨的颜色：有雨的地方照图例上色，没雨的透明', () => {
  const px = O.rainRgba(Uint8Array.from([0, 1]), 200);
  assert.deepStrictEqual([...px.slice(0, 4)], [0, 0, 0, 0]);
  assert.deepStrictEqual([...px.slice(4, 8)], [...O.OVL_RAIN[0].slice(0, 3), 200]);
});

test('雷达每一帧的时间：文件写入时间往前推到上一个 10 分钟，再每帧往前 10 分钟', () => {
  const t = O.radarFrameTimes(Date.parse('Wed, 11 Nov 2026 05:21:06 GMT'), 6).map(x => new Date(x).toISOString().slice(11, 16));
  assert.deepStrictEqual(t, ['04:20', '04:30', '04:40', '04:50', '05:00', '05:10']);
});

test('卫星：只取最新 3 小时，旧的在前', () => {
  const list = [];
  for(let m = 0; m <= 300; m += 10){ const d = new Date(Date.UTC(2026, 10, 11, 0, m)); list.push({basetime:d.toISOString().replace(/[-:T]/g, '').slice(0, 12) + '00'}); }
  const f = O.satFrames(list.slice().reverse().concat([{basetime:'junk'}]), 3);
  assert.strictEqual(f.length, 19);
  assert.strictEqual(f[0].bt, '20261111020000');
  assert.strictEqual(f[f.length - 1].bt, '20261111050000');
  assert.deepStrictEqual(O.satFrames(null, 3), []);
});

test('卫星图块网址：红外用第 13 波段，可见光用第 3 波段', () => {
  assert.strictEqual(O.satTileUrl('ir', '20261111050000'),
    'https://www.jma.go.jp/bosai/himawari/data/satimg/20261111050000/fd/20261111050000/B13/TBB/{z}/{x}/{y}.jpg');
  assert.ok(O.satTileUrl('vis', '20261111050000').includes('/B03/ALBD/'));
});
