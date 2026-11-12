/* The shared forecast picture: what goes on it. */
const test = require('node:test');
const assert = require('node:assert');
const s = require('../sharelogic.js');

/* two days of hours, 'YYYY-MM-DDTHH:00' */
const hours = ['2026-11-12', '2026-11-13'].flatMap(d => Array.from({length:24}, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`));
const H = (over) => Object.assign({
  time:hours,
  temp:hours.map((_, i) => 20 + (i % 24)),
  rain:hours.map(() => 0),
  code:hours.map(() => 2),
  isDay:hours.map((_, i) => (i % 24) >= 7 && (i % 24) < 19 ? 1 : 0)
}, over);

test('a storm in either hour of a block is the block\'s weather', () => {
  assert.strictEqual(s.worseCode(3, 95), 95);
  assert.strictEqual(s.worseCode(95, 80), 95);
  assert.strictEqual(s.worseCode(61, 45), 61, 'rain over fog');
  assert.strictEqual(s.worseCode(51, 3), 51);
  assert.strictEqual(s.worseCode(null, 3), 3);
  assert.strictEqual(s.worseCode(3, null), 3);
});

test('two-hour blocks across the working day', () => {
  const code = hours.map(() => 2); code[15] = 95;               /* 15:00 on the first day */
  const rain = hours.map(() => 0); rain[14] = 1.5; rain[15] = 6;
  const prob = s.probByTime(hours, hours.map((_, i) => i === 14 ? 70 : 10));
  const b = s.shareStrip(H({code, rain, prob}), '2026-11-12', 6, 20, 2);
  assert.deepStrictEqual(b.map(x => x.hour), [6, 8, 10, 12, 14, 16, 18]);
  assert.deepStrictEqual(b[4], {hour:14, code:95, isDay:1, temp:34, rain:7.5, prob:70});
  assert.deepStrictEqual(b[0], {hour:6, code:2, isDay:0, temp:26, rain:0, prob:10});
  /* the second day reads its own hours */
  assert.strictEqual(s.shareStrip(H(), '2026-11-13', 6, 20, 2)[0].temp, 26);
});

test('missing values stay missing rather than reading as zero', () => {
  const b = s.shareStrip(H({rain:undefined, code:hours.map(() => null)}), '2026-11-12', 6, 8, 2);
  assert.deepStrictEqual(b, [{hour:6, code:null, isDay:0, temp:26, rain:null, prob:null}]);
});

test('hours outside the data are left out, and nothing at all gives nothing', () => {
  const half = H({time:hours.slice(0, 13)});                   /* up to 12:00 */
  assert.deepStrictEqual(s.shareStrip(half, '2026-11-12', 6, 20, 2).map(x => x.hour), [6, 8, 10, 12]);
  assert.deepStrictEqual(s.shareStrip(H(), '2026-11-20', 6, 20, 2), []);
  assert.deepStrictEqual(s.shareStrip(null, '2026-11-12', 6, 20, 2), []);
});

test('the next days', () => {
  const d = {time:['2026-11-12', '2026-11-13', '2026-11-14'], code:[3, 95, 61], min:[23, 22, null], max:[31, 30, 29],
    rain:[0, 12.4, 3], prob:[20, 80]};
  assert.deepStrictEqual(s.shareDays(d, 1, 5), [
    {date:'2026-11-13', code:95, min:22, max:30, rain:12.4, prob:80},
    {date:'2026-11-14', code:61, min:null, max:29, rain:3, prob:null}]);
  assert.deepStrictEqual(s.shareDays({}, 0, 5), []);
});

test('the file name is safe on every phone', () => {
  assert.strictEqual(s.shareFileName('A 区 / 12 号: "新"', '2026-11-12'), 'A 区 12 号 新 2026-11-12.png');
  assert.strictEqual(s.shareFileName('', '2026-11-12'), 'forecast 2026-11-12.png');
});
