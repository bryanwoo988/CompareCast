/* Weather layers on the map: MetMalaysia's radar and JMA's Himawari
   satellite. Pure functions, kept out of app.js so they run under the tests.

   Radar — MetMalaysia's national composite, one GIF of six frames ten
   minutes apart (the last hour), the newest about eleven minutes behind.
   MetMalaysia does not allow other sites to read it, so the app asks the
   push worker for it (GET /radar), which passes it through unchanged. Each
   frame is decoded here and every pixel that is not a colour of the rain
   legend is made transparent, so only the rain lies over the map. The image
   is a plain lat/lon grid laid over the composite (it is drawn in Albers
   equal-area); checked against coastal landmarks it is out by 2–7 km.

   Satellite — JMA's Himawari-9 imagery as map tiles, straight from JMA,
   which allows it ("出典：気象庁ホームページ"). Full-disk tiles go to zoom 5,
   about 5 km a pixel; Leaflet enlarges them past that. Infrared (band 13)
   shows cloud day and night, cold high tops white; visible (band 3) only by
   day. */

var OVL_MAP_W = 1100, OVL_MAP_H = 570;
var OVL_LON0 = 96.925, OVL_LAT0 = 9.178, OVL_PX_LON = 45.323, OVL_PX_LAT = 53.471;
/* [[south, west], [north, east]] of the radar image */
var OVL_BOUNDS = [[OVL_LAT0 - OVL_MAP_H / OVL_PX_LAT, OVL_LON0], [OVL_LAT0, OVL_LON0 + OVL_MAP_W / OVL_PX_LON]];

/* The rain legend read off the GIF's own colour bar, light to heavy, with
   the rate at the top of each band (mm/h). The palest band (0.05 mm/h) is
   left out: it is white, the same as the image's background. */
var OVL_RAIN = [
  [0, 113, 226, 0.1], [5, 155, 255, 0.2], [52, 206, 236, 0.5], [0, 135, 0, 0.8], [0, 172, 0, 1],
  [0, 200, 0, 2], [0, 240, 0, 5], [255, 255, 0, 8], [255, 209, 0, 10], [247, 165, 0, 20],
  [247, 119, 0, 50], [255, 38, 0, 80], [220, 0, 0, 100], [180, 0, 0, 200],
  [255, 115, 255, 300], [255, 55, 255, 400], [210, 10, 210, 999]
];
var OVL_NEAR2 = 64;

/* palette entry → 1 + index into OVL_RAIN, or 0 for anything else */
function ovlRainIndex(r, g, b){
  for(var i = 0; i < OVL_RAIN.length; i++){
    var c = OVL_RAIN[i], dr = r - c[0], dg = g - c[1], db = b - c[2];
    if(dr * dr + dg * dg + db * db <= OVL_NEAR2) return i + 1;
  }
  return 0;
}

/* The frames of a GIF89a: where each one's image data starts, its
   rectangle and its colour table. Nothing is decoded here. */
function ovlGifFrames(b){
  if(!(b instanceof Uint8Array) || b.length < 13 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  var w = b[6] | b[7] << 8, h = b[8] | b[9] << 8, flags = b[10], p = 13, gct = null;
  if(flags & 0x80){ var n = 2 << (flags & 7); gct = b.subarray(p, p + n * 3); p += n * 3; }
  var frames = [], trans = -1;
  var skip = function(){ while(p < b.length && b[p]) p += b[p] + 1; p++; };
  while(p < b.length){
    var c = b[p++];
    if(c === 0x21){
      var label = b[p++];
      if(label === 0xf9 && b[p] >= 4) trans = (b[p + 1] & 1) ? b[p + 4] : -1;
      skip();
    } else if(c === 0x2c){
      if(p + 9 > b.length) break;
      var x = b[p] | b[p + 1] << 8, y = b[p + 2] | b[p + 3] << 8;
      var fw = b[p + 4] | b[p + 5] << 8, fh = b[p + 6] | b[p + 7] << 8, f = b[p + 8];
      p += 9;
      var lct = null;
      if(f & 0x80){ var m = 2 << (f & 7); lct = b.subarray(p, p + m * 3); p += m * 3; }
      var minCode = b[p++], start = p;
      skip();
      frames.push({x:x, y:y, w:fw, h:fh, interlaced:!!(f & 0x40), table:lct || gct, minCode:minCode, start:start, trans:trans});
      trans = -1;
    } else break;
  }
  return {w:w, h:h, frames:frames};
}

/* Decode one frame onto `out` (W wide, OVL_MAP_H tall) through `lut`
   (palette index → value; 255 leaves what is underneath). Columns past the
   map (the legend panel) are cleared. */
function ovlDecodeFrame(b, fr, out, W, lut){
  if(fr.interlaced || !fr.table || fr.minCode < 2 || fr.minCode > 8) return false;
  var clear = 1 << fr.minCode, eoi = clear + 1;
  var prefix = new Uint16Array(4096), suffix = new Uint8Array(4096), stack = new Uint8Array(4097);
  var size = fr.minCode + 1, mask = (1 << size) - 1, avail = clear + 2, old = -1, first = 0;
  var p = fr.start, blk = b[p++], bits = 0, datum = 0;
  var total = fr.w * fr.h, n = 0, col = 0, row = fr.y, off = row * W + fr.x;
  while(n < total){
    while(bits < size){
      if(blk === 0){ blk = b[p++]; if(!blk) return n > 0; }
      if(p >= b.length) return n > 0;
      datum |= b[p++] << bits; bits += 8; blk--;
    }
    var code = datum & mask;
    datum >>>= size; bits -= size;
    if(code === clear){ size = fr.minCode + 1; mask = (1 << size) - 1; avail = clear + 2; old = -1; continue; }
    if(code === eoi) break;
    var inCode = code, top = 0;
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
      var v = lut[stack[--top]], x = fr.x + col;
      if(v !== 255 && row < OVL_MAP_H && x < W) out[off] = x < OVL_MAP_W ? v : 0;
      off++; n++;
      if(++col === fr.w){ col = 0; row++; off = row * W + fr.x; if(row >= OVL_MAP_H) return true; }
    }
  }
  return true;
}

