/* Radar alerts from MetMalaysia's national radar composite.

   MetMalaysia publishes one animated GIF of its 12-radar composite at
   api.met.gov.my/static/images/radar-latest.gif: six frames ten minutes
   apart, the newest about eleven minutes behind real time. Each pixel's
   colour is a rain rate from the legend burned into the right-hand panel.

   What is done with it, per plot:
     1. decode the two newest frames into rain classes — light rain and
        heavy rain, heavy being over 20 mm/h, MetMalaysia's own threshold
        for a thunderstorm warning;
     2. find how the rain around the plot moved between them (block
        matching: the shift that lines up the most rain pixels);
     3. carry the heavy-rain pixels forward along that motion and see when
        the first comes within ALERT_KM of the plot.

   Limits worth knowing, all said again in the app: the radar sees rain,
   not lightning; the image is mapped as a plain lat/lon grid (it is drawn
   in Albers equal-area), which checked against coastal landmarks is out by
   about 2–7 km; and extrapolation only holds while the cell keeps its pace,
   so nothing beyond an hour is claimed.

   The GIF decoder is written here rather than pulled in: only palette
   indices are needed, not RGBA, which halves the work, and the worker's
   CPU budget is the constraint that decides whether this can run at all. */

const RADAR_URL = 'https://api.met.gov.my/static/images/radar-latest.gif';

/* Map area of the composite, and the plain lat/lon grid laid over it. The
   right-hand 252 px are the legend panel and must never be read as rain. */
const MAP_W = 1100, MAP_H = 570;
const LON0 = 96.925, LAT0 = 9.178, PX_PER_LON = 45.323, PX_PER_LAT = 53.471;

const ALERT_KM = 10;          // "near the plot", given 2–7 km of mapping error
const LOOK_KM = 80;           // heavy rain further out than this is ignored
const HORIZON_MIN = 60;       // no arrival claimed beyond an hour
const MIN_PIXELS = 3;         // one stray pixel is not a storm
const MAX_SHIFT = 8;          // px per 10 min, ~110 km/h
const WIN_X = 50, WIN_Y = 45; // motion is measured in about ±110 km x ±85 km
const MIN_RAIN_FOR_MOTION = 30;
const STALE_MIN = 40;         // older than this, MetMalaysia's feed has stalled
const RADAR_COOLDOWN_S = 2 * 3600;

/* Legend colours read off the GIF's own colour bar, lightest to heaviest.
   Ticks label 1, 5, 8, 10, 50, 80, 100 mm/h; the bands between 10 and 50
   are split at an unlabelled boundary taken to be 20 mm/h. */
const RAIN = 1, HEAVY = 2;
const LEGEND = [
  [0, 200, 0, RAIN], [0, 240, 0, RAIN], [255, 255, 0, RAIN], [255, 209, 0, RAIN], [247, 165, 0, RAIN],
  [247, 119, 0, HEAVY], [255, 38, 0, HEAVY], [220, 0, 0, HEAVY], [180, 0, 0, HEAVY],
  [255, 115, 255, HEAVY], [255, 55, 255, HEAVY], [210, 10, 210, HEAVY]
];
const NEAR2 = 64;   // squared RGB distance still counted as a legend colour

function classOf(r, g, b){
  for(const [lr, lg, lb, c] of LEGEND){
    const dr = r - lr, dg = g - lg, db = b - lb;
    if(dr * dr + dg * dg + db * db <= NEAR2) return c;
  }
  return 0;
}

/* ---- GIF ---- */

/* The frames of a GIF89a: where each one's image data starts, its
   rectangle, and its colour table. Nothing is decoded here. */
