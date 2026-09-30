/* Notification copy.

   The worker carries its own small string table rather than importing the
   app's: `T` lives inside app.js, which is not a module and would drag the
   whole front end into the worker bundle. Six strings duplicated beats that. */

const L = {
  zh:{
    morning:'早上', afternoon:'下午', evening:'晚上', night:'凌晨',
    rainProb:'降雨概率', rainSum:'降雨', tMax:'最高', tMin:'最低', wind:'风', gust:'阵风',
    noData:'暂时查不到预报', sep:' · ', colon:'：', list:'、', many:(w, n) => `${w} · ${n} 个地块`,
    over:(w, n) => `${w} · ${n} 个地块超过门槛`, peak:p => `降雨最高 ${p}`
  },
  en:{
    morning:'Morning', afternoon:'Afternoon', evening:'Evening', night:'Overnight',
    rainProb:'Rain', rainSum:'Rainfall', tMax:'High', tMin:'Low', wind:'Wind', gust:'Gusts',
    noData:'forecast unavailable right now', sep:' · ', colon:': ', list:', ', many:(w, n) => `${w} · ${n} locations`,
    over:(w, n) => `${w} · ${n} locations over your limits`, peak:p => `rain up to ${p}`
  },
  ms:{
    morning:'Pagi', afternoon:'Petang', evening:'Malam', night:'Dini hari',
    rainProb:'Hujan', rainSum:'Jumlah hujan', tMax:'Tertinggi', tMin:'Terendah', wind:'Angin', gust:'Tiupan',
    noData:'ramalan tidak dapat diperoleh buat masa ini', sep:' · ', colon:': ', list:', ', many:(w, n) => `${w} · ${n} lokasi`,
    over:(w, n) => `${w} · ${n} lokasi melepasi had`, peak:p => `hujan sehingga ${p}`
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

/* A plot whose forecast could not be fetched on any attempt within the
   grace hour. Said out loud, because in threshold mode silence would read
   as "nothing to worry about". */
const NO_DATA = Object.freeze({});

/* The figures for one plot in one window, or null when there is nothing
   worth saying — the caller sends nothing rather than a line of blanks. */
function partsFor(d, win, stats, hits, rules, u){
  if(stats === NO_DATA) return d.noData;
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

const RULE_ORDER = ['rainProb', 'rainSum', 'tMax', 'tMin', 'wind', 'gust'];

/* a figure without its unit, for lists whose heading already carries it */
function bare(key, v, u){
  if(!num(v)) return null;
  if(key === 'rainProb' || key === 'tMax' || key === 'tMin') return fmt(key, v, u);
  if(key === 'rainSum') return String(u.rain === 'inch' ? round(v / 25.4, 2) : round(v, 1));
  return String(round(v * (WIND_PER_KMH[u.wind || 'kmh'] || 1), 0));
}
/* wettest first; plots without a rain chance keep their order, after them */
const byRain = (a, b) => (num(b.stats.rainProb) ? b.stats.rainProb : -1) - (num(a.stats.rainProb) ? a.stats.rainProb : -1);

/* One notification per window, however many plots it covers.

   Each plot used to get its own push, and every push carried the same tag, so
   each one replaced the last and a ten-plot farm saw a single warning — the
   last plot's — with nine gone without a sound. One message per window fixes
   that, keeps noon to one buzz, and needs a tenth of the sends the worker is
   allowed per run. A single plot keeps the old shape, its name as the title,
   so nothing changes for anyone with one plot.

   With many plots the body is compact rather than a line per plot: a banner
   shows about four lines, and eight plots as eight long lines meant only the
   first three or four were ever seen — in list order, so the wettest could be
   the one cut off. Threshold reminders group plots under each limit they
   crossed, several to a line, worst first; digests put the wettest first and
   the peak in the title. `detail` carries every plot's full line, worst
   first, for the page the app opens when the reminder is tapped. */
function messageForWindow(lang, win, entries, rules, units){
  const d = L[lang] || L.en;
  const u = units || {};
  const rows = (entries || [])
    .map(e => ({id:e.id, name:e.name, noData:!!e.noData, stats:e.stats || {}, hits:e.hits || [],
                text:partsFor(d, win, e.noData ? NO_DATA : (e.stats || {}), e.hits, rules, u)}))
    .filter(x => x.text);
  if(!rows.length) return null;
  const label = d[win.id] || win.id;
  /* ids of the plots actually mentioned, so a one-plot reminder can open
     that plot when tapped */
  const ids = rows.map(x => x.id).filter(Boolean);
  if(rows.length === 1) return {title:rows[0].name, body:label + d.sep + rows[0].text, ids};

  const live = rows.filter(x => !x.noData).sort(byRain), lost = rows.filter(x => x.noData);
  const lines = [];
  let title;
  if(win.mode === 'threshold'){
    RULE_ORDER.forEach(k => {
      const down = k === 'tMin';
      const hit = live.filter(x => x.hits.includes(k) && num(x.stats[k]))
        .sort((a, b) => down ? a.stats[k] - b.stats[k] : b.stats[k] - a.stats[k]);
      if(!hit.length) return;
      const limit = rules && rules[k] ? fmt(k, rules[k].v, u) : null;
      const head = d[k] + (limit ? ` ${down ? '≤' : '≥'}${limit}` : '');
      lines.push(head + d.colon + hit.map(x => `${x.name} ${bare(k, x.stats[k], u)}`).join(d.list));
    });
    title = d.over(label, rows.length);
  } else {
    live.forEach(x => {
      const s = x.stats, parts = [];
      const rp = fmt('rainProb', s.rainProb, u);
      if(rp !== null) parts.push(rp);
      if(num(s.rainSum) && s.rainSum > 0) parts.push(fmt('rainSum', s.rainSum, u));
      const hi = fmt('tMax', s.tMax, u), lo = fmt('tMin', s.tMin, u);
      if(hi !== null && lo !== null) parts.push(lo + '–' + hi);
      else if(hi !== null) parts.push(d.tMax + ' ' + hi);
      const w = fmt('wind', s.wind, u);
      if(w !== null) parts.push(w);
      lines.push(x.name + ' ' + parts.join(d.sep));
    });
    const top = live.find(x => num(x.stats.rainProb));
    title = d.many(label, rows.length) + (top ? d.sep + d.peak(fmt('rainProb', top.stats.rainProb, u)) : '');
  }
  if(lost.length) lines.push(d.noData + d.colon + lost.map(x => x.name).join(d.list));
  return {title, body:lines.join('\n'), ids,
          detail:[...live, ...lost].map(x => ({id:x.id, name:x.name, text:x.text}))};
}

/* the single-plot form, kept for the tests that pin the wording */
function messageFor(lang, win, stats, hits, rules, units, blockName){
  return messageForWindow(lang, win, [{name:blockName, stats, hits}], rules, units);
}

export {messageFor, messageForWindow};