/* Every frame of the radar GIF, oldest first, as rain maps: one byte a
   pixel over the map area, 0 for no rain or 1 + its OVL_RAIN band. Each
   frame paints over the one before, as a GIF is shown. */
function radarFrameMaps(bytes){
  var g = ovlGifFrames(bytes);
  if(!g || !g.frames.length || g.w < OVL_MAP_W || g.h < OVL_MAP_H) return null;
  var canvas = new Uint8Array(g.w * OVL_MAP_H), out = [];
  for(var i = 0; i < g.frames.length; i++){
    var fr = g.frames[i], lut = new Uint8Array(256);
    for(var k = 0; k * 3 + 2 < (fr.table ? fr.table.length : 0) && k < 256; k++)
      lut[k] = ovlRainIndex(fr.table[k * 3], fr.table[k * 3 + 1], fr.table[k * 3 + 2]);
    if(fr.trans >= 0) lut[fr.trans] = 255;
    if(!ovlDecodeFrame(bytes, fr, canvas, g.w, lut)) return null;
    /* cropped to the map area, so the overlay's bounds are the map's */
    var m = new Uint8Array(OVL_MAP_W * OVL_MAP_H);
    for(var y = 0; y < OVL_MAP_H; y++) m.set(canvas.subarray(y * g.w, y * g.w + OVL_MAP_W), y * OVL_MAP_W);
    out.push(m);
  }
  return out;
}

/* RGBA for a rain map, rain at `alpha`, everything else clear */
function rainRgba(map, alpha){
  var px = new Uint8ClampedArray(map.length * 4);
  for(var i = 0; i < map.length; i++){
    var v = map[i];
    if(!v) continue;
    var c = OVL_RAIN[v - 1], j = i * 4;
    px[j] = c[0]; px[j + 1] = c[1]; px[j + 2] = c[2]; px[j + 3] = alpha;
  }
  return px;
}

/* When each of `n` frames was taken, oldest first, from the GIF's
   Last-Modified. MetMalaysia publishes each ten-minute slot about eleven
   minutes late, so the newest is the ten-minute mark before the one the
   file was written in (07:51 written → 07:40, checked on the live feed). */
function radarFrameTimes(lastModifiedMs, n){
  if(!isFinite(lastModifiedMs) || !(n > 0)) return [];
  var newest = Math.floor(lastModifiedMs / 600000) * 600000 - 600000, out = [];
  for(var i = n - 1; i >= 0; i--) out.push(newest - i * 600000);
  return out;
}

/* JMA's list of available satellite times → the ones within `hours` of the
   newest, oldest first, as {bt:'YYYYMMDDhhmmss', ms}. */
function satFrames(list, hours){
  var t = (Array.isArray(list) ? list : [])
    .map(function(x){ return x && /^\d{14}$/.test(String(x.basetime)) ? String(x.basetime) : null; })
    .filter(Boolean).sort();
  if(!t.length) return [];
  var ms = function(s){ return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12)); };
  var last = ms(t[t.length - 1]), cut = last - hours * 3600000;
  return t.filter(function(s, i){ return ms(s) >= cut && t.indexOf(s) === i; })
    .map(function(s){ return {bt:s, ms:ms(s)}; });
}

var SAT_TIMES_URL = 'https://www.jma.go.jp/bosai/himawari/data/satimg/targetTimes_fd.json';
var SAT_BANDS = {ir:'B13/TBB', vis:'B03/ALBD'};
var SAT_MAX_ZOOM = 5;
/* Leaflet tile template for one satellite time */
function satTileUrl(kind, bt){
  return 'https://www.jma.go.jp/bosai/himawari/data/satimg/' + bt + '/fd/' + bt + '/' + (SAT_BANDS[kind] || SAT_BANDS.ir) + '/{z}/{x}/{y}.jpg';
}

if(typeof module !== 'undefined') module.exports = {OVL_MAP_W, OVL_MAP_H, OVL_BOUNDS, OVL_RAIN, ovlRainIndex, ovlGifFrames,
  ovlDecodeFrame, radarFrameMaps, rainRgba, radarFrameTimes, satFrames, satTileUrl, SAT_TIMES_URL, SAT_MAX_ZOOM};
