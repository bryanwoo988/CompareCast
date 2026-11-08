const {test} = require('node:test');
const assert = require('node:assert');
const R = require('../server/src/radar.js');

const {gif} = require('./helpers/gif.js');

const W = 1352, H = 570;
const SEA = 0, LAND = 1, LIGHT = 2, HEAVY_IX = 3, LEGEND_HEAVY = 4;
const PAL = {[SEA]:[102, 102, 170], [LAND]:[204, 153, 102], [LIGHT]:[0, 240, 0], [HEAVY_IX]:[220, 0, 0], [LEGEND_HEAVY]:[210, 10, 210]};

/* a blob of heavy rain with a ring of lighter rain round it */
function paint(frame, cx, cy, heavyR, rainR){
  for(let y = Math.floor(cy - rainR); y <= cy + rainR; y++)
    for(let x = Math.floor(cx - rainR); x <= cx + rainR; x++){
      const d = Math.hypot(x - cx, y - cy);
      if(d <= heavyR) frame[y * W + x] = HEAVY_IX;
      else if(d <= rainR && frame[y * W + x] !== HEAVY_IX) frame[y * W + x] = LIGHT;
    }
}

test('图例颜色分得出小雨和大雨；陆地、海、灰线都不算', () => {
  assert.strictEqual(R.classOf(0, 240, 0), R.RAIN);
  assert.strictEqual(R.classOf(247, 165, 0), R.RAIN, '10–20 mm/h 还不算大雨');
  assert.strictEqual(R.classOf(247, 119, 0), R.HEAVY, '20–50 mm/h 算大雨');
  assert.strictEqual(R.classOf(210, 10, 210), R.HEAVY);
  assert.strictEqual(R.classOf(204, 153, 102), 0);
  assert.strictEqual(R.classOf(102, 102, 170), 0);
  assert.strictEqual(R.classOf(5, 155, 255), 0, '0.1–0.5 mm/h 的毛毛雨不算');
});

test('GIF 解码：最新两帧变成雨量等级，右边图例那一栏永远不算雨', () => {
  const f1 = new Uint8Array(W * H).fill(SEA), f2 = new Uint8Array(W * H).fill(SEA);
  paint(f1, 200, 200, 3, 6); paint(f2, 204, 200, 3, 6);
  for(let y = 80; y < 90; y++) for(let x = 1112; x < 1186; x++){ f1[y * W + x] = LEGEND_HEAVY; f2[y * W + x] = LEGEND_HEAVY; }
  const g = R.radarGrids(gif(W, H, [f1, f1, f2], PAL));
  assert.ok(g, '解码失败');
  assert.strictEqual(g.prev[200 * W + 200], R.HEAVY);
  assert.strictEqual(g.cur[200 * W + 204], R.HEAVY);
  assert.strictEqual(g.cur[200 * W + 198], R.RAIN, '移走以后原来的位置只剩小雨');
  assert.strictEqual(g.cur[85 * W + 1150], 0, '图例里的紫色不是雨');
});

test('不是 GIF、或只有一帧，都不硬解', () => {
  assert.strictEqual(R.radarGrids(Uint8Array.from([1, 2, 3])), null);
  assert.strictEqual(R.radarGrids(gif(W, H, [new Uint8Array(W * H)], PAL)), null);
});

test('最新一帧的时间：文件写入时间往前推到上一个 10 分钟', () => {
  assert.strictEqual(new Date(R.frameTime('Sun, 08 Nov 2026 07:51:05 GMT')).toISOString(), '2026-11-08T07:40:00.000Z');
  assert.strictEqual(R.frameTime('garbage'), null);
});

/* ---- tracking, on grids built directly ---- */
const LAT = 3.1036, LON = 101.461;     // Setia Alam
const P = R.toPx(LAT, LON);
function grids(prevAt, curAt, heavyR = 3, rainR = 6){
  const mk = list => {
    const f = new Uint8Array(W * H).fill(SEA);
    for(const [dx, dy] of list) paint(f, P.x + dx, P.y + dy, heavyR, rainR);
    return Uint8Array.from(f, v => (v === HEAVY_IX ? R.HEAVY : v === LIGHT ? R.RAIN : 0));
  };
  return {w:W, prev:mk(prevAt), cur:mk(curAt)};
}

test('西边约 30 km 的大雨往东移：会来，说从西边来、约几分钟到', () => {
  const r = R.radarAt(grids([[-16, 0]], [[-12, 0]]), LAT, LON);
  assert.strictEqual(r.kind, 'coming');
  assert.strictEqual(r.dir, 'W');
  assert.ok(r.min >= 5 && r.min <= 25, '到达时间不合理：' + r.min);
  assert.ok(r.kmh > 40 && r.kmh < 80, '速度不合理：' + r.kmh);
});

test('已经在 10 km 内：直接说就在附近', () => {
  const r = R.radarAt(grids([[3, -2]], [[3, -2]]), LAT, LON);
  assert.strictEqual(r.kind, 'near');
  assert.ok(r.km <= 10);
});

test('停着不动、或往别处走的大雨不提醒', () => {
  assert.strictEqual(R.radarAt(grids([[-12, 0]], [[-12, 0]]), LAT, LON), null, '不动');
  assert.strictEqual(R.radarAt(grids([[-12, 0]], [[-16, 0]]), LAT, LON), null, '走远');
  assert.strictEqual(R.radarAt(grids([[-12, -6]], [[-12, -10]]), LAT, LON), null, '往北走，不经过');
});

test('一两个零星的像素不算风暴', () => {
  const g = grids([], []);
  g.cur[Math.round(P.y) * W + Math.round(P.x) + 1] = R.HEAVY;
  assert.strictEqual(R.radarAt(g, LAT, LON), null);
});

test('一小时以后才到的不说', () => {
  /* 70 km west, 2 px (≈5 km) per 10 minutes: about two hours out */
  assert.strictEqual(R.radarAt(grids([[-30, 0]], [[-28, 0]]), LAT, LON), null);
});

test('雷达图范围外的地块没有结果', () => {
  assert.strictEqual(R.radarAt(grids([], []), 35.68, 139.69), null);
  assert.strictEqual(R.inMap(LAT, LON), true);
});

test('方位', () => {
  assert.strictEqual(R.compass(0, 10), 'N');
  assert.strictEqual(R.compass(10, 10), 'NE');
  assert.strictEqual(R.compass(-10, 0), 'W');
  assert.strictEqual(R.compass(0, -10), 'S');
});
