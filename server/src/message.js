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

/* ---- alert notifications: warnings, model, radar, rivers ----

   Short on purpose. A lock-screen banner shows a title cut at about 30
   characters and three or four lines of body, so: the location in the
   title, no source names (the wording tells an official warning from a
   model guess, and About lists the sources), districts without their
   states, and numbers rather than sentences. */

const AL = {
  zh:{
    storm:'⚡ 雷暴警告', model:'⛈ 可能有雷雨', rain:lv => `🌧 连续降雨（${lv}）`,
    rainLv:{1:'注意', 2:'恶劣天气', 3:'危险'},
    coming:'⛈ 强降雨接近', near:'⛈ 强降雨就在附近', heavy:'⛈ 强降雨',
    river:{Warning:'🌊 河水警告', Danger:'🌊 河水危险'}, rivers:'🌊 河水警报',
    plots:n => `${n} 个地块`, list:'、', sep:' · ',
    today:'今天', tomorrow:'明天', yesterday:'昨天', wd:['周日', '周一', '周二', '周三', '周四', '周五', '周六'], dated:(date, wd) => `${date} ${wd}`,
    until:t => `至 ${t}`, extended:t => `延长至 ${t}`, span:(a, b) => `${a} – ${b}`, issued:t => `（${t} 发布）`,
    agree:(c, n) => `${c}/${n} 个模式`, from:t => `约 ${t} 起`, guess:'模式推测',
    dir:{N:'北方', NE:'东北方', E:'东方', SE:'东南方', S:'南方', SW:'西南方', W:'西方', NW:'西北方'},
    far:(dir, km) => `${dir} ${km} km`, at:t => `约 ${t} 到`, radar:t => `雷达 ${t}`, here:'已在附近',
    sev:{Warning:'警告', Danger:'危险'}, trend:{Rising:'上涨中', Receding:'下降中', 'No Change':'持平'},
    named:(name, rest) => `${name}：${rest}`, level:(v, sev, thr) => `${v} m（${sev} ${thr} m）`
  },
  en:{
    storm:'⚡ Thunderstorm warning', model:'⛈ Thunderstorms possible', rain:lv => `🌧 Continuous rain (${lv})`,
    rainLv:{1:'Alert', 2:'Bad weather', 3:'Danger'},
    coming:'⛈ Heavy rain approaching', near:'⛈ Heavy rain nearby', heavy:'⛈ Heavy rain',
    river:{Warning:'🌊 River warning', Danger:'🌊 River danger'}, rivers:'🌊 River alert',
    plots:n => `${n} locations`, list:', ', sep:' · ',
    today:'today', tomorrow:'tomorrow', yesterday:'yesterday', wd:['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], dated:(date, wd) => `${wd} ${date}`,
    until:t => `Until ${t}`, extended:t => `Extended until ${t}`, span:(a, b) => `${a} – ${b}`, issued:t => ` (issued ${t})`,
    agree:(c, n) => `${c}/${n} models`, from:t => `from about ${t}`, guess:'model estimate',
    dir:{N:'north', NE:'northeast', E:'east', SE:'southeast', S:'south', SW:'southwest', W:'west', NW:'northwest'},
    far:(dir, km) => `${km} km ${dir}`, at:t => `arriving about ${t}`, radar:t => `radar ${t}`, here:'already close',
    sev:{Warning:'Warning', Danger:'Danger'}, trend:{Rising:'rising', Receding:'falling', 'No Change':'steady'},
    named:(name, rest) => `${name}: ${rest}`, level:(v, sev, thr) => `${v} m (${sev} ${thr} m)`
  },
  ms:{
    storm:'⚡ Amaran ribut petir', model:'⛈ Kemungkinan ribut petir', rain:lv => `🌧 Hujan berterusan (${lv})`,
    rainLv:{1:'Waspada', 2:'Buruk', 3:'Bahaya'},
    coming:'⛈ Hujan lebat menghampiri', near:'⛈ Hujan lebat berhampiran', heavy:'⛈ Hujan lebat',
    river:{Warning:'🌊 Amaran sungai', Danger:'🌊 Bahaya sungai'}, rivers:'🌊 Amaran sungai',
    plots:n => `${n} lokasi`, list:', ', sep:' · ',
    today:'hari ini', tomorrow:'esok', yesterday:'semalam', wd:['Ahd', 'Isn', 'Sel', 'Rab', 'Kha', 'Jum', 'Sab'], dated:(date, wd) => `${wd} ${date}`,
    until:t => `Hingga ${t}`, extended:t => `Dilanjutkan hingga ${t}`, span:(a, b) => `${a} – ${b}`, issued:t => ` (dikeluarkan ${t})`,
    agree:(c, n) => `${c}/${n} model`, from:t => `mulai kira-kira ${t}`, guess:'anggaran model',
    dir:{N:'utara', NE:'timur laut', E:'timur', SE:'tenggara', S:'selatan', SW:'barat daya', W:'barat', NW:'barat laut'},
    far:(dir, km) => `${km} km ${dir}`, at:t => `tiba kira-kira ${t}`, radar:t => `radar ${t}`, here:'sudah dekat',
    sev:{Warning:'Amaran', Danger:'Bahaya'}, trend:{Rising:'naik', Receding:'turun', 'No Change':'tidak berubah'},
    named:(name, rest) => `${name}: ${rest}`, level:(v, sev, thr) => `${v} m (${sev} ${thr} m)`
  }
};
const lang_ = lang => AL[lang] || AL.en;

/* The plots' names for a title, or how many there are when the names would
   push the alert's own words off the banner. */
const TITLE_NAMES_MAX = 28;
function titleFor(d, head, names){
  const joined = names.join(d.list);
  return head + d.sep + (names.length === 1 || joined.length <= TITLE_NAMES_MAX ? joined : d.plots(names.length));
}

const dayShift = (dayISO, n) => { const x = new Date(dayISO + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

/* 'YYYY-MM-DDTHH:MM' as the reader would say it relative to now: the bare
   time when `bare` and it is today, otherwise with today / tomorrow /
   yesterday, or the date. An end of 23:59 is a whole day: the date and the
   weekday, no time. */
function when(d, t, nowDay, bare){
  const day = t.slice(0, 10), hm = t.slice(11, 16);
  const allDay = hm === '23:59';
  if(day === nowDay) return allDay ? d.today : (bare ? hm : `${d.today} ${hm}`);
  if(day === dayShift(nowDay, 1)) return allDay ? d.tomorrow : `${d.tomorrow} ${hm}`;
  if(day === dayShift(nowDay, -1)) return `${d.yesterday} ${hm}`;
  const date = `${day.slice(8, 10)}/${day.slice(5, 7)}`;
  if(allDay) return d.dated(date, d.wd[new Date(day + 'T12:00:00Z').getUTCDay()]);
  return `${date} ${hm}`;
}

/* "至 21:00（17:15 发布）" or "17:00 – 19:00（16:20 发布）": both ends, the
   start left out once it has passed, and the issue time so a late or
   long-lingering banner can be judged for freshness */
function validity(d, w, now, extended){
  const nowDay = now.slice(0, 10);
  const started = !w.from || w.from <= now;
  /* a day word on one side means a day word on both, so "今天 22:00 – 明天 01:00"
     never reads as "22:00 – 明天 01:00" */
  const bare = w.to.slice(0, 10) === nowDay && (started || w.from.slice(0, 10) === nowDay);
  const end = when(d, w.to, nowDay, bare);
  const span = started ? (extended ? d.extended(end) : d.until(end)) : d.span(when(d, w.from, nowDay, bare), end);
  const out = span + (w.issued ? d.issued(when(d, w.issued, nowDay, true)) : '');
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/* the district, or the state where there is none (Kuala Lumpur) */
const placeOf = g => (g && (g.district || g.state)) || '';
const places = plots => [...new Set(plots.map(p => placeOf(p.geo)).filter(Boolean))];

/* One official warning — a thunderstorm warning, or a continuous rain
   warning when w.kind is 'rain' — every matched plot in one message.
   `plots` are {id, name, geo, extended}; `now` is Malaysian time. */
function warningMessage(lang, w, plots, now){
  const d = lang_(lang);
  if(!w || !Array.isArray(plots) || !plots.length) return null;
  const head = w.kind === 'rain' ? d.rain(d.rainLv[w.level] || d.rainLv[1]) : d.storm;
  const span = validity(d, w, now, plots.every(p => p.extended));
  const where = places(plots);
  const msg = {title:titleFor(d, head, plots.map(p => p.name)), body:span + (where.length ? '\n' + where.join(d.sep) : ''),
               ids:plots.map(p => p.id)};
  if(plots.length > 1) msg.detail = plots.map(p => ({id:p.id, name:p.name, text:(placeOf(p.geo) ? placeOf(p.geo) + d.sep : '') + span}));
  return msg;
}
/* the thunderstorm-only name the tests and the cron grew up with */
const stormOfficialMessage = (lang, w, plots, now) => warningMessage(lang, Object.assign({kind:'storm'}, w), plots, now);

/* The model heads-up for the plots that crossed the bar this hour. `plots`
   are {id, name, sig} with sig from modelSignal(). */
function stormModelMessage(lang, plots){
  const d = lang_(lang);
  if(!Array.isArray(plots) || !plots.length) return null;
  const sorted = plots.slice().sort((a, b) => b.sig.count - a.sig.count);
  const line = s => [d.agree(s.count, s.total), s.first ? d.from(s.first.slice(11, 16)) : ''].filter(Boolean).join(d.sep);
  const msg = {title:titleFor(d, d.model, sorted.map(p => p.name)), ids:sorted.map(p => p.id)};
  if(sorted.length === 1) msg.body = line(sorted[0].sig) + d.sep + d.guess;
  else {
    msg.body = sorted.map(p => d.named(p.name, line(p.sig))).join('\n') + '\n' + d.guess;
    msg.detail = sorted.map(p => ({id:p.id, name:p.name, text:line(p.sig)}));
  }
  return msg;
}

/* Plots the radar flagged this run: {id, name, r, at} with r from
   radarAt() and `at` the arrival as 'HH:MM' for one on its way. `frame`
   is the radar frame time, 'HH:MM', so the reader can judge how fresh it is. */
function radarMessage(lang, plots, frame){
  const d = lang_(lang);
  if(!Array.isArray(plots) || !plots.length) return null;
  const line = p => [d.far(d.dir[p.r.dir] || p.r.dir, p.r.km), p.r.kind === 'near' ? d.here : d.at(p.at)].join(d.sep);
  const allNear = plots.every(p => p.r.kind === 'near');
  const head = plots.length > 1 ? d.heavy : (allNear ? d.near : d.coming);
  const msg = {title:titleFor(d, head, plots.map(p => p.name)), ids:plots.map(p => p.id)};
  if(plots.length === 1) msg.body = (plots[0].r.kind === 'near' ? d.far(d.dir[plots[0].r.dir] || plots[0].r.dir, plots[0].r.km) : line(plots[0])) + d.sep + d.radar(frame);
  else {
    msg.body = plots.map(p => d.named(p.name, line(p))).join('\n') + '\n' + d.radar(frame);
    msg.detail = plots.map(p => ({id:p.id, name:p.name, text:line(p)}));
  }
  return msg;
}

const fmtM = v => (Math.round(v * 100) / 100).toFixed(2);
/* "Sg. Binjai di Pekan Meru" → "Sg. Binjai, Pekan Meru": the river, then
   where on it */
const stationName = s => String(s || '').replace(/\s+di\s+/i, ', ');

/* Plots with a river station at Warning or Danger: {id, name, stations},
   stations from floodNear(), worst first. */
function floodMessage(lang, plots){
  const d = lang_(lang);
  if(!Array.isArray(plots) || !plots.length) return null;
  const sev = s => d.sev[s.severity] || s.severity;
  const km = s => Math.max(1, Math.round(s.km));
  const full = s => `${stationName(s.name)}${d.sep}${km(s)} km\n` +
    [d.level(fmtM(s.level), sev(s), fmtM(s.thr)),
     d.trend[s.trend], s.time.slice(11, 16)].filter(Boolean).join(d.sep);
  const worst = plots.some(p => p.stations[0].severity === 'Danger') ? 'Danger' : 'Warning';
  const msg = {ids:plots.map(p => p.id)};
  if(plots.length === 1){
    msg.title = titleFor(d, d.river[plots[0].stations[0].severity] || d.rivers, [plots[0].name]);
    msg.body = plots[0].stations.slice(0, 2).map(full).join('\n');
  } else {
    msg.title = titleFor(d, d.river[worst] || d.rivers, plots.map(p => p.name));
    msg.body = plots.map(p => { const s = p.stations[0];
      return d.named(p.name, [stationName(s.name), `${km(s)} km`, `${sev(s)} ${fmtM(s.level)} m`].join(d.sep)); }).join('\n');
    msg.detail = plots.map(p => ({id:p.id, name:p.name, text:p.stations.slice(0, 3).map(full).join('\n')}));
  }
  return msg;
}

/* ---- a new version of the app ----
   `entries` are the release notes this phone has not been told about,
   newest first. The title is the newest version; the body is what changed,
   a few lines at most, then how to get it. A phone only updates when the
   app is opened, so this says the version is out, not that it is installed. */
const UL = {
  zh:{title:v => `🆕 新版本 ${v} 已推出`, tap:'点开即可更新'},
  en:{title:v => `🆕 Version ${v} is out`, tap:'Tap to update'},
  ms:{title:v => `🆕 Versi ${v} kini tersedia`, tap:'Ketik untuk kemas kini'}
};
const UPDATE_LINES = 3, UPDATE_LINE_MAX = 80;
const clip = (x, n) => (x.length > n ? x.slice(0, n - 1).trimEnd() + '…' : x);
function updateMessage(lang, entries){
  if(!Array.isArray(entries) || !entries.length) return null;
  const d = UL[lang] ? lang : 'en';
  const lines = [];
  entries.forEach(r => (Array.isArray(r[d]) ? r[d] : r.en || []).forEach(x => {
    if(typeof x === 'string' && lines.length < UPDATE_LINES) lines.push('• ' + clip(x, UPDATE_LINE_MAX));
  }));
  return {title:UL[d].title(entries[0].v), body:lines.concat(UL[d].tap).join('\n'), ids:[], kind:'app'};
}

export {updateMessage, messageFor, messageForWindow, warningMessage, stormOfficialMessage, stormModelMessage, radarMessage, floodMessage};