function gifFrames(b){
  if(!(b instanceof Uint8Array) || b.length < 13 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  const w = b[6] | b[7] << 8, h = b[8] | b[9] << 8, flags = b[10];
  let p = 13, gct = null;
  if(flags & 0x80){ const n = 2 << (flags & 7); gct = b.subarray(p, p + n * 3); p += n * 3; }
  const frames = [];
  let trans = -1;
  const skip = () => { while(p < b.length && b[p]) p += b[p] + 1; p++; };
  while(p < b.length){
    const c = b[p++];
    if(c === 0x21){
      const label = b[p++];
      if(label === 0xf9 && b[p] >= 4) trans = (b[p + 1] & 1) ? b[p + 4] : -1;
      skip();
    } else if(c === 0x2c){
      if(p + 9 > b.length) break;
      const x = b[p] | b[p + 1] << 8, y = b[p + 2] | b[p + 3] << 8;
      const fw = b[p + 4] | b[p + 5] << 8, fh = b[p + 6] | b[p + 7] << 8, f = b[p + 8];
      p += 9;
      let lct = null;
      if(f & 0x80){ const n = 2 << (f & 7); lct = b.subarray(p, p + n * 3); p += n * 3; }
      const minCode = b[p++];
      const start = p;
      skip();
      frames.push({x, y, w:fw, h:fh, interlaced:!!(f & 0x40), table:lct || gct, minCode, start, trans});
      trans = -1;
    } else break;   // trailer, or something this decoder does not know
  }
  return {w, h, frames};
}

/* Decode one frame straight into rain classes on a w×h canvas (`out`),
   rows past `maxRow` left alone. Interlaced frames are not used by this
   source and are refused rather than decoded wrongly. */
function decodeFrame(b, fr, out, W, H){
  if(fr.interlaced || !fr.table || fr.minCode < 2 || fr.minCode > 8) return false;
  const lut = new Uint8Array(256);
  for(let i = 0; i * 3 + 2 < fr.table.length && i < 256; i++)
    lut[i] = classOf(fr.table[i * 3], fr.table[i * 3 + 1], fr.table[i * 3 + 2]);
  if(fr.trans >= 0) lut[fr.trans] = 255;   // keep what is underneath

  const clear = 1 << fr.minCode, eoi = clear + 1;
  const prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  let size = fr.minCode + 1, mask = (1 << size) - 1, avail = clear + 2, old = -1, first = 0;
  let p = fr.start, blk = b[p++], bits = 0, datum = 0;
  const total = fr.w * fr.h;
  let n = 0, col = 0, row = fr.y, off = row * W + fr.x;
  const rowOk = () => row < H && row < MAP_H;
  while(n < total){
    while(bits < size){
      if(blk === 0){ blk = b[p++]; if(!blk) return n > 0; }
      if(p >= b.length) return n > 0;
      datum |= b[p++] << bits; bits += 8; blk--;
    }
    let code = datum & mask;
    datum >>>= size; bits -= size;
    if(code === clear){ size = fr.minCode + 1; mask = (1 << size) - 1; avail = clear + 2; old = -1; continue; }
    if(code === eoi) break;
    const inCode = code;
    let top = 0;
    if(old === -1){
      if(code >= clear) return n > 0;
      stack[top++] = code; first = code;
    } else {
      if(code > avail) return n > 0;
      if(code === avail){ stack[top++] = first; code = old; }
      while(code >= clear){ stack[top++] = suffix[code]; code = prefix[code]; }
      first = code; stack[top++] = code;
      if(avail < 4096){
        prefix[avail] = old; suffix[avail] = first; avail++;
        if((avail & mask) === 0 && avail < 4096){ size++; mask = (1 << size) - 1; }
      }
    }
    old = inCode;
    while(top){
      const v = lut[stack[--top]];
      const x = fr.x + col;
      if(v !== 255 && rowOk() && x < W) out[off] = x < MAP_W ? v : 0;
      off++; n++;
      if(++col === fr.w){ col = 0; row++; off = row * W + fr.x; if(row >= MAP_H) return true; }
    }
  }
  return true;
}

/* The two newest frames as rain-class grids, oldest first. */
function radarGrids(bytes){
  const g = gifFrames(bytes);
  if(!g || g.frames.length < 2 || g.w < MAP_W || g.h < MAP_H) return null;
  /* each frame here covers almost the whole map, but a frame only paints
     its own rectangle: the one before it is laid down first so the edges
     are not left empty, and the newest is painted over a copy of that */
  const n = g.frames.length;
  const prev = new Uint8Array(g.w * MAP_H);
  for(let i = Math.max(0, n - 3); i <= n - 2; i++) if(!decodeFrame(bytes, g.frames[i], prev, g.w, MAP_H)) return null;
  const cur = prev.slice();
  if(!decodeFrame(bytes, g.frames[n - 1], cur, g.w, MAP_H)) return null;
  return {w:g.w, prev, cur};
}

/* ---- geometry ---- */

const toPx = (lat, lon) => ({x:(lon - LON0) * PX_PER_LON, y:(LAT0 - lat) * PX_PER_LAT});
const inMap = (lat, lon) => { const p = toPx(lat, lon); return p.x >= 0 && p.x < MAP_W && p.y >= 0 && p.y < MAP_H; };
/* km per pixel at a latitude */
const kmX = lat => 111.32 * Math.cos(lat * Math.PI / 180) / PX_PER_LON;
const KM_Y = 110.57 / PX_PER_LAT;

/* The frame time of the newest frame. The GIF carries none in readable
   form; MetMalaysia publishes each ten-minute slot about eleven minutes
   late, so the newest frame is the ten-minute mark before the one the file
   was written in (07:51 written → 07:40 frame, checked on the live feed). */
function frameTime(lastModified){
  const t = Date.parse(lastModified || '');
  if(!Number.isFinite(t)) return null;
  return Math.floor(t / 600000) * 600000 - 600000;
}

/* The shift (px per frame) that best lines up the rain around a point. */
function motionAt(grids, cx, cy){
  const {w, prev, cur} = grids;
  const x0 = Math.max(MAX_SHIFT, Math.round(cx) - WIN_X), x1 = Math.min(MAP_W - MAX_SHIFT - 1, Math.round(cx) + WIN_X);
  const y0 = Math.max(MAX_SHIFT, Math.round(cy) - WIN_Y), y1 = Math.min(MAP_H - MAX_SHIFT - 1, Math.round(cy) + WIN_Y);
  if(x1 <= x0 || y1 <= y0) return null;
  let rain = 0;
  for(let y = y0; y <= y1; y++) for(let x = x0; x <= x1; x++) if(prev[y * w + x]) rain++;
  if(rain < MIN_RAIN_FOR_MOTION) return null;
  let best = -1, bx = 0, by = 0;
  for(let dy = -MAX_SHIFT; dy <= MAX_SHIFT; dy++){
    for(let dx = -MAX_SHIFT; dx <= MAX_SHIFT; dx++){
      let s = 0;
      for(let y = y0; y <= y1; y++){
        const r0 = y * w, r1 = (y + dy) * w + dx;
        for(let x = x0; x <= x1; x++) if(prev[r0 + x] && cur[r1 + x]) s++;
      }
      /* ties go to the smaller move: standing clutter must not invent speed */
      if(s > best || (s === best && dx * dx + dy * dy < bx * bx + by * by)){ best = s; bx = dx; by = dy; }
    }
  }
  return {dx:bx, dy:by, score:best / rain};
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/* compass point of (east, north) km from the plot */
function compass(e, n){
  const deg = (Math.atan2(e, n) * 180 / Math.PI + 360) % 360;
  return COMPASS[Math.round(deg / 45) % 8];
}

/* What the radar says about one plot: heavy rain already near it, or on
   its way and when (minutes after the frame), or nothing. */
function radarAt(grids, lat, lon){
  if(!grids || !inMap(lat, lon)) return null;
  const {w, cur} = grids;
  const c = toPx(lat, lon), kx = kmX(lat);
  const rx = Math.ceil(LOOK_KM / kx), ry = Math.ceil(LOOK_KM / KM_Y);
  const heavy = [];
  for(let y = Math.max(0, Math.round(c.y) - ry); y <= Math.min(MAP_H - 1, Math.round(c.y) + ry); y++){
    for(let x = Math.max(0, Math.round(c.x) - rx); x <= Math.min(MAP_W - 1, Math.round(c.x) + rx); x++){
      if(cur[y * w + x] !== HEAVY) continue;
      const e = (x - c.x) * kx, n = (c.y - y) * KM_Y;
      if(e * e + n * n <= LOOK_KM * LOOK_KM) heavy.push({e, n, d:Math.hypot(e, n)});
    }
  }
  const near = heavy.filter(h => h.d <= ALERT_KM);
  if(near.length >= MIN_PIXELS){
    const nearest = near.reduce((a, b) => (b.d < a.d ? b : a));
    return {kind:'near', km:Math.max(1, Math.round(nearest.d)), dir:compass(nearest.e, nearest.n)};
  }
  const mv = motionAt(grids, c.x, c.y);
  if(!mv || (!mv.dx && !mv.dy)) return null;
  /* km per minute, east and north */
  const ve = mv.dx * kx / 10, vn = -mv.dy * KM_Y / 10;
  const v2 = ve * ve + vn * vn;
  const arrivals = [];
  for(const h of heavy){
    /* earliest t ≥ 0 with |h + v t| ≤ ALERT_KM */
    const b = h.e * ve + h.n * vn, cc = h.d * h.d - ALERT_KM * ALERT_KM;
    const disc = b * b - v2 * cc;
    if(disc < 0) continue;
    const t = (-b - Math.sqrt(disc)) / v2;
    if(t >= 0 && t <= HORIZON_MIN) arrivals.push({t, h});
  }
  if(arrivals.length < MIN_PIXELS) return null;
  arrivals.sort((a, b) => a.t - b.t);
  /* the third-earliest, so a single pixel cannot set the time */
  const lead = arrivals[MIN_PIXELS - 1];
  return {kind:'coming', min:Math.round(lead.t), km:Math.round(lead.h.d), dir:compass(lead.h.e, lead.h.n),
          kmh:Math.round(Math.sqrt(v2) * 60)};
}

export {RADAR_URL, RADAR_COOLDOWN_S, STALE_MIN, ALERT_KM, HEAVY, RAIN, LEGEND, MAP_W, MAP_H,
        classOf, gifFrames, decodeFrame, radarGrids, toPx, inMap, frameTime, motionAt, compass, radarAt};
