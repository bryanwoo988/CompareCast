/* Notification copy.

   The worker carries its own small string table rather than importing the
   app's: `T` lives inside app.js, which is not a module and would drag the
   whole front end into the worker bundle. Six strings duplicated beats that. */

const L = {
  zh:{
    morning:'早上', afternoon:'下午', evening:'晚上', night:'凌晨',
    rainProb:'降雨概率', rainSum:'降雨', tMax:'最高', tMin:'最低', wind:'风', gust:'阵风',
    sep:' · '
  },
  en:{
    morning:'Morning', afternoon:'Afternoon', evening:'Evening', night:'Overnight',
    rainProb:'Rain', rainSum:'Rainfall', tMax:'High', tMin:'Low', wind:'Wind', gust:'Gusts',
    sep:' · '
  },
  ms:{
    morning:'Pagi', afternoon:'Petang', evening:'Malam', night:'Dini hari',
    rainProb:'Hujan', rainSum:'Jumlah hujan', tMax:'Tertinggi', tMin:'Terendah', wind:'Angin', gust:'Tiupan',
    sep:' · '
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

/* returns null when there is nothing worth saying — the caller sends nothing
   rather than a notification full of blanks */
function messageFor(lang, win, stats, hits, rules, units, blockName){
  const d = L[lang] || L.en;
  const u = units || {};
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

  if(!parts.length) return null;
  return {title:blockName, body:(d[win.id] || win.id) + d.sep + parts.join(d.sep)};
}

export {messageFor};
