/* Notification copy.

   The worker carries its own small string table rather than importing the
   app's: `T` lives inside app.js, which is not a module and would drag the
   whole front end into the worker bundle. Six strings duplicated beats that. */

const L = {
  zh:{
    morning:'早上', afternoon:'下午', evening:'晚上', night:'凌晨',
    rainProb:'降雨概率', rainSum:'降雨', tMax:'最高', tMin:'最低', wind:'风', gust:'阵风',
    sep:' · ', colon:'：', many:(w, n) => `${w} · ${n} 个地块`
  },
  en:{
    morning:'Morning', afternoon:'Afternoon', evening:'Evening', night:'Overnight',
    rainProb:'Rain', rainSum:'Rainfall', tMax:'High', tMin:'Low', wind:'Wind', gust:'Gusts',
    sep:' · ', colon:': ', many:(w, n) => `${w} · ${n} locations`
  },
  ms:{
    morning:'Pagi', afternoon:'Petang', evening:'Malam', night:'Dini hari',
    rainProb:'Hujan', rainSum:'Jumlah hujan', tMax:'Tertinggi', tMin:'Terendah', wind:'Angin', gust:'Tiupan',
    sep:' · ', colon:': ', many:(w, n) => `${w} · ${n} lokasi`
  }
};

const WIND_PER_KMH = {kmh:1, mph:0.621371, kn:0.539957, ms:0.277778};
const WIND_LBL = {kmh:'km/h', mph:'mph', kn:'kn', ms:'m/s'};

const num = v => typeof v === 'number' && Number.isFinite(v);
const round = (v, d) => { const p = Math.pow(10, d || 0); return Math.round(v * p) / p; };

/* every value is stored metric; the device tells us what it wants to read */
function fmt(key, v, units){
  if(!num(v)) return null;
  if(key === 'rainProb') return Math.round(v) + '%';
  if(key === 'rainSum')
    return units.rain === 'inch' ? round(v / 25.4, 2) + ' in' : round(v, 1) + ' mm';
  if(key === 'tMax' || key === 'tMin')
    return Math.round(units.temp === 'fahrenheit' ? v * 9 / 5 + 32 : v) + '°';
  const u = units.wind || 'kmh';
  return round(v * (WIND_PER_KMH[u] || 1), 0) + ' ' + WIND_LBL[u];
}

/* The figures for one plot in one window, or null when there is nothing
   worth saying — the caller sends nothing rather than a line of blanks. */
function partsFor(d, win, stats, hits, rules, u){
  const parts = [];
  if(win.mode === 'threshold'){
    (hits || []).forEach(k => {
      const shown = fmt(k, stats[k], u);
      if(shown === null) return;
      const limit = rules && rules[k] ? fmt(k, rules[k].v, u) : null;
      parts.push(d[k] + ' ' + shown + (limit ? ` (${k === 'tMin' ? '≤' : '≥'}${limit})` : ''));
    });
  } else {
    const rp = fmt('rainProb', stats.rainProb, u);
    if(rp !== null) parts.push(d.rainProb + ' ' + rp);
    const rs = fmt('rainSum', stats.rainSum, u);
    if(rs !== null && num(stats.rainSum) && stats.rainSum > 0) parts.push(rs);
    const hi = fmt('tMax', stats.tMax, u), lo = fmt('tMin', stats.tMin, u);
    if(hi !== null && lo !== null) parts.push(lo + '–' + hi);
    else if(hi !== null) parts.push(d.tMax + ' ' + hi);
    const w = fmt('wind', stats.wind, u);
    if(w !== null) parts.push(d.wind + ' ' + w);
  }
  return parts.length ? parts.join(d.sep) : null;
}

/* One notification per window, however many plots it covers.

   Each plot used to get its own push, and every push carried the same tag, so
   each one replaced the last and a ten-plot farm saw a single warning — the
   last plot's — with nine gone without a sound. One message per window fixes
   that, keeps noon to one buzz, and needs a tenth of the sends the worker is
   allowed per run. A single plot keeps the old shape, its name as the title,
   so nothing changes for anyone with one plot. */
function messageForWindow(lang, win, entries, rules, units){
  const d = L[lang] || L.en;
  const u = units || {};
  const lines = (entries || [])
    .map(e => ({name:e.name, text:partsFor(d, win, e.stats || {}, e.hits, rules, u)}))
    .filter(x => x.text);
  if(!lines.length) return null;
  const label = d[win.id] || win.id;
  if(lines.length === 1) return {title:lines[0].name, body:label + d.sep + lines[0].text};
  return {title:d.many(label, lines.length), body:lines.map(x => x.name + d.colon + x.text).join('\n')};
}

/* the single-plot form, kept for the tests that pin the wording */
function messageFor(lang, win, stats, hits, rules, units, blockName){
  return messageForWindow(lang, win, [{name:blockName, stats, hits}], rules, units);
}

export {messageFor, messageForWindow};
