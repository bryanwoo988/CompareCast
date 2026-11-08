/* Notification copy.

   The worker carries its own small string table rather than importing the
   app's: `T` lives inside app.js, which is not a module and would drag the
   whole front end into the worker bundle. Six strings duplicated beats that. */

const L = {
  zh:{
    morning:'早上', afternoon:'下午', evening:'晚上', night:'凌晨',
    rainProb:'降雨机率', rainSum:'降雨', tMax:'最高', tMin:'最低', wind:'风', gust:'阵风',
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

/* ---- storm alerts ---- */

const SL = {
  zh:{
    official:'⚡ MetMalaysia 雷暴警告', model:'⛈ 可能有雷雨', plots:n => `${n} 个地块`,
    today:'今天', tomorrow:'明天', yesterday:'昨天',
    nowUntil:t => `现在至 ${t} 有效`, span:(a, b) => `${a} – ${b} 有效`, issued:t => `（${t} 发布）`,
    agree:(c, n) => `${c}/${n} 个模式显示未来 3 小时有雷雨`, from:t => `，约 ${t} 起`,
    line:(name, c, n) => `${name}：${c}/${n} 个模式`, note:'模式预测，不是官方警告',
    sep:' · ', list:'、', open:'（', close:'）'
  },
  en:{
    official:'⚡ MetMalaysia thunderstorm warning', model:'⛈ Thunderstorms possible', plots:n => `${n} locations`,
    today:'today', tomorrow:'tomorrow', yesterday:'yesterday',
    nowUntil:t => `In effect now until ${t}`, span:(a, b) => `In effect ${a} – ${b}`, issued:t => ` (issued ${t})`,
    agree:(c, n) => `${c}/${n} models show thunderstorms in the next 3 hours`, from:t => `, from about ${t}`,
    line:(name, c, n) => `${name}: ${c}/${n} models`, note:'model forecast, not an official warning',
    sep:' · ', list:', ', open:' (', close:')'
  },
  ms:{
    official:'⚡ Amaran ribut petir MetMalaysia', model:'⛈ Kemungkinan ribut petir', plots:n => `${n} lokasi`,
    today:'hari ini', tomorrow:'esok', yesterday:'semalam',
    nowUntil:t => `Berkuat kuasa sekarang hingga ${t}`, span:(a, b) => `Berkuat kuasa ${a} – ${b}`, issued:t => ` (dikeluarkan ${t})`,
    agree:(c, n) => `${c}/${n} model menunjukkan ribut petir dalam 3 jam akan datang`, from:t => `, mulai kira-kira ${t}`,
    line:(name, c, n) => `${name}: ${c}/${n} model`, note:'ramalan model, bukan amaran rasmi',
    sep:' · ', list:', ', open:' (', close:')'
  }
};

const dayShift = (dayISO, n) => { const x = new Date(dayISO + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/* 'YYYY-MM-DDTHH:MM' as the reader would say it relative to now: the bare
   time when `bare` and it is today, otherwise with today / tomorrow /
   yesterday, or the date */
function when(d, t, nowDay, bare){
  const day = t.slice(0, 10), hm = t.slice(11, 16);
  if(day === nowDay) return bare ? hm : `${d.today} ${hm}`;
  if(day === dayShift(nowDay, 1)) return `${d.tomorrow} ${hm}`;
  if(day === dayShift(nowDay, -1)) return `${d.yesterday} ${hm}`;
  return `${day.slice(8, 10)}/${day.slice(5, 7)} ${hm}`;
}

/* "现在至 19:00 有效（16:20 发布）" or "17:00 – 19:00 有效（16:20 发布）":
   start and end both said, the start as "now" once it has passed, and the
   issue time so a late or long-lingering banner can be judged for freshness */
function validity(d, w, now){
  const nowDay = now.slice(0, 10);
  const started = !w.from || w.from <= now;
  /* a day word on one side means a day word on both, so "今天 22:00 – 明天 01:00"
     never reads as "22:00 – 明天 01:00" */
  const bare = w.to.slice(0, 10) === nowDay && (started || w.from.slice(0, 10) === nowDay);
  const span = started ? d.nowUntil(when(d, w.to, nowDay, bare))
                       : d.span(when(d, w.from, nowDay, bare), when(d, w.to, nowDay, bare));
  return span + (w.issued ? d.issued(when(d, w.issued, nowDay, true)) : '');
}

const placeOf = g => [g && g.district, g && g.state].filter(Boolean).join(', ');

/* One official warning, every matched plot in one message. `plots` are
   {id, name, geo}; `now` is Malaysian time, 'YYYY-MM-DDTHH:MM'. */
function stormOfficialMessage(lang, w, plots, now){
  const d = SL[lang] || SL.en;
  if(!w || !Array.isArray(plots) || !plots.length) return null;
  const span = validity(d, w, now);
  const ids = plots.map(p => p.id);
  if(plots.length === 1){
    const place = placeOf(plots[0].geo);
    return {title:d.official + d.sep + plots[0].name, body:(place ? place + d.sep : '') + span, ids};
  }
  const named = plots.map(p => { const pl = placeOf(p.geo); return p.name + (pl ? d.open + pl + d.close : ''); });
  return {title:d.official + d.sep + d.plots(plots.length), body:span + '\n' + named.join(d.list), ids,
          detail:plots.map(p => ({id:p.id, name:p.name, text:(placeOf(p.geo) ? placeOf(p.geo) + d.sep : '') + span}))};
}

/* The model heads-up for the plots that crossed the bar this hour. `plots`
   are {id, name, sig} with sig from modelSignal(). */
function stormModelMessage(lang, plots){
  const d = SL[lang] || SL.en;
  if(!Array.isArray(plots) || !plots.length) return null;
  const ids = plots.map(p => p.id);
  const from = s => (s.first ? d.from(s.first.slice(11, 16)) : '');
  if(plots.length === 1){
    const s = plots[0].sig;
    return {title:d.model + d.sep + plots[0].name, body:d.agree(s.count, s.total) + from(s) + d.sep + d.note, ids};
  }
  const sorted = plots.slice().sort((a, b) => b.sig.count - a.sig.count);
  return {title:d.model + d.sep + d.plots(plots.length),
          body:sorted.map(p => d.line(p.name, p.sig.count, p.sig.total) + from(p.sig)).join('\n') + '\n' + d.note, ids,
          detail:sorted.map(p => ({id:p.id, name:p.name, text:d.agree(p.sig.count, p.sig.total) + from(p.sig)}))};
}

/* ---- radar and flood alerts ---- */

const RL = {
  zh:{
    coming:'⛈ 强降雨接近', near:'⛈ 强降雨就在附近', many:'⛈ 强降雨',
    dir:{N:'北', NE:'东北', E:'东', SE:'东南', S:'南', SW:'西南', W:'西', NW:'西北'},
    comingBody:(dir, km, at, frame) => `雷达：${dir}方约 ${km} km 有强降雨（>20 mm/h），正往这边移动，约 ${at} 到（${frame} 雷达图）`,
    nearBody:(dir, km, frame) => `雷达：${dir}方约 ${km} km 有强降雨（>20 mm/h）（${frame} 雷达图）`,
    comingLine:(name, dir, km, at) => `${name}：${dir}方约 ${km} km，约 ${at} 到`,
    nearLine:(name, dir, km) => `${name}：${dir}方约 ${km} km，已在附近`,
    source:frame => `MetMalaysia 雷达 ${frame}`,
    river:sev => `🌊 河水达到${sev}水位`, rivers:'🌊 河水警报', sev:{Warning:'警告', Danger:'危险'},
    trend:{Rising:'上涨中', Receding:'下降中', 'No Change':'持平'},
    station:(st, km, level, sev, thr, trend, t) => `${st}（约 ${km} km）：${level} m，超过「${sev}」线 ${thr} m${trend ? '，' + trend : ''}（JPS ${t}）`,
    plotLine:(name, st, km, sev, level) => `${name}：${st}（约 ${km} km）${sev} ${level} m`,
    plots:n => `${n} 个地块`, sep:' · '
  },
  en:{
    coming:'⛈ Heavy rain approaching', near:'⛈ Heavy rain nearby', many:'⛈ Heavy rain',
    dir:{N:'north', NE:'northeast', E:'east', SE:'southeast', S:'south', SW:'southwest', W:'west', NW:'northwest'},
    comingBody:(dir, km, at, frame) => `Radar: heavy rain (>20 mm/h) about ${km} km to the ${dir}, moving this way, arriving about ${at} (radar ${frame})`,
    nearBody:(dir, km, frame) => `Radar: heavy rain (>20 mm/h) about ${km} km to the ${dir} (radar ${frame})`,
    comingLine:(name, dir, km, at) => `${name}: about ${km} km ${dir}, arriving about ${at}`,
    nearLine:(name, dir, km) => `${name}: about ${km} km ${dir}, already close`,
    source:frame => `MetMalaysia radar ${frame}`,
    river:sev => `🌊 River at ${sev} level`, rivers:'🌊 River alert', sev:{Warning:'Warning', Danger:'Danger'},
    trend:{Rising:'rising', Receding:'falling', 'No Change':'steady'},
    station:(st, km, level, sev, thr, trend, t) => `${st} (about ${km} km): ${level} m, above the ${sev} level of ${thr} m${trend ? ', ' + trend : ''} (JPS ${t})`,
    plotLine:(name, st, km, sev, level) => `${name}: ${st} (about ${km} km) ${sev} ${level} m`,
    plots:n => `${n} locations`, sep:' · '
  },
  ms:{
    coming:'⛈ Hujan lebat menghampiri', near:'⛈ Hujan lebat berhampiran', many:'⛈ Hujan lebat',
    dir:{N:'utara', NE:'timur laut', E:'timur', SE:'tenggara', S:'selatan', SW:'barat daya', W:'barat', NW:'barat laut'},
    comingBody:(dir, km, at, frame) => `Radar: hujan lebat (>20 mm/j) kira-kira ${km} km di ${dir}, bergerak ke arah ini, dijangka tiba kira-kira ${at} (radar ${frame})`,
    nearBody:(dir, km, frame) => `Radar: hujan lebat (>20 mm/j) kira-kira ${km} km di ${dir} (radar ${frame})`,
    comingLine:(name, dir, km, at) => `${name}: kira-kira ${km} km di ${dir}, tiba kira-kira ${at}`,
    nearLine:(name, dir, km) => `${name}: kira-kira ${km} km di ${dir}, sudah dekat`,
    source:frame => `Radar MetMalaysia ${frame}`,
    river:sev => `🌊 Paras sungai ${sev}`, rivers:'🌊 Amaran sungai', sev:{Warning:'Amaran', Danger:'Bahaya'},
    trend:{Rising:'sedang naik', Receding:'sedang turun', 'No Change':'tidak berubah'},
    station:(st, km, level, sev, thr, trend, t) => `${st} (kira-kira ${km} km): ${level} m, melepasi paras ${sev} ${thr} m${trend ? ', ' + trend : ''} (JPS ${t})`,
    plotLine:(name, st, km, sev, level) => `${name}: ${st} (kira-kira ${km} km) ${sev} ${level} m`,
    plots:n => `${n} lokasi`, sep:' · '
  }
};

/* Plots the radar flagged this run: {id, name, r, at} with r from
   radarAt() and `at` the arrival as 'HH:MM' for one on its way. `frame`
   is the radar frame time, 'HH:MM', so the reader can judge how fresh it is. */
function radarMessage(lang, plots, frame){
  const d = RL[lang] || RL.en;
  if(!Array.isArray(plots) || !plots.length) return null;
  const ids = plots.map(p => p.id);
  const dir = r => d.dir[r.dir] || r.dir;
  if(plots.length === 1){
    const p = plots[0], r = p.r;
    return r.kind === 'near'
      ? {title:d.near + d.sep + p.name, body:d.nearBody(dir(r), r.km, frame), ids}
      : {title:d.coming + d.sep + p.name, body:d.comingBody(dir(r), r.km, p.at, frame), ids};
  }
  const line = p => (p.r.kind === 'near' ? d.nearLine(p.name, dir(p.r), p.r.km) : d.comingLine(p.name, dir(p.r), p.r.km, p.at));
  return {title:d.many + d.sep + d.plots(plots.length), body:plots.map(line).join('\n') + '\n' + d.source(frame), ids,
          detail:plots.map(p => ({id:p.id, name:p.name, text:line(p)}))};
}

const fmtM = v => (Math.round(v * 100) / 100).toFixed(2);

/* Plots with a river station at Warning or Danger: {id, name, stations},
   stations from floodNear(), worst first. */
function floodMessage(lang, plots){
  const d = RL[lang] || RL.en;
  if(!Array.isArray(plots) || !plots.length) return null;
  const ids = plots.map(p => p.id);
  const sev = s => d.sev[s.severity] || s.severity;
  const full = s => d.station(s.name, Math.max(1, Math.round(s.km)), fmtM(s.level), sev(s), fmtM(s.thr), d.trend[s.trend] || '', s.time.slice(11, 16));
  if(plots.length === 1){
    const p = plots[0];
    return {title:d.river(sev(p.stations[0])) + d.sep + p.name, body:p.stations.slice(0, 3).map(full).join('\n'), ids};
  }
  const short = p => { const s = p.stations[0]; return d.plotLine(p.name, s.name, Math.max(1, Math.round(s.km)), sev(s), fmtM(s.level)); };
  return {title:d.rivers + d.sep + d.plots(plots.length), body:plots.map(short).join('\n'), ids,
          detail:plots.map(p => ({id:p.id, name:p.name, text:p.stations.slice(0, 3).map(full).join('\n')}))};
}

export {messageFor, messageForWindow, stormOfficialMessage, stormModelMessage, radarMessage, floodMessage};
