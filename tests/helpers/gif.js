/* ---- a tiny GIF writer, so the decoder is tested on real GIF bytes ----
   Uncompressed LZW: a clear code every 254 codes keeps the code size at
   9 bits, which any decoder must accept. */
function gif(w, h, frames, palette){
  const out = [];
  const u16 = v => out.push(v & 255, v >> 8);
  out.push(...Buffer.from('GIF89a')); u16(w); u16(h); out.push(0x00, 0, 0);
  for(const f of frames){
    out.push(0x2c); u16(0); u16(0); u16(w); u16(h); out.push(0x87);   // local table, 256 entries
    for(let i = 0; i < 256; i++){ const c = palette[i] || [0, 0, 0]; out.push(c[0], c[1], c[2]); }
    out.push(8);
    const codes = [256];
    let n = 0;
    for(const v of f){ codes.push(v); if(++n === 254){ codes.push(256); n = 0; } }
    codes.push(257);
    const bytes = [];
    let acc = 0, bits = 0;
    for(const c of codes){ acc |= c << bits; bits += 9; while(bits >= 8){ bytes.push(acc & 255); acc >>>= 8; bits -= 8; } }
    if(bits) bytes.push(acc & 255);
    for(let i = 0; i < bytes.length; i += 255){ const s = bytes.slice(i, i + 255); out.push(s.length, ...s); }
    out.push(0);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}

module.exports = {gif};
