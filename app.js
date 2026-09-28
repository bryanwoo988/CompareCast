/* =====================================================================
   天气预测 · Predict Weather · Ramalan Cuaca
   Data: Open-Meteo forecast, geocoding and ERA5 archive APIs (CORS-enabled)
   ===================================================================== */
'use strict';

/* ---------- 1. Models (Open-Meteo model ids) ---------- */
const MODELS = [
  {id:'best_match', short:'Best Match', color:'#38bdf8',
   full:{zh:'综合最佳',en:'Best Match',ms:'Padanan Terbaik'},
   org:{zh:'Open-Meteo 混合',en:'Blended · Open-Meteo',ms:'Gabungan · Open-Meteo'},
   ds:{zh:'Open-Meteo 自动挑选该地点分辨率最高的模式并拼接。',
       en:'Open-Meteo picks the highest-resolution model available for the spot and stitches them.',
       ms:'Open-Meteo pilih model resolusi tertinggi untuk lokasi itu dan gabungkannya.'}},
  {id:'ecmwf_ifs025', short:'ECMWF', color:'#a78bfa',
   full:{zh:'ECMWF IFS',en:'ECMWF IFS',ms:'ECMWF IFS'},
   org:{zh:'ECMWF · 欧洲',en:'ECMWF · Europe',ms:'ECMWF · Eropah'},
   ds:{zh:'欧洲中期天气预报中心。中期预报公认最准的全球模式，开放数据 0.25°。',
       en:'European Centre for Medium-Range Weather Forecasts. Widely regarded as the strongest medium-range global model. Open data at 0.25°.',
       ms:'Pusat Ramalan Cuaca Jangka Sederhana Eropah. Model global terkuat untuk jangka sederhana. Data terbuka 0.25°.'}},
  {id:'gfs_seamless', short:'GFS', color:'#60a5fa',
   full:{zh:'GFS 全球预报系统',en:'Global Forecast System',ms:'Global Forecast System'},
   org:{zh:'NOAA · 美国',en:'NOAA · United States',ms:'NOAA · Amerika Syarikat'},
   ds:{zh:'美国 NOAA 全球模式，约 13 km，每 6 小时更新一次。',
       en:'Global model from NOAA. About 13 km, updated every 6 hours.',
       ms:'Model global NOAA. Kira-kira 13 km, dikemas kini setiap 6 jam.'}},
  {id:'icon_seamless', short:'ICON', color:'#fbbf24',
   full:{zh:'ICON',en:'ICON',ms:'ICON'},
   org:{zh:'DWD · 德国',en:'DWD · Germany',ms:'DWD · Jerman'},
   ds:{zh:'德国气象局二十面体网格模式，约 11 km，欧洲表现强。',
       en:"DWD's icosahedral grid model, about 11 km. Strong over Europe.",
       ms:'Model grid ikosahedron DWD, kira-kira 11 km. Kuat di Eropah.'}},
  {id:'gem_seamless', short:'GEM', color:'#f87171',
   full:{zh:'GEM 全球环境多尺度模式',en:'Global Environmental Multiscale',ms:'Global Environmental Multiscale'},
   org:{zh:'ECCC · 加拿大',en:'ECCC · Canada',ms:'ECCC · Kanada'},
   ds:{zh:'加拿大环境部主力模式，约 15 km，北美表现强。',
       en:"Environment Canada's flagship model, about 15 km. Strong over North America.",
       ms:'Model utama Alam Sekitar Kanada, kira-kira 15 km. Kuat di Amerika Utara.'}},
  {id:'meteofrance_seamless', short:'ARPEGE', color:'#2dd4bf',
   full:{zh:'ARPEGE',en:'Météo-France ARPEGE',ms:'Météo-France ARPEGE'},
   org:{zh:'Météo-France · 法国',en:'Météo-France · France',ms:'Météo-France · Perancis'},
   ds:{zh:'法国气象局全球模式，欧洲加密网格。',
       en:'Global model from Météo-France, with a finer grid over Europe.',
       ms:'Model global Météo-France, grid lebih halus di Eropah.'}},
  {id:'jma_seamless', short:'JMA', color:'#f472b6',
   full:{zh:'日本气象厅 GSM',en:'Japan Meteorological Agency',ms:'Agensi Meteorologi Jepun'},
   org:{zh:'JMA · 日本',en:'JMA · Japan',ms:'JMA · Jepun'},
   ds:{zh:'日本气象厅全球模式，东亚与西太平洋表现好。',
       en:'Global model from JMA. Good over East Asia and the western Pacific.',
       ms:'Model global JMA. Baik di Asia Timur dan Pasifik barat.'}},
  {id:'ukmo_seamless', short:'UKMO', color:'#4ade80',
   full:{zh:'英国气象局统一模式',en:'Met Office Unified Model',ms:'Met Office Unified Model'},
   org:{zh:'Met Office · 英国',en:'Met Office · United Kingdom',ms:'Met Office · UK'},
   ds:{zh:'英国气象局全球模式，约 10 km。',
       en:'UK Met Office global model, about 10 km.',
       ms:'Model global Met Office UK, kira-kira 10 km.'}}
];
const M = id => MODELS.find(m => m.id === id) || MODELS[0];

/* ---------- 2. Language ---------- */
const T = {
zh:{
  app:'天气预测', subSaved:'我的地点', subMap:'天气地图', tabSaved:'地点', tabMap:'地图',
  addLoc:'添加地点', done:'完成', settings:'设置', info:'使用说明', loading:'读取中…',
  empty:'还没有地点。<br>加一个园区或田块，开始比对各家预报。',
  mGps:'当前位置', mSearch:'搜索城市', mManual:'经纬度',
  gpsDesc:'用手机 GPS 读取你此刻站的位置，误差通常在 10–50 米内。在田里直接取点最准。',
  gpsBtn:'读取我的位置', gpsWait:'正在读取…',
  gpsDenied:'定位被拒绝。请到手机设置里允许本页使用位置。',
  gpsFail:'读不到位置。到室外空旷处再试一次。',
  gpsInsecure:'定位需要 HTTPS。用 https:// 打开这个网址再试。',
  myLoc:'我的位置', searchPh:'搜索城市、城镇或地区', searchEmpty:'输入名字，搜全世界的城市',
  searching:'搜索中…', noResult:'找不到这个地方。换个写法或改用经纬度。',
  searchHint:'城市搜索会落在市镇中心点。园区离市镇较远时，建议改用 GPS 或手动经纬度。',
  fName:'名称', fLat:'纬度 Latitude', fLon:'经度 Longitude', saveLoc:'保存地点',
  namePh:'例如：A 区 12 号地块',
  manualHint:'用十进制度数，南纬和西经加负号。纬度 −90 至 90，经度 −180 至 180。',
  errLat:'纬度要在 −90 到 90 之间。', errLon:'经度要在 −180 到 180 之间。',
  errNum:'请输入数字。', dupLoc:'这个位置已经加过了。',
  bmSat:'卫星', bmStreet:'街道', bmDark:'暗色',
  mapHint:'点地图任意位置即可添加为地点', mapAdd:'添加此处', locsUnit:'个地点',
  tForecast:'预报', tCompare:'对比', tAccuracy:'准度',
  pickModel:'预报模式', pickModelD:'选择由哪个模式驱动这个地点。',
  unavail:'这个地点没有该模式数据', avail:'可用',
  now:'当前实况', feels:'体感', humid:'湿度', wind:'风速', gust:'阵风', press:'气压',
  rainToday:'今日降雨', rainChance:'降雨概率', uv:'紫外线', dir:'风向', sunrise:'日出', sunset:'日落',
  probSrc:'降雨概率与紫外线来自 Best Match 混合模式，因为有几个模式不输出这两项。',
  next24:'未来 24 小时', days10:'未来 10 天', today:'今天', now2:'现在',
  hourly:'逐小时', daily:'逐日', h48:'未来 48 小时', d10:'10 天',
  vTemp:'气温', vRain:'降雨', vWind:'风速', hiMark:'高', loMark:'低',
  live:'实况 · 当前条件', scrub:'按住图表左右拖动',
  srcModels:'各模式数值', spreadT:'模式分歧',
  spreadTxt:(a,b,ut,ur)=>`各家模式对未来 24 小时气温的最大差距是 ${a} ${ut}，24 小时累计降雨的差距是 ${b} ${ur}。差距越大，预报越不确定。`,
  accT:'准度核对', accSub:'对照 ERA5 再分析',
  accLoading:'正在比对各模式与 ERA5 再分析…',
  accWindow:(a,b,n)=>`核对区间：${a} 至 ${b}（UTC），共 ${n} 个整点`,
  accMethodEra:'方法：取上面这段区间，各模式的逐小时气温与 ECMWF ERA5 再分析同一时刻的气温相比，算平均绝对误差（MAE）。ERA5 同化了全球地面站、探空气球和卫星观测，是气象界通用的对照基准。数值越小，这段时间在这个位置贴得越近。',
  accEraNote:'三点提醒：一、ERA5 本身也是模式产品（同化观测后重算的），不是你园区的实测值，它是公认基准但不能代替雨量筒。二、这是对过去几天的核对，样本小，只能当参考，不是模式排名。三、榜单里没有 Best Match：它不是一个预报模式，在历史时段 Open-Meteo 直接给的就是再分析数据（也就是这里的对照基准），放进来会永远是 0.00，没有意义。',
  accNone:'ERA5 对照数据读不到（再分析有几天的滞后，或接口暂时无回应），所以这里改用「与多模式共识的偏离」来排序。这不是准确度评分。',
  accCons:'与共识的偏离', accConsD:'每个模式跟所有模式平均值的平均差距（未来 48 小时气温）。偏离小只代表跟大多数一致，不代表更准。',
  accBest:'最贴近实测', accMae:'平均绝对误差',
  editName:'重命名', rename:'新名称', rmLoc:'删除这个地点', failLoad:'读不到预报。检查网络后重试。',
  retry:'重试', offline:'目前离线，显示的是上次读到的数据。', noNet:'目前离线，连上网络后再试。',
  unitSection:'单位', tempU:'温度', windU:'风速', rainU:'降雨',
  defModel:'新地点默认模式', defModelD:'加新地点时先用这个模式。之后每个地点都能单独改。',
  cmpSection:'对比哪些模式', cmpD:'勾选的模式会出现在每个地点的对比图和准度核对里。',
  about:'关于', version:'版本 2.0', dataSrc:'数据来源', savedOk:'已保存', deleted:'已删除'
},
en:{
  app:'Predict Weather', subSaved:'My Locations', subMap:'Weather Map', tabSaved:'Saved', tabMap:'Map',
  addLoc:'Add Location', done:'Done', settings:'Settings', info:'How it works', loading:'Loading…',
  empty:'No locations yet.<br>Add a field or estate to start comparing forecasts.',
  mGps:'Current', mSearch:'Search city', mManual:'Coordinates',
  gpsDesc:'Reads where your phone is right now, usually within 10–50 m. Most accurate way to pin a field.',
  gpsBtn:'Read my location', gpsWait:'Reading…',
  gpsDenied:'Location was blocked. Allow this page to use location in your phone settings.',
  gpsFail:'Could not get a fix. Step outside and try again.',
  gpsInsecure:'Location needs HTTPS. Open this page over https:// and try again.',
  myLoc:'My location', searchPh:'Search city, town, or area', searchEmpty:'Find any city in the world',
  searching:'Searching…', noResult:'No match. Try another spelling, or enter coordinates.',
  searchHint:'City search lands on the town centre. If your estate is far from town, use GPS or coordinates instead.',
  fName:'Name', fLat:'Latitude', fLon:'Longitude', saveLoc:'Save location',
  namePh:'e.g. Block 12, Zone A',
  manualHint:'Decimal degrees. Minus sign for south and west. Latitude −90 to 90, longitude −180 to 180.',
  errLat:'Latitude must be between −90 and 90.', errLon:'Longitude must be between −180 and 180.',
  errNum:'Enter a number.', dupLoc:'That spot is already saved.',
  bmSat:'Satellite', bmStreet:'Street', bmDark:'Dark',
  mapHint:'Tap anywhere on the map to add that spot', mapAdd:'Add this spot', locsUnit:'locations',
  tForecast:'Forecast', tCompare:'Compare', tAccuracy:'Accuracy',
  pickModel:'Forecast model', pickModelD:'Choose which model powers this location.',
  unavail:'No data for this location', avail:'Available',
  now:'Right now', feels:'Feels like', humid:'Humidity', wind:'Wind', gust:'Gusts', press:'Pressure',
  rainToday:'Rain today', rainChance:'Rain chance', uv:'UV index', dir:'Direction', sunrise:'Sunrise', sunset:'Sunset',
  probSrc:'Rain chance and UV come from the blended Best Match model, because several models do not produce them.',
  next24:'Next 24 hours', days10:'Next 10 days', today:'Today', now2:'Now',
  hourly:'Hourly', daily:'Daily', h48:'next 48 h', d10:'10 days',
  vTemp:'Temperature', vRain:'Precipitation', vWind:'Wind', hiMark:'H', loMark:'L',
  live:'Live · current conditions', scrub:'Drag chart to scrub',
  srcModels:'Source models', spreadT:'Model spread',
  spreadTxt:(a,b,ut,ur)=>`Over the next 24 hours the models differ by up to ${a} ${ut} on temperature and ${b} ${ur} on total rainfall. A wider spread means a less certain forecast.`,
  accT:'Accuracy check', accSub:'against ERA5 reanalysis',
  accLoading:'Comparing each model against ERA5 reanalysis…',
  accWindow:(a,b,n)=>`Window checked: ${a} to ${b} (UTC), ${n} hourly points`,
  accMethodEra:'Method: over that window, each model\'s hourly temperature is compared with ECMWF ERA5 reanalysis at the same hour. The figure is mean absolute error (MAE). ERA5 assimilates surface stations, radiosondes and satellites worldwide and is the standard reference in meteorology. Lower means closer over that period at this spot.',
  accEraNote:'Three cautions. ERA5 is itself a model product, recomputed after assimilating observations, not a measurement at your plot: it is an accepted reference but no substitute for a rain gauge. And this checks a few past days on a small sample, so treat it as indicative, not a model ranking. Best Match is left out: it is not a forecast model, and over past dates Open-Meteo serves the reanalysis for it — the very series used as truth here — so it would always score 0.00.',
  accNone:'ERA5 data could not be read (reanalysis lags by a few days, or the endpoint did not respond), so this list falls back to how far each model sits from the multi-model consensus. That is agreement, not accuracy.',
  accCons:'Distance from consensus', accConsD:'Average gap between each model and the mean of all models, over the next 48 hours of temperature. A small gap only means it agrees with the majority.',
  accBest:'Closest to observed', accMae:'Mean absolute error',
  editName:'Rename', rename:'New name', rmLoc:'Remove this location', failLoad:'Could not load the forecast. Check your connection and try again.',
  retry:'Retry', offline:'Offline — showing the last data that loaded.', noNet:'You are offline. Try again once you are back online.',
  unitSection:'Units', tempU:'Temperature', windU:'Wind', rainU:'Precipitation',
  defModel:'Default model for new locations', defModelD:'Used when you add a location. You can still change it per location.',
  cmpSection:'Models to compare', cmpD:'Ticked models appear in the compare chart and the accuracy check.',
  about:'About', version:'Version 2.0', dataSrc:'Data sources', savedOk:'Saved', deleted:'Removed'
},
ms:{
  app:'Ramalan Cuaca', subSaved:'Lokasi Saya', subMap:'Peta Cuaca', tabSaved:'Lokasi', tabMap:'Peta',
  addLoc:'Tambah Lokasi', done:'Selesai', settings:'Tetapan', info:'Panduan', loading:'Memuatkan…',
  empty:'Belum ada lokasi.<br>Tambah ladang atau petak untuk mula banding ramalan.',
  mGps:'Lokasi semasa', mSearch:'Cari bandar', mManual:'Koordinat',
  gpsDesc:'Baca kedudukan telefon anda sekarang, biasanya tepat 10–50 m. Cara paling tepat untuk tanda petak ladang.',
  gpsBtn:'Baca lokasi saya', gpsWait:'Sedang membaca…',
  gpsDenied:'Lokasi disekat. Benarkan halaman ini guna lokasi dalam tetapan telefon.',
  gpsFail:'Tidak dapat kedudukan. Keluar ke kawasan lapang dan cuba lagi.',
  gpsInsecure:'Lokasi perlukan HTTPS. Buka halaman ini melalui https:// dan cuba lagi.',
  myLoc:'Lokasi saya', searchPh:'Cari bandar, pekan atau kawasan', searchEmpty:'Cari mana-mana bandar di dunia',
  searching:'Mencari…', noResult:'Tiada padanan. Cuba ejaan lain atau masukkan koordinat.',
  searchHint:'Carian bandar jatuh di pusat pekan. Jika ladang jauh dari pekan, guna GPS atau koordinat.',
  fName:'Nama', fLat:'Latitud', fLon:'Longitud', saveLoc:'Simpan lokasi',
  namePh:'cth: Blok 12, Zon A',
  manualHint:'Darjah perpuluhan. Tanda tolak untuk selatan dan barat. Latitud −90 hingga 90, longitud −180 hingga 180.',
  errLat:'Latitud mesti antara −90 dan 90.', errLon:'Longitud mesti antara −180 dan 180.',
  errNum:'Masukkan nombor.', dupLoc:'Tempat itu sudah disimpan.',
  bmSat:'Satelit', bmStreet:'Jalan', bmDark:'Gelap',
  mapHint:'Ketik mana-mana tempat pada peta untuk tambah', mapAdd:'Tambah tempat ini', locsUnit:'lokasi',
  tForecast:'Ramalan', tCompare:'Banding', tAccuracy:'Ketepatan',
  pickModel:'Model ramalan', pickModelD:'Pilih model yang menjana lokasi ini.',
  unavail:'Tiada data untuk lokasi ini', avail:'Ada',
  now:'Sekarang', feels:'Terasa', humid:'Kelembapan', wind:'Angin', gust:'Tiupan', press:'Tekanan',
  rainToday:'Hujan hari ini', rainChance:'Peluang hujan', uv:'Indeks UV', dir:'Arah', sunrise:'Matahari naik', sunset:'Matahari turun',
  probSrc:'Peluang hujan dan UV datang dari model gabungan Best Match, kerana beberapa model tidak mengeluarkannya.',
  next24:'24 jam akan datang', days10:'10 hari akan datang', today:'Hari ini', now2:'Sekarang',
  hourly:'Setiap jam', daily:'Harian', h48:'48 jam', d10:'10 hari',
  vTemp:'Suhu', vRain:'Hujan', vWind:'Angin', hiMark:'T', loMark:'R',
  live:'Langsung · keadaan semasa', scrub:'Seret carta untuk baca',
  srcModels:'Nilai setiap model', spreadT:'Jurang model',
  spreadTxt:(a,b,ut,ur)=>`Untuk 24 jam akan datang, model berbeza sehingga ${a} ${ut} pada suhu dan ${b} ${ur} pada jumlah hujan. Jurang lebih besar bermakna ramalan kurang pasti.`,
  accT:'Semakan ketepatan', accSub:'berbanding analisis semula ERA5',
  accLoading:'Membandingkan setiap model dengan analisis semula ERA5…',
  accWindow:(a,b,n)=>`Tempoh disemak: ${a} hingga ${b} (UTC), ${n} titik jam`,
  accMethodEra:'Kaedah: dalam tempoh itu, suhu setiap jam bagi setiap model dibandingkan dengan ERA5 ECMWF pada jam yang sama. Angka ini ialah ralat mutlak purata (MAE). ERA5 mengasimilasi stesen permukaan, belon radiosonde dan satelit di seluruh dunia, dan menjadi rujukan piawai dalam meteorologi. Lebih kecil bermakna lebih hampir dalam tempoh itu.',
  accEraNote:'Tiga peringatan. ERA5 sendiri produk model, dikira semula selepas mengasimilasi cerapan, bukan ukuran di petak anda: ia rujukan yang diterima tetapi bukan ganti tolok hujan. Dan ini menyemak beberapa hari lepas dengan sampel kecil, jadi anggap sebagai panduan, bukan kedudukan model. Best Match tidak disenaraikan: ia bukan model ramalan, dan bagi tarikh lampau Open-Meteo memberi data analisis semula untuknya — siri yang sama digunakan sebagai rujukan di sini — jadi ia akan sentiasa mendapat 0.00.',
  accNone:'Data ERA5 tidak dapat dibaca (analisis semula lewat beberapa hari, atau titik akhir tidak menjawab), jadi senarai ini beralih kepada jarak setiap model dari konsensus. Itu persetujuan, bukan ketepatan.',
  accCons:'Jarak dari konsensus', accConsD:'Purata beza antara setiap model dengan purata semua model, untuk suhu 48 jam akan datang. Jurang kecil hanya bermakna ia sepakat dengan majoriti.',
  accBest:'Paling hampir cerapan', accMae:'Ralat mutlak purata',
  editName:'Tukar nama', rename:'Nama baharu', rmLoc:'Buang lokasi ini', failLoad:'Gagal memuatkan ramalan. Semak sambungan dan cuba lagi.',
  retry:'Cuba lagi', offline:'Di luar talian — data terakhir dipaparkan.', noNet:'Anda di luar talian. Cuba lagi bila ada sambungan.',
  unitSection:'Unit', tempU:'Suhu', windU:'Angin', rainU:'Hujan',
  defModel:'Model asal untuk lokasi baharu', defModelD:'Digunakan bila anda tambah lokasi. Boleh tukar untuk setiap lokasi.',
  cmpSection:'Model untuk dibanding', cmpD:'Model bertanda muncul dalam carta banding dan semakan ketepatan.',
  about:'Perihal', version:'Versi 2.0', dataSrc:'Sumber data', savedOk:'Disimpan', deleted:'Dibuang'
}};

/* ---------- 3. Weather codes + icons ---------- */
const WMO = {
  0:{zh:'晴',en:'Clear',ms:'Cerah',i:'sun',s:'clear'},
  1:{zh:'大致晴朗',en:'Mostly clear',ms:'Cerah berawan',i:'sun',s:'clear'},
  2:{zh:'局部多云',en:'Partly cloudy',ms:'Sebahagian berawan',i:'part',s:'cloud'},
  3:{zh:'阴',en:'Overcast',ms:'Mendung',i:'cloud',s:'cloud'},
  45:{zh:'雾',en:'Fog',ms:'Kabus',i:'fog',s:'cloud'},
  48:{zh:'冻雾',en:'Rime fog',ms:'Kabus beku',i:'fog',s:'cloud'},
  51:{zh:'小毛毛雨',en:'Light drizzle',ms:'Gerimis ringan',i:'driz',s:'rain'},
  53:{zh:'毛毛雨',en:'Drizzle',ms:'Gerimis',i:'driz',s:'rain'},
  55:{zh:'大毛毛雨',en:'Heavy drizzle',ms:'Gerimis lebat',i:'driz',s:'rain'},
  56:{zh:'冻毛毛雨',en:'Freezing drizzle',ms:'Gerimis beku',i:'driz',s:'rain'},
  57:{zh:'冻毛毛雨',en:'Freezing drizzle',ms:'Gerimis beku',i:'driz',s:'rain'},
  61:{zh:'小雨',en:'Light rain',ms:'Hujan ringan',i:'rain',s:'rain'},
  63:{zh:'中雨',en:'Rain',ms:'Hujan',i:'rain',s:'rain'},
  65:{zh:'大雨',en:'Heavy rain',ms:'Hujan lebat',i:'rain',s:'rain'},
  66:{zh:'冻雨',en:'Freezing rain',ms:'Hujan beku',i:'rain',s:'rain'},
  67:{zh:'冻雨',en:'Freezing rain',ms:'Hujan beku',i:'rain',s:'rain'},
  71:{zh:'小雪',en:'Light snow',ms:'Salji ringan',i:'snow',s:'rain'},
  73:{zh:'雪',en:'Snow',ms:'Salji',i:'snow',s:'rain'},
  75:{zh:'大雪',en:'Heavy snow',ms:'Salji lebat',i:'snow',s:'rain'},
  77:{zh:'雪粒',en:'Snow grains',ms:'Butir salji',i:'snow',s:'rain'},
  80:{zh:'阵雨',en:'Rain showers',ms:'Hujan renyai',i:'rain',s:'rain'},
  81:{zh:'中阵雨',en:'Rain showers',ms:'Hujan renyai',i:'rain',s:'rain'},
  82:{zh:'强阵雨',en:'Violent showers',ms:'Hujan lebat',i:'rain',s:'rain'},
  85:{zh:'阵雪',en:'Snow showers',ms:'Salji renyai',i:'snow',s:'rain'},
  86:{zh:'强阵雪',en:'Snow showers',ms:'Salji renyai',i:'snow',s:'rain'},
  95:{zh:'雷雨',en:'Thunderstorm',ms:'Ribut petir',i:'storm',s:'rain'},
  96:{zh:'雷雨伴冰雹',en:'Thunderstorm, hail',ms:'Ribut petir, hujan batu',i:'storm',s:'rain'},
  99:{zh:'强雷雨伴冰雹',en:'Severe thunderstorm',ms:'Ribut petir kuat',i:'storm',s:'rain'}
};
const wmo = c => WMO[c] || {zh:'—',en:'—',ms:'—',i:'cloud',s:'cloud'};

const _iconCache = {};
function icon(kind, size){
  const ck = kind + '@' + size;
  if(_iconCache[ck] !== undefined) return _iconCache[ck];
  return (_iconCache[ck] = buildIcon(kind, size));
}
function buildIcon(kind, size){
  const s = size || 64, S = `width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round"`;
  const cl = '<path d="M18 44h26a9 9 0 0 0 .6-18A13 13 0 0 0 20 28a8 8 0 0 0-2 15.8z" fill="rgba(255,255,255,.92)"/>';
  switch(kind){
    case 'sun': return `<svg ${S}><circle cx="32" cy="32" r="12" fill="#ffd76e"/><g stroke="#ffd76e" stroke-width="3.4"><path d="M32 9v6M32 49v6M9 32h6M49 32h6M16 16l4 4M44 44l4 4M48 16l-4 4M20 44l-4 4"/></g></svg>`;
    case 'moon': return `<svg ${S}><path d="M40 8a24 24 0 1 0 16 44A26 26 0 0 1 40 8z" fill="#e9eeff"/></svg>`;
    case 'part': return `<svg ${S}><circle cx="24" cy="24" r="9.5" fill="#ffd76e"/><g stroke="#ffd76e" stroke-width="3"><path d="M24 6v5M6 24h5M37 22h5M11 11l3.5 3.5M37 11l-3.5 3.5"/></g>${cl}</svg>`;
    case 'partn': return `<svg ${S}><path d="M32 8a16 16 0 1 0 10 28A17 17 0 0 1 32 8z" fill="#e9eeff"/>${cl}</svg>`;
    case 'cloud': return `<svg ${S}>${cl}</svg>`;
    case 'fog': return `<svg ${S}>${cl}<g stroke="rgba(255,255,255,.75)" stroke-width="3.4"><path d="M14 51h36M20 58h26"/></g></svg>`;
    case 'driz': return `<svg ${S}>${cl}<g stroke="#9fd4ff" stroke-width="3.4"><path d="M24 50v4M34 50v5M44 50v4"/></g></svg>`;
    case 'rain': return `<svg ${S}>${cl}<g stroke="#7cc4ff" stroke-width="3.6"><path d="M23 49l-3 8M33 49l-3 9M43 49l-3 8"/></g></svg>`;
    case 'snow': return `<svg ${S}>${cl}<g stroke="#dff1ff" stroke-width="3.2"><path d="M23 52v6M20 55h6M37 52v6M34 55h6"/></g></svg>`;
    case 'storm': return `<svg ${S}>${cl}<path d="M34 47l-9 10h8l-3 8 10-11h-8l4-7z" fill="#ffd76e"/><g stroke="#7cc4ff" stroke-width="3.4"><path d="M22 49l-2 7M45 49l-2 7"/></g></svg>`;
    default: return `<svg ${S}>${cl}</svg>`;
  }
}
const iconFor = (code, isDay) => {
  const w = wmo(code);
  if(isDay === 0 && (w.i === 'sun' || w.i === 'part')) return w.i === 'sun' ? 'moon' : 'partn';
  return w.i;
};

/* ---------- 4. Storage ---------- */
const KEY = 'predictweather:v2';
const store = {
  async get(k){
    try{
      if(window.storage){ const r = await window.storage.get(k, false); return r ? JSON.parse(r.value) : null; }
      const v = localStorage.getItem(k); return v ? JSON.parse(v) : null;
    }catch(e){ return null; }
  },
  async set(k, v){
    try{
      if(window.storage) await window.storage.set(k, JSON.stringify(v), false);
      else localStorage.setItem(k, JSON.stringify(v));
    }catch(e){}
  }
};
let S = {
  lang:'zh', locations:[], defaultModel:'best_match',
  compare:MODELS.map(m => m.id),
  units:{temp:'celsius', wind:'kmh', rain:'mm'},
  basemap:'sat'
};
const save = () => store.set(KEY, S);
const t = k => T[S.lang][k];

/* ---------- 5. Units ---------- */
const ULBL = {celsius:'°C', fahrenheit:'°F', kmh:'km/h', mph:'mph', kn:'kn', ms:'m/s', mm:'mm', inch:'in'};
const uT = () => ULBL[S.units.temp];
const uW = () => ULBL[S.units.wind];
const uR = () => ULBL[S.units.rain];
const nz = v => v !== null && v !== undefined && !Number.isNaN(v);
const fT = v => nz(v) ? Math.round(v) + '°' : '—';
const fW = v => nz(v) ? (S.units.wind === 'ms' ? v.toFixed(1) : Math.round(v)) + ' ' + uW() : '—';
const fR = v => nz(v) ? (S.units.rain === 'inch' ? v.toFixed(2) : v.toFixed(1)) + ' ' + uR() : '—';
const compass = deg => {
  if(!nz(deg)) return '—';
  const pts = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return pts[Math.round(deg / 22.5) % 16];
};

/* ---------- 6. API (all endpoints are CORS-enabled for browsers) ---------- */
const API     = 'https://api.open-meteo.com/v1/forecast';
const GEO     = 'https://geocoding-api.open-meteo.com/v1/search';
const ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';

async function jget(url, ms){
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms || 15000);
  try{
    const r = await fetch(url, {signal:ctrl.signal, cache:'no-store'});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
/* Open-Meteo answers 400 when a model cannot produce a requested variable.
   Only that case is worth retrying with fewer variables. */
const isBadRequest = e => /HTTP 4\d\d/.test(String(e && e.message));
function pick(obj, name, model, single){
  if(!obj) return null;
  if(single && obj[name] !== undefined) return obj[name];
  if(obj[name + '_' + model] !== undefined) return obj[name + '_' + model];
  return obj[name] !== undefined ? obj[name] : null;
}
const unitParams = () => ({
  temperature_unit:S.units.temp, wind_speed_unit:S.units.wind, precipitation_unit:S.units.rain
});

/* Variables every model in the list supports. Open-Meteo returns HTTP 400 —
   not nulls — when a model cannot produce a requested variable, so anything
   model-specific (precipitation_probability, uv_index) is fetched separately. */
const SAFE_CURRENT = 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,precipitation,is_day';
const MIN_CURRENT  = 'temperature_2m,wind_speed_10m,is_day';
const SAFE_HOURLY  = 'temperature_2m,precipitation,weather_code,wind_speed_10m,is_day';
const MIN_HOURLY   = 'temperature_2m,precipitation';
const SAFE_DAILY   = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset';
const MIN_DAILY    = 'temperature_2m_max,temperature_2m_min,precipitation_sum';

/* card summary: one model, small payload, with a reduced-variable retry */
async function getSummary(loc){
  const model = loc.model || S.defaultModel;
  const base = {latitude:loc.lat, longitude:loc.lon, models:model, timezone:'auto', forecast_days:'2'};
  const full = Object.assign({}, base, unitParams(),
    {current:SAFE_CURRENT, daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum'});
  try{ return await jget(API + '?' + new URLSearchParams(full)); }
  catch(e){
    if(!isBadRequest(e)) throw e;   // offline or timeout: retrying is pointless
    const lite = Object.assign({}, base, unitParams(), {current:MIN_CURRENT, daily:MIN_DAILY});
    return jget(API + '?' + new URLSearchParams(lite));
  }
}
/* full detail for the main model, with a reduced-variable retry */
async function getMain(loc){
  const model = loc.model || S.defaultModel;
  const base = {latitude:loc.lat, longitude:loc.lon, models:model, timezone:'auto', forecast_days:'10'};
  const full = Object.assign({}, base, unitParams(),
    {current:SAFE_CURRENT, hourly:SAFE_HOURLY, daily:SAFE_DAILY});
  try{ return await jget(API + '?' + new URLSearchParams(full), 20000); }
  catch(e){
    if(!isBadRequest(e)) throw e;
    const lite = Object.assign({}, base, unitParams(),
      {current:MIN_CURRENT, hourly:MIN_HOURLY, daily:MIN_DAILY});
    return jget(API + '?' + new URLSearchParams(lite), 20000);
  }
}
/* precipitation probability and UV are produced by only some models, so they
   always come from Open-Meteo's blended best_match and are labelled as such */
function getExtras(loc){
  const p = Object.assign({
    latitude:loc.lat, longitude:loc.lon, timezone:'auto', forecast_days:'10',
    hourly:'precipitation_probability', daily:'precipitation_probability_max,uv_index_max'
  }, unitParams());
  return jget(API + '?' + new URLSearchParams(p), 15000);
}

/* merge single-model responses into one suffixed payload, so one failing
   model never blanks the whole compare chart */
function mergeModels(results, models){
  const out = {hourly:{}, daily:{}};
  let ok = 0;
  results.forEach((r, i) => {
    if(r.status !== 'fulfilled' || !r.value) return;
    ok++;
    const id = models[i], v = r.value;
    ['hourly','daily'].forEach(sec => {
      if(!v[sec]) return;
      if(!out[sec].time) out[sec].time = v[sec].time;
      Object.keys(v[sec]).forEach(k => {
        if(k === 'time') return;
        out[sec][k.endsWith('_' + id) ? k : k + '_' + id] = v[sec][k];
      });
    });
  });
  if(!ok) throw new Error('all models failed');
  return out;
}
/* light multi-model payload for the compare chart */
async function getCompare(loc, models){
  const mk = list => Object.assign({
    latitude:loc.lat, longitude:loc.lon, models:list.join(','), timezone:'auto', forecast_days:'10',
    hourly:'temperature_2m,precipitation,wind_speed_10m',
    daily:'temperature_2m_max,precipitation_sum,wind_speed_10m_max'
  }, unitParams());
  try{ return await jget(API + '?' + new URLSearchParams(mk(models)), 25000); }
  catch(e){
    const rs = await Promise.allSettled(models.map(id => jget(API + '?' + new URLSearchParams(mk([id])), 20000)));
    return mergeModels(rs, models);
  }
}
/* each model's own hourly output over past days, fixed units, for verification */
async function getPast(loc, models, days){
  const mk = list => ({
    latitude:loc.lat, longitude:loc.lon, models:list.join(','), timezone:'UTC',
    past_days:String(days), forecast_days:'1', hourly:'temperature_2m', temperature_unit:'celsius'
  });
  try{ return await jget(API + '?' + new URLSearchParams(mk(models)), 25000); }
  catch(e){
    const rs = await Promise.allSettled(models.map(id => jget(API + '?' + new URLSearchParams(mk([id])), 20000)));
    return mergeModels(rs, models);
  }
}
/* ECMWF ERA5 reanalysis — the verification reference */
function getEra5(loc, startDate, endDate){
  const p = {
    latitude:loc.lat, longitude:loc.lon, start_date:startDate, end_date:endDate,
    hourly:'temperature_2m', timezone:'UTC', temperature_unit:'celsius'
  };
  return jget(ARCHIVE + '?' + new URLSearchParams(p), 25000);
}
function geoSearch(q){
  const p = {name:q, count:'12', language:(S.lang === 'ms' ? 'en' : S.lang), format:'json'};
  return jget(GEO + '?' + new URLSearchParams(p), 12000);
}
const ymd = d => d.toISOString().slice(0,10);

/* ---------- 7. Helpers ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const el = h => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const coordText = l => `${(+l.lat).toFixed(4)}°, ${(+l.lon).toFixed(4)}°`;
const locale = () => S.lang === 'zh' ? 'zh-CN' : S.lang === 'ms' ? 'ms-MY' : 'en-GB';
let toastTimer;
function toast(msg){
  const n = $('#toast'); n.textContent = msg; n.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => n.classList.remove('on'), 2200);
}
const cache = {};

/* ---------- 8. Saved list ---------- */
function cardHTML(l){
  const d = cache[l.id], m = M(l.model || S.defaultModel);
  let cls = 'loc', ico = 'cloud', temp, meta;
  if(d && d.current){
    const c = d.current, code = pick(c,'weather_code',m.id,true), day = pick(c,'is_day',m.id,true);
    const w = wmo(code); ico = iconFor(code, day);
    cls += ' ' + (w.s === 'rain' ? 'rain' : day === 0 ? 'night' : w.s === 'cloud' ? 'cloud' : '');
    const rh = pick(c,'relative_humidity_2m',m.id,true);
    const ps = pick(d.daily,'precipitation_sum',m.id,true);
    temp = `<b>${fT(pick(c,'temperature_2m',m.id,true))}</b><span>${w[S.lang]}</span>`;
    meta = `<span><i>${t('rainToday')}</i> ${ps && nz(ps[0]) ? fR(ps[0]) : '—'}</span>
            <span><i>${t('wind')}</i> ${fW(pick(c,'wind_speed_10m',m.id,true))}</span>
            <span><i>${t('humid')}</i> ${nz(rh) ? Math.round(rh) + '%' : '—'}</span>`;
  } else if(d === null){
    temp = `<b>—</b><span>${navigator.onLine ? t('failLoad') : t('noNet')}</span>`; meta = '';
  } else {
    temp = `<b class="skel">28°</b><span class="skel">${t('loading')}</span>`;
    meta = `<span class="skel">${t('loading')}</span>`;
  }
  return `<button class="${cls}" data-id="${l.id}">
      <div class="loc-top">
        <div class="loc-name"><h2>${esc(l.name)}</h2><p>${esc(l.region || coordText(l))}</p></div>
        <div class="loc-ico">${icon(ico, 66)}</div>
      </div>
      <div class="loc-temp">${temp}</div>
      <div class="loc-meta">${meta}</div>
      <div class="loc-foot">
        <span class="badge"><span class="dot" style="background:${m.color}"></span>${m.short}</span>
        <span style="font-size:12.5px;opacity:.72">${coordText(l)}</span>
      </div></button>`;
}
function makeCard(l){
  const node = el(cardHTML(l));
  node.addEventListener('click', () => openDetail(l.id));
  return node;
}
function renderList(){
  const box = $('#loc-list'); box.innerHTML = '';
  if(!S.locations.length){ box.appendChild(el(`<p class="empty">${t('empty')}</p>`)); return; }
  S.locations.forEach(l => box.appendChild(makeCard(l)));
}
/* swap a single card in place — a finished request no longer rebuilds
   every card and every map marker on the page */
function updateCard(id){
  const l = S.locations.find(x => x.id === id);
  const old = document.querySelector(`#loc-list [data-id="${id}"]`);
  if(!l || !old){ renderList(); return; }
  old.replaceWith(makeCard(l));
}
async function loadCard(l){
  try{ cache[l.id] = await getSummary(l); }
  catch(e){ cache[l.id] = null; }
  if(!S.locations.some(x => x.id === l.id)) return;   // deleted while loading
  updateCard(l.id); updatePin(l.id);
}
function loadAll(){ S.locations.forEach(loadCard); }

/* ---------- 9. Map ---------- */
let map, myLayer, tapMarker, mapCentred = false;
function initMap(){
  if(map){ setTimeout(() => map.invalidateSize(), 80); return; }
  const c = S.locations.length ? [S.locations[0].lat, S.locations[0].lon] : [4.2105, 101.9758];
  map = L.map('map', {zoomControl:false}).setView(c, S.locations.length ? 9 : 6);
  setBasemap(S.basemap || 'sat');
  myLayer = L.layerGroup().addTo(map);
  map.on('click', e => {
    const {lat, lng} = e.latlng;
    if(tapMarker) map.removeLayer(tapMarker);
    tapMarker = L.marker([lat,lng], {icon:L.divIcon({className:'', html:'<div class="tap-pin"></div>', iconSize:[0,0]})}).addTo(map);
    const foot = $('#map-foot');
    foot.innerHTML = `<b style="color:#fff">${lat.toFixed(4)}°, ${lng.toFixed(4)}°</b>
      <button id="map-add" style="display:block;width:100%;margin-top:10px;padding:12px 0;border-radius:12px;background:#5b9ce6;color:#0d1330;font-weight:700;font-size:15px">${t('mapAdd')}</button>`;
    $('#map-add').addEventListener('click', () => {
      addLocation({name:`${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat:+lat.toFixed(5), lon:+lng.toFixed(5), region:''});
      if(tapMarker){ map.removeLayer(tapMarker); tapMarker = null; }
      foot.textContent = t('mapHint');
    });
  });
  refreshPins();
  setTimeout(() => map.invalidateSize(), 120);
}
/* Basemaps. Satellite is the default: on a plantation you want to see the
   actual blocks, and the dark tiles are close to unreadable on a phone. */
const BASEMAPS = {
  sat:{ name:'bmSat', cls:'bm-sat', maxZoom:19,
        url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        labels:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        attr:'Tiles © Esri · Earthstar Geographics' },
  street:{ name:'bmStreet', cls:'bm-street', maxZoom:20, subdomains:'abcd',
        url:'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        attr:'© OpenStreetMap · © CARTO' },
  dark:{ name:'bmDark', cls:'bm-dark', maxZoom:20, subdomains:'abcd',
        url:'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attr:'© OpenStreetMap · © CARTO' }
};
let baseTiles = [];
function setBasemap(id){
  const b = BASEMAPS[id] || BASEMAPS.sat;
  const next = BASEMAPS[id] ? id : 'sat';
  if(S.basemap !== next){ S.basemap = next; save(); }
  const wrap = $('#map');
  if(wrap) wrap.className = b.cls;
  if(map){
    baseTiles.forEach(l => map.removeLayer(l));
    baseTiles = [];
    const opts = {maxZoom:b.maxZoom, attribution:b.attr};
    if(b.subdomains) opts.subdomains = b.subdomains;
    baseTiles.push(L.tileLayer(b.url, opts).addTo(map));
    if(b.labels) baseTiles.push(L.tileLayer(b.labels, {maxZoom:b.maxZoom, attribution:''}).addTo(map));
    // keep the pins drawn above the tiles
    if(myLayer && map.hasLayer(myLayer)){ map.removeLayer(myLayer); myLayer.addTo(map); }
  }
  drawBasemapSwitch();
}
function drawBasemapSwitch(){
  const host = $('#basemaps');
  if(!host) return;
  host.innerHTML = Object.keys(BASEMAPS)
    .map(id => `<button data-bm="${id}" class="${S.basemap === id ? 'on' : ''}">${t(BASEMAPS[id].name)}</button>`).join('');
  host.querySelectorAll('[data-bm]').forEach(b =>
    b.addEventListener('click', () => setBasemap(b.dataset.bm)));
}

const pins = {};
function pinIcon(l){
  const d = cache[l.id], m = M(l.model || S.defaultModel);
  const temp = d && d.current ? fT(pick(d.current,'temperature_2m',m.id,true)) : '—';
  return L.divIcon({className:'', iconSize:[0,0],
    html:`<div class="pin"><b style="background:${m.color}">${temp}</b><small>${esc(l.name)}</small></div>`});
}
function updatePin(id){
  const l = S.locations.find(x => x.id === id);
  if(!l || !pins[id]) return;
  pins[id].setIcon(pinIcon(l));
}
function refreshPins(){
  const cnt = $('#map-count');
  if(cnt) cnt.textContent = `${S.locations.length} ${t('locsUnit')}`;
  if(!myLayer) return;
  myLayer.clearLayers();
  Object.keys(pins).forEach(k => delete pins[k]);
  S.locations.forEach(l => {
    pins[l.id] = L.marker([l.lat, l.lon], {icon:pinIcon(l)})
      .on('click', () => openDetail(l.id)).addTo(myLayer);
  });
  if(map && !mapCentred && S.locations.length){
    mapCentred = true;
    map.setView([S.locations[0].lat, S.locations[0].lon], Math.max(map.getZoom(), 9));
  }
}

/* ---------- 10. Sheets ---------- */
let openSheetId = null;
function show(id){
  if(openSheetId) $(openSheetId).classList.remove('on');
  else { try{ history.pushState({pw:'sheet'}, ''); }catch(e){} }
  openSheetId = id; $(id).classList.add('on'); $('#scrim').classList.add('on');
}
/* closes without touching history — used by the popstate handler */
function closeSheetNow(){
  if(openSheetId) $(openSheetId).classList.remove('on');
  openSheetId = null; $('#scrim').classList.remove('on');
}
function hide(){
  if(history.state && history.state.pw === 'sheet') history.back();
  else closeSheetNow();
}
$('#scrim').addEventListener('click', hide);
$$('[data-close]').forEach(b => b.addEventListener('click', hide));

$$('.picker button').forEach(b => b.addEventListener('click', () => {
  $$('.picker button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  ['gps','search','manual'].forEach(m => $('#mode-' + m).classList.toggle('hide', m !== b.dataset.mode));
}));
$('#btn-add').addEventListener('click', () => {
  $('#gps-out').innerHTML = '';
  $('#q').value = '';
  $('#q-out').innerHTML = `<p class="searching">${t('searchEmpty')}</p>`;
  $('#m-err').innerHTML = '';
  show('#sheet-add');
});

$('#btn-gps').addEventListener('click', () => {
  const out = $('#gps-out');
  if(!window.isSecureContext){ out.innerHTML = `<p class="err">${t('gpsInsecure')}</p>`; return; }
  if(!navigator.geolocation){ out.innerHTML = `<p class="err">${t('gpsFail')}</p>`; return; }
  out.innerHTML = `<p class="hint">${t('gpsWait')}</p>`;
  navigator.geolocation.getCurrentPosition(p => {
    const lat = +p.coords.latitude.toFixed(5), lon = +p.coords.longitude.toFixed(5);
    const acc = Math.round(p.coords.accuracy);
    out.innerHTML = `<div class="field" style="margin-top:16px"><label>${t('fName')}</label>
        <input id="g-name" type="text" value="${esc(t('myLoc'))}"></div>
      <p class="hint" style="margin-bottom:12px">${lat}°, ${lon}° · ±${acc} m</p>
      <button class="cta" id="g-save">${t('saveLoc')}</button>`;
    $('#g-save').addEventListener('click', () =>
      addLocation({name:$('#g-name').value.trim() || t('myLoc'), lat, lon, region:''}));
  }, err => {
    out.innerHTML = `<p class="err">${err.code === 1 ? t('gpsDenied') : t('gpsFail')}</p>`;
  }, {enableHighAccuracy:true, timeout:15000, maximumAge:0});
});

let qTimer, qSeq = 0;
$('#q').addEventListener('input', e => {
  clearTimeout(qTimer);
  const q = e.target.value.trim(), out = $('#q-out');
  if(q.length < 2){ out.innerHTML = `<p class="searching">${t('searchEmpty')}</p>`; return; }
  out.innerHTML = `<p class="searching">${t('searching')}</p>`;
  const mySeq = ++qSeq;
  qTimer = setTimeout(async () => {
    try{
      const j = await geoSearch(q), rs = j.results || [];
      if(mySeq !== qSeq) return;
      if(!rs.length){ out.innerHTML = `<p class="searching">${t('noResult')}</p>`; return; }
      out.innerHTML = '';
      rs.forEach(r => {
        const region = [r.admin1, r.country].filter(Boolean).join(', ');
        const b = el(`<button class="result"><span style="flex:1"><b>${esc(r.name)}</b>
          <small>${esc(region)} · ${r.latitude.toFixed(3)}°, ${r.longitude.toFixed(3)}°</small></span><span class="go">›</span></button>`);
        b.addEventListener('click', () => addLocation({
          name:r.name, region, lat:+r.latitude.toFixed(5), lon:+r.longitude.toFixed(5)}));
        out.appendChild(b);
      });
    }catch(e){
      if(mySeq !== qSeq) return;
      out.innerHTML = `<p class="searching">${navigator.onLine ? t('failLoad') : t('noNet')}</p>`;
    }
  }, 350);
});

$('#btn-manual').addEventListener('click', () => {
  const latS = $('#m-lat').value.trim(), lonS = $('#m-lon').value.trim(), err = $('#m-err');
  const lat = Number(latS), lon = Number(lonS);
  if(!latS || !lonS || Number.isNaN(lat) || Number.isNaN(lon)){ err.innerHTML = `<p class="err">${t('errNum')}</p>`; return; }
  if(!(lat >= -90 && lat <= 90)){ err.innerHTML = `<p class="err">${t('errLat')}</p>`; return; }
  if(!(lon >= -180 && lon <= 180)){ err.innerHTML = `<p class="err">${t('errLon')}</p>`; return; }
  err.innerHTML = '';
  addLocation({name:$('#m-name').value.trim() || `${lat.toFixed(3)}, ${lon.toFixed(3)}`, lat, lon, region:''});
  $('#m-name').value = $('#m-lat').value = $('#m-lon').value = '';
});

function addLocation(o){
  const dup = S.locations.find(x => Math.abs(x.lat - o.lat) < 1e-4 && Math.abs(x.lon - o.lon) < 1e-4);
  if(dup){
    toast(t('dupLoc')); hide();
    $('#m-name').value = $('#m-lat').value = $('#m-lon').value = '';
    return;
  }
  const l = {id:'l' + Date.now() + Math.floor(Math.random()*99), name:o.name, region:o.region || '',
             lat:+o.lat, lon:+o.lon, model:S.defaultModel};
  S.locations.push(l); save(); renderList(); refreshPins(); hide(); setTab('saved'); loadCard(l);
}

/* ---------- 11. Detail page ---------- */
let D = {loc:null, main:null, cmp:null, cmpIds:null, ext:null, acc:null, day:0, tab:'forecast', span:'hourly', vari:'temp', busy:false, seq:0};
let detailSeq = 0;

function openDetail(id){
  const loc = S.locations.find(x => x.id === id); if(!loc) return;
  /* a new location always opens on today; D.day survives everything else */
  D = {loc, main:null, cmp:null, cmpIds:null, ext:null, acc:null, day:0, tab:'forecast', span:'hourly', vari:'temp', busy:false, seq:++detailSeq};
  paintHead();
  $$('.d-tabs button').forEach(b => b.classList.toggle('on', b.dataset.dtab === 'forecast'));
  const page = $('#detail');
  page.scrollTop = 0;
  page.classList.add('on');
  document.body.style.overflow = 'hidden';
  try{ history.pushState({pw:'detail'}, ''); }catch(e){}
  loadDetail();
}
function closeDetail(){
  $('#detail').classList.remove('on');
  document.body.style.overflow = '';
}
/* always leave through here so the history entry pushed on open is consumed */
function exitDetail(){
  if(history.state && history.state.pw === 'detail') history.back();
  else closeDetail();
}
$('#d-back').addEventListener('click', exitDetail);
$('#d-modelbtn').addEventListener('click', () => { drawModelPicker(); show('#sheet-model'); });
$$('.d-tabs button').forEach(b => b.addEventListener('click', () => {
  D.tab = b.dataset.dtab;
  $$('.d-tabs button').forEach(x => x.classList.toggle('on', x === b));
  paintBody();
}));

function paintHead(){
  const loc = D.loc, m = M(loc.model || S.defaultModel), sum = D.main || cache[loc.id];
  $('#d-name').textContent = loc.name;
  $('#d-region').textContent = loc.region || coordText(loc);
  $('#d-modelname').textContent = m.short;
  $('#d-badge').innerHTML = `<span class="dot" style="background:${m.color}"></span>${m.short}`;
  const page = $('#detail');
  page.classList.remove('rain','cloud','night');
  if(sum && sum.current){
    const c = sum.current, code = pick(c,'weather_code',m.id,true), day = pick(c,'is_day',m.id,true);
    const w = wmo(code);
    $('#d-icon').innerHTML = icon(iconFor(code, day), 110);
    $('#d-temp').innerHTML = `${Math.round(pick(c,'temperature_2m',m.id,true))}<span style="font-size:30px;letter-spacing:-1px">${uT()}</span>`;
    $('#d-cond').textContent = `${w[S.lang]} · ${t('feels')} ${fT(pick(c,'apparent_temperature',m.id,true))}`;
    if(day === 0) page.classList.add('night');
    else if(w.s === 'rain') page.classList.add('rain');
    else if(w.s === 'cloud') page.classList.add('cloud');
  } else {
    $('#d-icon').innerHTML = icon('cloud', 110);
    $('#d-temp').textContent = '—'; $('#d-cond').textContent = t('loading');
  }
}

async function loadDetail(){
  /* a reload asked for while one is running (unit change, retry) must not be
     swallowed — bump the sequence so the in-flight replies are discarded */
  if(D.busy) D.seq = ++detailSeq;
  D.busy = true;
  /* every in-flight response is tagged, so a slow reply for a location the
     user already left can never paint over the one now on screen */
  const seq = D.seq, loc = D.loc;
  const current = () => D.seq === seq;
  $('#d-body').innerHTML = `<div class="big-msg"><p>${t('loading')}</p></div>`;
  try{
    const main = await getMain(loc);
    if(!current()){ D.busy = false; return; }
    D.main = main;
    cache[loc.id] = main;
    paintHead(); updateCard(loc.id); updatePin(loc.id);
    paintBody();
    getExtras(loc).then(r => { if(!current()) return; D.ext = r; if(D.tab === 'forecast') paintForecast(); })
                  .catch(() => { if(current()) D.ext = 'fail'; });
    getCompare(loc, S.compare).then(r => {
      if(!current()) return;
      D.cmp = r;
      /* the chip row can only offer models this payload actually holds —
         offering more would mean a fetch on click, which spec §5 forbids */
      D.cmpIds = S.compare.slice();
      /* the forecast tab's chart is already on screen as a single line —
         repaint just the chart so the other models appear without a reflow */
      if(D.tab === 'forecast') buildChart('#ch-temp', {vari:'temp', fill:true, marks:true});
      else if(D.tab === 'compare') paintBody();
    }).catch(() => { if(!current()) return; D.cmp = 'fail'; if(D.tab === 'compare') paintBody(); });
  }catch(e){
    if(!current()){ D.busy = false; return; }
    $('#d-body').innerHTML = `<div class="big-msg"><b>${t('failLoad')}</b>
      <p>${navigator.onLine ? '' : t('noNet')}</p><button class="retry" id="d-retry">${t('retry')}</button></div>`;
    const r = $('#d-retry'); if(r) r.addEventListener('click', loadDetail);
  }
  D.busy = false;
}

function paintBody(){
  if(D.tab === 'forecast') return paintForecast();
  if(D.tab === 'compare') return paintCompare();
  return paintAccuracy();
}

/* ----- Day strip ----- */
/* Ten rows of weekday names repeat after seven, so the old list could not tell
   next Tuesday from the one after. Every cell here carries its date number. */
function renderDayStrip(){
  const dd = D.main && D.main.daily;
  if(!dd || !dd.time || !dd.time.length) return '';
  if(D.day >= dd.time.length) D.day = 0;
  /* parse at midday: the date string is a bare YYYY-MM-DD and midnight can
     land on the wrong side of a DST jump in some zones */
  const asDate = day => new Date(day + 'T12:00:00');
  const cells = dd.time.map((day, i) => {
    const wd = asDate(day).toLocaleDateString(locale(), {weekday:'narrow'});
    return `<button class="dcell${i === D.day ? ' on' : ''}${i === 0 ? ' today' : ''}" data-day="${i}">
      <span class="dw">${esc(wd)}</span><span class="dnum">${+day.slice(8,10)}</span></button>`;
  }).join('');
  const full = asDate(dd.time[D.day]).toLocaleDateString(locale(),
    {year:'numeric', month:'long', day:'numeric', weekday:'long'});
  return `<div class="d-days"><div class="dscroll">${cells}</div><div class="dfull">${esc(full)}</div></div>`;
}
function bindDayStrip(){
  $$('#d-body [data-day]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.day;
    if(i === D.day) return;
    D.day = i;
    paintBody();
    const sel = $('#d-body .dcell.on');
    if(sel) sel.scrollIntoView({inline:'center', block:'nearest'});
  }));
}

/* ----- Forecast tab ----- */
function paintForecast(){
  const d = D.main, m = M(D.loc.model || S.defaultModel);
  if(!d){ $('#d-body').innerHTML = `<div class="big-msg"><p>${t('loading')}</p></div>`; return; }
  const c = d.current, dd = d.daily, hh = d.hourly;
  const g = (o,k) => pick(o, k, m.id, true);
  const ex = (D.ext && D.ext !== 'fail') ? D.ext : null;
  const pp = ex && ex.daily ? ex.daily.precipitation_probability_max : null;
  const uv = ex && ex.daily ? ex.daily.uv_index_max : null;
  const sr = g(dd,'sunrise'), ss = g(dd,'sunset');
  const hhmm = s => s ? s.slice(11,16) : '—';

  const cells = `<div class="grid2">
    <div class="cell"><small>${t('feels')}</small><b>${fT(g(c,'apparent_temperature'))}</b></div>
    <div class="cell"><small>${t('humid')}</small><b>${nz(g(c,'relative_humidity_2m')) ? Math.round(g(c,'relative_humidity_2m')) + '%' : '—'}</b></div>
    <div class="cell"><small>${t('wind')} · ${t('dir')} ${compass(g(c,'wind_direction_10m'))}</small><b>${fW(g(c,'wind_speed_10m'))}</b></div>
    <div class="cell"><small>${t('gust')}</small><b>${fW(g(c,'wind_gusts_10m'))}</b></div>
    <div class="cell"><small>${t('rainToday')}</small><b>${(() => { const ps = g(dd,'precipitation_sum'); return ps && nz(ps[0]) ? fR(ps[0]) : '—'; })()}</b></div>
    <div class="cell"><small>${t('press')}</small><b>${nz(g(c,'surface_pressure')) ? Math.round(g(c,'surface_pressure')) + ' hPa' : '—'}</b></div>
    <div class="cell"><small>${t('rainChance')}</small><b>${pp && nz(pp[0]) ? pp[0] + '%' : '—'}</b></div>
    <div class="cell"><small>${t('uv')}</small><b>${uv && nz(uv[0]) ? Math.round(uv[0]) : '—'}</b></div>
    <div class="cell"><small>${t('sunrise')}</small><b>${hhmm(sr && sr[0])}</b></div>
    <div class="cell"><small>${t('sunset')}</small><b>${hhmm(ss && ss[0])}</b></div>
  </div>`;

  // next 24 hours, starting from the current hour
  let strip = '';
  if(hh && hh.time){
    const nowIso = (d.current && d.current.time) ? d.current.time.slice(0,13) : null;
    let start = nowIso ? hh.time.findIndex(x => x.slice(0,13) === nowIso) : 0;
    if(start < 0) start = 0;
    const T2 = pick(hh,'temperature_2m',m.id,true);
    const P2map = {};
    if(ex && ex.hourly && ex.hourly.precipitation_probability)
      ex.hourly.time.forEach((tm,k) => { P2map[tm] = ex.hourly.precipitation_probability[k]; });
    const C2 = pick(hh,'weather_code',m.id,true), Dy = pick(hh,'is_day',m.id,true);
    for(let i = start; i < Math.min(start + 24, hh.time.length); i++){
      strip += `<div class="hcol">
        <div class="hh">${i === start ? t('now2') : hh.time[i].slice(11,16)}</div>
        <div class="hi">${icon(iconFor(C2 ? C2[i] : 3, Dy ? Dy[i] : 1), 30)}</div>
        <div class="ht">${fT(T2 ? T2[i] : null)}</div>
        <div class="hp">${nz(P2map[hh.time[i]]) ? P2map[hh.time[i]] + '%' : ''}</div>
      </div>`;
    }
  }

  // 10-day list with a min/max range bar
  let days = '';
  if(dd && dd.time){
    const mx = g(dd,'temperature_2m_max'), mn = g(dd,'temperature_2m_min');
    const cd = g(dd,'weather_code'), ps = g(dd,'precipitation_sum');
    const all = [].concat(mx || [], mn || []).filter(nz);
    const lo = all.length ? Math.min.apply(null, all) : 0;
    const hi = all.length ? Math.max.apply(null, all) : 1;
    const rng = (hi - lo) > 0 ? (hi - lo) : 1;
    days = dd.time.map((day,i) => {
      const a = mn ? mn[i] : null, b = mx ? mx[i] : null;
      let left = nz(a) ? ((a - lo) / rng) * 100 : 0;
      let wid = nz(a) && nz(b) ? Math.max(6, ((b - a) / rng) * 100) : 0;
      if(left + wid > 100) left = Math.max(0, 100 - wid);
      return `<div class="day">
        <span class="dn">${i === 0 ? t('today') : new Date(day).toLocaleDateString(locale(), {weekday:'short'})}</span>
        <span class="di">${icon(wmo(cd ? cd[i] : 3).i, 30)}</span>
        <span class="dp">${ps && nz(ps[i]) && ps[i] > 0 ? fR(ps[i]) : ''}</span>
        <span class="bar"><i style="left:${left.toFixed(1)}%;width:${wid.toFixed(1)}%"></i></span>
        <span class="dt"><i>${fT(a)}</i>${fT(b)}</span>
      </div>`;
    }).join('');
  }

  $('#d-body').innerHTML = renderDayStrip() + renderTempChart() + `
    <div class="glass"><h4><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>${t('now')}<span class="r">${M(D.loc.model || S.defaultModel).short}</span></h4>${cells}</div>
    <div class="glass"><h4>${t('next24')}</h4><div class="hstrip">${strip}</div>
      ${ex ? `<p class="note" style="margin-bottom:0">${t('probSrc')}</p>` : ''}</div>
    <div class="glass"><h4>${t('days10')}</h4>${days}</div>
    <div class="glass" style="padding-bottom:10px">
      <h4>${t('editName')}</h4>
      <div class="field" style="margin-bottom:10px"><label>${t('rename')}</label>
        <input id="d-rename" type="text" value="${esc(D.loc.name)}"></div>
      <button class="cta ghost" id="d-saveName" style="margin-bottom:12px">${t('saveLoc')}</button>
      <button class="dangerbtn" id="d-remove">${t('rmLoc')}</button>
    </div>`;
  bindDayStrip();
  bindModelChips();
  buildChart('#ch-temp', {vari:'temp', fill:true, marks:true});
  $('#d-saveName').addEventListener('click', () => {
    const v = $('#d-rename').value.trim(); if(!v) return;
    D.loc.name = v; save(); paintHead(); renderList(); refreshPins(); toast(t('savedOk'));
  });
  $('#d-remove').addEventListener('click', () => {
    S.locations = S.locations.filter(x => x.id !== D.loc.id);
    delete cache[D.loc.id]; save(); renderList(); refreshPins(); exitDetail(); toast(t('deleted'));
  });
}

/* ----- Compare tab ----- */
function paintCompare(){
  const variRow = `<div class="chiprow">
      <button data-vari="temp" class="${D.vari === 'temp' ? 'on' : ''}">${t('vTemp')}</button>
      <button data-vari="rain" class="${D.vari === 'rain' ? 'on' : ''}">${t('vRain')}</button>
      <button data-vari="wind" class="${D.vari === 'wind' ? 'on' : ''}">${t('vWind')}</button>
    </div>`;
  if(D.cmp === 'fail'){
    $('#d-body').innerHTML = renderDayStrip() + variRow + `<div class="big-msg"><b>${t('failLoad')}</b>
      <button class="retry" id="c-retry">${t('retry')}</button></div>`;
    bindDayStrip(); bindCompareControls();
    $('#c-retry').addEventListener('click', () => {
      D.cmp = null; paintBody();
      getCompare(D.loc, S.compare).then(r => { D.cmp = r; if(D.tab === 'compare') paintBody(); })
        .catch(() => { D.cmp = 'fail'; if(D.tab === 'compare') paintBody(); });
    });
    return;
  }
  if(!D.cmp){
    $('#d-body').innerHTML = renderDayStrip() + variRow + `<div class="big-msg"><p>${t('loading')}</p></div>`;
    bindDayStrip(); bindCompareControls(); return;
  }
  $('#d-body').innerHTML = renderDayStrip() + variRow + renderVariChart(D.vari) + `<div id="spread"></div>`;
  bindDayStrip(); bindCompareControls();
  buildChart('#ch-cmp', {vari:D.vari, fill:true, marks:true});
  buildSpread();
}
function bindCompareControls(){
  $$('#d-body [data-vari]').forEach(b => b.addEventListener('click', () => { D.vari = b.dataset.vari; paintBody(); }));
}

/* ----- Charts -----
   Every chart shows exactly one day: the one selected in the day strip. All of
   it is drawn from payloads already in hand, so changing the day or the model
   selection repaints and never fetches (spec §5). */

/* the card the temperature chart is painted into */
function renderTempChart(){
  return `<div class="glass">
    <h4>${t('vTemp')}<span class="r">${uT()}</span></h4>
    <div class="chartwrap" id="ch-temp"></div>
    ${renderModelChips()}
    <div class="mlist" id="ch-temp-list"></div>
  </div>`;
}
function renderVariChart(vari){
  const title = vari === 'temp' ? t('vTemp') : vari === 'rain' ? t('vRain') : t('vWind');
  const unit  = vari === 'temp' ? uT() : vari === 'rain' ? uR() : uW();
  return `<div class="glass">
    <h4>${title}<span class="r">${unit}</span></h4>
    <div class="chartwrap" id="ch-cmp"></div>
    <div class="mlist" id="ch-cmp-list"></div>
  </div>`;
}

/* Model selection, right beside the chart it drives. Reads and writes the same
   S.compare the settings page does, and never fetches: the payload for every
   chip shown here is already loaded (spec §4.5). */
function renderModelChips(){
  const ids = (D.cmpIds && D.cmpIds.length) ? D.cmpIds : S.compare.slice();
  if(ids.length < 2) return '';
  const dead = D.cmp === 'fail';
  return `<div class="mchips${dead ? ' dead' : ''}">` + ids.map(id => {
    const m = M(id);
    return `<button class="mchip${S.compare.includes(id) ? ' on' : ''}" data-mchip="${id}"${dead ? ' disabled' : ''}>
      <span class="mdot" style="background:${m.color}"></span>${esc(m.short)}</button>`;
  }).join('') + '</div>';
}
function bindModelChips(){
  $$('#d-body [data-mchip]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.mchip;
    /* same rule as the settings page: the chart never ends up with no line */
    if(S.compare.includes(id)){
      if(S.compare.length <= 1) return;
      S.compare = S.compare.filter(x => x !== id);
    } else {
      S.compare = MODELS.map(m => m.id).filter(x => S.compare.includes(x) || x === id);
    }
    save();
    b.classList.toggle('on', S.compare.includes(id));
    buildChart('#ch-temp', {vari:'temp', fill:true, marks:true});
  }));
}

/* 'temp' | 'rain' | 'wind' come from the multi-model compare payload;
   'prob' has a single source (best_match) and comes from D.ext. */
function seriesForDay(vari){
  const empty = {labels:[], series:[], nowAt:-1, codes:null, isDay:null};
  const dd = D.main && D.main.daily;
  if(!dd || !dd.time || !dd.time[D.day]) return empty;
  const dayISO = dd.time[D.day];
  const nowISO = (D.main.current && D.main.current.time) || '';

  if(vari === 'prob'){
    const ex = (D.ext && D.ext !== 'fail') ? D.ext : null;
    if(!ex || !ex.hourly || !ex.hourly.precipitation_probability) return empty;
    const {start, n} = sliceDay(ex.hourly.time, dayISO);
    if(start < 0) return empty;
    const times = ex.hourly.time.slice(start, start + n);
    const values = ex.hourly.precipitation_probability.slice(start, start + n).map(x => nz(x) ? +x : null);
    if(!values.some(nz)) return empty;
    return {labels:times.map(s => s.slice(11,16)),
            series:[{id:'best_match', name:M('best_match').short, color:M('best_match').color, values}],
            nowAt:nowIndex(times, nowISO), codes:null, isDay:null};
  }

  const key = {temp:'temperature_2m', rain:'precipitation', wind:'wind_speed_10m'}[vari];
  /* no compare payload: still draw, as one line from this location's own model
     rather than an empty box (spec §6) */
  const cmp = (D.cmp && D.cmp !== 'fail' && D.cmp.hourly) ? D.cmp : null;
  const src = cmp ? cmp.hourly : (D.main.hourly || null);
  const ids = cmp ? S.compare.slice() : [D.loc.model || S.defaultModel];
  if(!src || !src.time) return empty;
  const {start, n} = sliceDay(src.time, dayISO);
  if(start < 0) return empty;
  const times = src.time.slice(start, start + n);
  const single = ids.length === 1;
  const series = ids.map(id => {
    const v = pick(src, key, id, single);
    if(!v) return null;
    const values = v.slice(start, start + n).map(x => nz(x) ? +x : null);
    return values.some(nz) ? {id, name:M(id).short, color:M(id).color, values} : null;
  }).filter(Boolean);

  /* the icon in the floating label can only come from the main payload —
     the compare request does not ask for weather_code */
  let codes = null, isDay = null;
  const mh = D.main.hourly;
  if(mh && mh.time){
    const ms = sliceDay(mh.time, dayISO);
    if(ms.start >= 0){
      const mid = D.loc.model || S.defaultModel;
      const c = pick(mh,'weather_code',mid,true), dy = pick(mh,'is_day',mid,true);
      if(c)  codes = c.slice(ms.start, ms.start + ms.n);
      if(dy) isDay = dy.slice(ms.start, ms.start + ms.n);
    }
  }
  return {labels:times.map(s => s.slice(11,16)), series, nowAt:nowIndex(times, nowISO), codes, isDay};
}

/* host: a '.chartwrap' selector. '<host>-list', when present, holds one row per
   model and is updated live while the finger moves. */
function buildChart(host, opts){
  const box = $(host); if(!box) return;
  const vari = opts.vari;
  const {labels, series, nowAt, codes, isDay} = seriesForDay(vari);
  const list = $(host + '-list');
  if(!series.length){
    box.innerHTML = `<p class="searching">—</p>`;
    if(list) list.innerHTML = '';
    return;
  }
  const unit = vari === 'temp' ? uT() : vari === 'rain' ? uR() : vari === 'wind' ? uW() : '%';
  const fmtV = v => !nz(v) ? '—'
    : vari === 'rain' ? (S.units.rain === 'inch' ? v.toFixed(2) : v.toFixed(1)) + ' ' + unit
    : vari === 'wind' ? (S.units.wind === 'ms' ? v.toFixed(1) : Math.round(v)) + ' ' + unit
    : vari === 'prob' ? Math.round(v) + '%'
    : Math.round(v) + unit;

  /* seven translucent fills stacked on each other read as mud, so the gradient
     and the H/L labels are single-line only */
  const solo = series.length === 1;
  const fill = solo && !!opts.fill, marks = solo && !!opts.marks;

  const W = Math.max(260, box.clientWidth || 300), H = 210, pl = 36, pr = 10, pt = 12, pb = 26;
  let lo = Infinity, hi = -Infinity;
  series.forEach(s => s.values.forEach(v => { if(nz(v)){ lo = Math.min(lo,v); hi = Math.max(hi,v); }}));
  if(vari === 'rain'){ lo = 0; hi = Math.max(hi, S.units.rain === 'inch' ? 0.2 : 2); }
  if(opts.yRange){ lo = opts.yRange[0]; hi = opts.yRange[1]; }
  else { const padv = (hi - lo) * 0.15 || 1; lo -= padv; hi += padv; }
  const n = labels.length, span = (hi - lo) || 1;
  const X = i => pl + (W - pl - pr) * (n === 1 ? .5 : i / (n - 1));
  const Y = v => pt + (H - pt - pb) * (1 - (v - lo) / span);
  const axisFmt = v => span < 2 ? v.toFixed(2) : span < 12 ? v.toFixed(1) : String(Math.round(v));

  let grid = '';
  for(let g = 0; g <= 4; g++){
    const v = lo + span * g / 4, y = Y(v);
    grid += `<line x1="${pl}" y1="${y.toFixed(1)}" x2="${W-pr}" y2="${y.toFixed(1)}" stroke="rgba(255,255,255,.16)" stroke-width="1"/>
      <text x="${pl-7}" y="${(y+4).toFixed(1)}" fill="rgba(255,255,255,.72)" font-size="10.5" text-anchor="end">${axisFmt(v)}</text>`;
  }
  let xl = '';
  const step = Math.max(1, Math.round(n / 5));
  for(let i = 0; i < n; i += step)
    xl += `<text x="${X(i).toFixed(1)}" y="${H-7}" fill="rgba(255,255,255,.72)" font-size="10.5" text-anchor="middle">${labels[i]}</text>`;

  const mainId = D.loc.model || S.defaultModel;
  const paths = series.map(s => {
    let dd2 = '', pen = false;
    s.values.forEach((v,i) => {
      if(!nz(v)){ pen = false; return; }
      const x = X(i).toFixed(1), y = Y(v).toFixed(1);
      if(pen) dd2 += 'L' + x + ' ' + y + ' ';
      else {
        // a lone point needs a zero-length segment, or round caps draw nothing
        const lone = !nz(s.values[i+1]);
        dd2 += 'M' + x + ' ' + y + ' ' + (lone ? 'L' + x + ' ' + y + ' ' : '');
      }
      pen = true;
    });
    return `<path d="${dd2}" fill="none" stroke="${s.color}" stroke-width="${s.id === mainId ? 3 : 1.7}"
      stroke-linecap="round" stroke-linejoin="round" opacity="${s.id === mainId ? 1 : .8}"/>`;
  }).join('');

  const gid = 'grad-' + host.replace(/[^a-zA-Z0-9]/g, '');
  let area = '', defs = '';
  if(fill){
    const pts = [];
    series[0].values.forEach((v,i) => { if(nz(v)) pts.push([X(i), Y(v)]); });
    if(pts.length > 1){
      const base = H - pb;
      const dline = pts.map((q,i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
      area = `<path d="${dline} L${pts[pts.length-1][0].toFixed(1)} ${base} L${pts[0][0].toFixed(1)} ${base} Z" fill="url(#${gid})"/>`;
      defs = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${series[0].color}" stop-opacity=".38"/>
        <stop offset="1" stop-color="${series[0].color}" stop-opacity="0"/></linearGradient></defs>`;
    }
  }

  let hl = '';
  if(marks){
    const {hiIdx, loIdx} = extremaOf(series[0].values);
    [[hiIdx, t('hiMark'), -10], [loIdx, t('loMark'), 17]].forEach(([i, lbl, dy]) => {
      if(i < 0 || i === undefined) return;
      const x = X(i), y = Y(series[0].values[i]);
      hl += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.4" fill="#fff"/>
        <text x="${Math.max(pl+2, Math.min(W-pr-2, x)).toFixed(1)}" y="${(y+dy).toFixed(1)}" fill="#fff"
          font-size="11" font-weight="600" text-anchor="middle">${lbl} ${fmtV(series[0].values[i])}</text>`;
    });
  }

  const nowLine = nowAt >= 0
    ? `<line x1="${X(nowAt).toFixed(1)}" y1="${pt}" x2="${X(nowAt).toFixed(1)}" y2="${H-pb}"
        stroke="rgba(255,255,255,.35)" stroke-width="1" stroke-dasharray="3 3"/>` : '';

  box.innerHTML = `<div class="cval"></div><svg class="chart" viewBox="0 0 ${W} ${H}" height="${H}">${defs}${grid}${xl}${area}${nowLine}${paths}${hl}
    <line class="cursor" x1="0" y1="${pt}" x2="0" y2="${H-pb}" stroke="rgba(255,255,255,.65)" stroke-width="1" opacity="0"/></svg>`;

  if(list) list.innerHTML = solo ? '' : series.map(s =>
    `<div class="mrow" data-mrow="${s.id}"><span class="mdot" style="background:${s.color}"></span>
      <span class="mn">${s.name}</span><span class="mv">—</span></div>`).join('');

  const svg = box.querySelector('svg'), cur = svg.querySelector('.cursor'), cval = box.querySelector('.cval');
  const lead = series.find(s => s.id === mainId) || series[0];
  const at = i => {
    cur.setAttribute('x1', X(i)); cur.setAttribute('x2', X(i)); cur.setAttribute('opacity', 1);
    const ic = (vari === 'temp' && codes && nz(codes[i]))
      ? icon(iconFor(codes[i], isDay ? isDay[i] : 1), 19) : '';
    cval.innerHTML = `<span class="cvt">${labels[i]}</span>${ic}<b>${fmtV(lead.values[i])}</b>`;
    /* keep the label inside the card at both ends */
    cval.style.left = Math.max(14, Math.min(86, (X(i) / W) * 100)).toFixed(2) + '%';
    cval.style.opacity = 1;
    series.forEach(s => {
      const r = list && list.querySelector(`[data-mrow="${s.id}"] .mv`);
      if(r) r.textContent = fmtV(s.values[i]);
    });
  };
  const move = ev => {
    const rect = svg.getBoundingClientRect();
    const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - rect.left;
    const rel = (cx / rect.width) * W;
    let i = Math.round((rel - pl) / ((W - pl - pr) / Math.max(1, n - 1)));
    at(Math.max(0, Math.min(n - 1, i)));
  };
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointermove', ev => { if(ev.buttons || ev.pointerType === 'touch') move(ev); });
  /* the cursor deliberately stays where the finger left it — jumping back to
     midnight threw away the reading the user had just lined up */
  at(nowAt >= 0 ? nowAt : 0);
}

function buildSpread(){
  const host = $('#spread'); if(!host) return;
  const d = D.cmp, single = S.compare.length === 1;
  if(!d || !d.hourly){ host.innerHTML = ''; return; }
  let tLo = Infinity, tHi = -Infinity, rLo = Infinity, rHi = -Infinity, any = false;
  S.compare.forEach(id => {
    const tv = pick(d.hourly,'temperature_2m',id,single), rv = pick(d.hourly,'precipitation',id,single);
    if(tv){
      const s = tv.slice(0,24).filter(nz);
      if(s.length){ any = true; const mx = Math.max.apply(null,s); tLo = Math.min(tLo,mx); tHi = Math.max(tHi,mx); }
    }
    if(rv){
      const s = rv.slice(0,24).filter(nz);
      if(s.length){ const sum = s.reduce((a,b)=>a+b,0); rLo = Math.min(rLo,sum); rHi = Math.max(rHi,sum); }
    }
  });
  if(!any){ host.innerHTML = ''; return; }
  const dt = isFinite(tHi - tLo) ? (tHi - tLo).toFixed(1) : '—';
  const dr = isFinite(rHi - rLo) ? (rHi - rLo).toFixed(S.units.rain === 'inch' ? 2 : 1) : '—';
  host.innerHTML = `<div class="glass"><h4>${t('spreadT')}</h4>
    <p class="note" style="margin:0">${t('spreadTxt')(dt, dr, uT(), uR())}</p></div>`;
}

/* ----- Accuracy tab: verify each model against ECMWF ERA5 reanalysis ----- */
function paintAccuracy(){
  if(D.acc === 'busy'){
    $('#d-body').innerHTML = `<div class="glass"><h4>${t('accT')}<span class="r">${t('accSub')}</span></h4>
      <p class="note" style="margin:0">${t('accLoading')}</p></div>`;
    return;
  }
  if(!D.acc){
    $('#d-body').innerHTML = `<div class="glass"><h4>${t('accT')}<span class="r">${t('accSub')}</span></h4>
      <p class="note" style="margin:0">${t('accLoading')}</p></div>`;
    runAccuracy();
    return;
  }
  const a = D.acc;
  if(!a.rows.length){
    $('#d-body').innerHTML = `<div class="glass"><h4>${t('accT')}</h4>
      <p class="note" style="margin:0">${t('accNone')}</p></div>
      <button class="retry" id="a-retry" style="width:100%">${t('retry')}</button>`;
    $('#a-retry').addEventListener('click', () => { D.acc = null; paintBody(); });
    return;
  }
  const rows = a.rows.map((r, i) => {
    const pct = a.max > 0 ? Math.min(100, (r.v / a.max) * 100) : 0;
    return `<div class="mrow" style="display:block">
      <div style="display:flex;align-items:center;gap:11px">
        <span class="mdot" style="background:${r.color}"></span>
        <span class="mn">${i === 0 ? '<b>' + r.name + '</b>' : r.name}</span>
        <span class="mv">${r.v.toFixed(2)} ${a.unit}</span>
      </div>
      <div class="accbar"><i style="width:${(100 - pct).toFixed(0)}%;background:${r.color}"></i></div>
    </div>`;
  }).join('');
  const isEra = a.mode === 'era5';
  $('#d-body').innerHTML = `
    <div class="glass">
      <h4>${isEra ? t('accT') : t('accCons')}<span class="r">${t('accMae')}</span></h4>
      <p class="note" style="margin:0 0 12px">${isEra ? t('accWindow')(a.from, a.to, a.n) : t('accNone')}</p>
      <div class="mlist">${rows}</div>
      <p class="note">${isEra ? t('accMethodEra') : t('accConsD')}</p>
    </div>
    <div class="glass"><h4>${isEra ? t('accBest') : t('accCons')}</h4>
      <p class="note" style="margin:0"><b>${a.rows[0].name}</b> · ${a.rows[0].v.toFixed(2)} ${a.unit}</p>
      ${isEra ? `<p class="note">${t('accEraNote')}</p>` : ''}
    </div>
    <button class="retry" id="a-retry" style="width:100%">${t('retry')}</button>`;
  $('#a-retry').addEventListener('click', () => { D.acc = null; paintBody(); });
}

async function runAccuracy(){
  D.acc = 'busy';
  const loc = D.loc, models = S.compare.slice();
  let out = null;

  /* 1. real verification against ERA5 reanalysis.
     ERA5 lags a few days, so the window sits 7 to 4 days back. */
  /* best_match is not a forecast model: over past dates Open-Meteo serves the
     reanalysis for it, i.e. the very series used as truth here, so it would
     always score an impossible 0.00 and top the table. Score real models only. */
  const scored = models.filter(id => id !== 'best_match');

  try{
    if(!scored.length) throw new Error('no scorable model');
    const now = Date.now(), day = 86400000;
    const from = new Date(now - 7 * day), to = new Date(now - 4 * day);
    const [era, past] = await Promise.all([
      getEra5(loc, ymd(from), ymd(to)),
      getPast(loc, scored, 9)
    ]);
    const truth = {};
    if(era && era.hourly && era.hourly.time){
      era.hourly.time.forEach((tm, i) => {
        const v = era.hourly.temperature_2m[i];
        if(nz(v)) truth[tm.slice(0,13)] = v;
      });
    }
    const keys = Object.keys(truth);
    if(keys.length >= 24 && past.hourly && past.hourly.time){
      const single = scored.length === 1;
      const times = past.hourly.time;
      const rows = [];
      scored.forEach(id => {
        const v = pick(past.hourly, 'temperature_2m', id, single);
        if(!v) return;
        let sum = 0, cnt = 0;
        for(let i = 0; i < times.length; i++){
          const k = times[i].slice(0,13);
          if(truth[k] === undefined || !nz(v[i])) continue;
          sum += Math.abs(v[i] - truth[k]); cnt++;
        }
        if(cnt >= 24) rows.push({id, name:M(id).short, color:M(id).color, v:sum / cnt, n:cnt});
      });
      if(rows.length){
        // MAE is a difference in °C; only the scale changes for °F, not the offset
        const conv = S.units.temp === 'fahrenheit' ? 1.8 : 1;
        rows.forEach(r => r.v = r.v * conv);
        rows.sort((a,b) => a.v - b.v);
        out = {mode:'era5', rows, max:rows[rows.length-1].v, unit:uT(),
               from:ymd(from), to:ymd(to), n:Math.max.apply(null, rows.map(r => r.n))};
      }
    }
  }catch(e){ /* fall through */ }

  /* 2. fallback: distance from the multi-model consensus, labelled as such */
  if(!out){
    try{
      const d = (D.cmp && D.cmp !== 'fail') ? D.cmp : await getCompare(loc, models);
      const single = models.length === 1, hh = d.hourly;
      const cols = models.map(id => ({id, v:pick(hh,'temperature_2m',id,single)})).filter(x => x.v);
      const n = Math.min(48, hh.time.length);
      const rows = cols.map(c => {
        let sum = 0, cnt = 0;
        for(let i = 0; i < n; i++){
          const vals = cols.map(x => x.v[i]).filter(nz);
          if(vals.length < 2 || !nz(c.v[i])) continue;
          sum += Math.abs(c.v[i] - vals.reduce((a,b) => a + b, 0) / vals.length); cnt++;
        }
        return cnt ? {id:c.id, name:M(c.id).short, color:M(c.id).color, v:sum / cnt} : null;
      }).filter(Boolean).sort((a,b) => a.v - b.v);
      if(rows.length) out = {mode:'consensus', rows, max:rows[rows.length-1].v, unit:uT()};
    }catch(e){}
  }

  D.acc = out || {mode:'consensus', rows:[], max:0, unit:uT()};
  if(D.tab === 'accuracy') paintBody();
}

/* ---------- 12. Model picker ---------- */
function drawModelPicker(){
  const cur = D.loc ? (D.loc.model || S.defaultModel) : S.defaultModel;
  const avail = {};
  if(D.cmp && D.cmp !== 'fail' && D.cmp.hourly){
    const single = S.compare.length === 1;
    S.compare.forEach(id => {
      const v = pick(D.cmp.hourly,'temperature_2m',id,single);
      avail[id] = !!(v && v.some(nz));
    });
  }
  $('#model-list').innerHTML = MODELS.map(m => {
    const known = avail[m.id] !== undefined;
    const ok = avail[m.id];
    return `<button class="mcard ${m.id === cur ? 'on' : ''}" data-pick="${m.id}">
      <div class="h"><span class="mdot" style="background:${m.color}"></span><b>${m.full[S.lang]}</b>
        ${m.id === cur ? '<span class="tick"><svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></span>' : ''}</div>
      <div class="org">${m.org[S.lang]}</div>
      <div class="ds">${m.ds[S.lang]}</div>
      ${known ? `<div class="st ${ok ? 'ok' : ''}">${ok ? t('avail') : t('unavail')}</div>` : ''}
    </button>`;
  }).join('');
  $$('#model-list [data-pick]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.pick;
    if(D.loc){
      D.loc.model = id; save(); hide();
      D.acc = null; D.ext = null; paintHead(); updateCard(D.loc.id); updatePin(D.loc.id);
      loadDetail();
    } else {
      S.defaultModel = id; save(); hide(); drawSettings();
    }
  }));
}

/* ---------- 13. Settings ---------- */
const UNIT_SETS = {
  temp:{icon:'<path d="M14 14.8V5a2.5 2.5 0 0 0-5 0v9.8a5 5 0 1 0 5 0z"/><path d="M11.5 9v7"/>',
        opts:[['celsius','°C'],['fahrenheit','°F']]},
  wind:{icon:'<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/>',
        opts:[['kmh','km/h'],['mph','mph'],['kn','knots'],['ms','m/s']]},
  rain:{icon:'<path d="M12 3.5S6 10.2 6 14a6 6 0 0 0 12 0c0-3.8-6-10.5-6-10.5z"/>',
        opts:[['mm','mm'],['inch','in']]}
};
function unitBlock(kind, label){
  const set = UNIT_SETS[kind];
  return `<div class="uline"><svg viewBox="0 0 24 24">${set.icon}</svg><b>${label}</b></div>
    <div class="useg">${set.opts.map(([v,l]) =>
      `<button class="${S.units[kind] === v ? 'on' : ''}" data-unit="${kind}" data-val="${v}">${l}</button>`).join('')}</div>`;
}
function drawSettings(){
  const body = $('#set-body');
  body.innerHTML = `
    <div class="group">
      <h4>${t('unitSection')}</h4>
      ${unitBlock('temp', t('tempU'))}${unitBlock('wind', t('windU'))}${unitBlock('rain', t('rainU'))}
      <div style="height:6px"></div>
    </div>
    <div class="group">
      <h4>${t('defModel')}</h4><p>${t('defModelD')}</p>
      <div class="chiprow" style="margin-bottom:8px">
        ${MODELS.map(m => `<button class="${m.id === S.defaultModel ? 'on' : ''}" data-def="${m.id}"
          style="display:inline-flex;align-items:center;gap:7px;background:${m.id === S.defaultModel ? '#fff' : 'rgba(255,255,255,.08)'};color:${m.id === S.defaultModel ? '#141b3d' : '#9aa4c8'}">
          <span class="mdot" style="background:${m.color}"></span>${m.short}</button>`).join('')}
      </div>
    </div>
    <div class="group">
      <h4>${t('cmpSection')}</h4><p>${t('cmpD')}</p>
      ${MODELS.map(m => `<div class="row">
        <span class="mdot" style="background:${m.color}"></span>
        <span class="txt"><b>${m.short}</b><small>${m.org[S.lang]}</small></span>
        <button class="check ${S.compare.includes(m.id) ? 'on' : ''}" data-cmp="${m.id}">
          <svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></button></div>`).join('')}
    </div>`;
  body.querySelectorAll('[data-unit]').forEach(b => b.addEventListener('click', () => {
    const k = b.dataset.unit;
    if(S.units[k] === b.dataset.val) return;
    S.units[k] = b.dataset.val; save(); drawSettings();
    Object.keys(cache).forEach(x => delete cache[x]);
    renderList(); refreshPins(); loadAll();
    if(D.loc && $('#detail').classList.contains('on')){ D.acc = null; D.ext = null; loadDetail(); }
  }));
  body.querySelectorAll('[data-def]').forEach(b => b.addEventListener('click', () => {
    S.defaultModel = b.dataset.def; save(); drawSettings();
  }));
  body.querySelectorAll('[data-cmp]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.cmp;
    if(S.compare.includes(id)){ if(S.compare.length > 1) S.compare = S.compare.filter(x => x !== id); }
    else S.compare = MODELS.map(m => m.id).filter(x => S.compare.includes(x) || x === id);
    save(); drawSettings();
    if(D.loc && $('#detail').classList.contains('on')){
      D.cmp = null; D.acc = null;
      /* the accuracy table is derived from the same model list, so it has to be
         thrown away and rebuilt too, not just the compare chart */
      if(D.tab !== 'compare') paintBody();
      getCompare(D.loc, S.compare).then(r => { D.cmp = r; if(D.tab === 'compare') paintBody(); })
        .catch(() => { D.cmp = 'fail'; if(D.tab === 'compare') paintBody(); });
    }
  }));
}

/* ---------- 14. Info ---------- */
const INFO = {
zh:`<h4 class="info-h">这个 App 做什么</h4>
<p class="info-p">同一个地点，全球各家气象机构给出的预报并不一样。这个 App 把它们并排画在一张图上，让你自己看差距，而不是只信一家。各家越接近，预报越可信；差距越大，越要留余地。</p>
<h4 class="info-h">四种定位方式</h4>
<ul class="info-l">
<li><b>当前位置</b>：手机 GPS 直接取点，误差一般 10–50 米。站在田里取最准。需要用 https 打开网页。</li>
<li><b>搜索城市</b>：按名字找地方，落点是市镇中心。园区离镇上远的话会有偏差。</li>
<li><b>经纬度</b>：手动输入十进制度数，最适合固定地块。南纬、西经加负号。</li>
<li><b>点地图</b>：在地图页点任意位置，直接加成地点。</li>
</ul>
<h4 class="info-h">三个分页</h4>
<ul class="info-l">
<li><b>预报</b>：主模式的实况、未来 24 小时、10 天。</li>
<li><b>对比</b>：所有勾选模式画在一张图上。按住图表左右拖，可以读出每个时刻各家的数值。</li>
<li><b>准度</b>：拿各模式前几天的逐小时气温，跟 ECMWF ERA5 再分析同一时刻的气温相比，算平均绝对误差（MAE）。数值小的那家，那几天在这个位置贴得比较近。</li>
</ul>
<h4 class="info-h">准度那一页要怎么看</h4>
<p class="info-p">对照基准是 ECMWF 的 ERA5 再分析：把全球地面站、探空气球和卫星观测同化进模式后重算出来的历史场，气象界拿它当标准参照。ERA5 有几天滞后，所以核对区间落在 7 天前到 4 天前。</p>
<p class="info-p">要留意三点。一、这是对<b>过去</b>的核对，不是对未来的保证。二、ERA5 本身也是模式产品，不是你园区里的实测值，它不能代替雨量筒和温度计。三、样本只有几十个小时，只能当参考，不能当模式排名。ERA5 读不到时，这页会自动改成「与共识的偏离」并写明——那是一致度，不是准确度。</p>
<h4 class="info-h">要注意的限制</h4>
<ul class="info-l">
<li>全球模式的格点在 9–25 公里之间，一个格点代表一大片区域，不等于你园区里的实测值。</li>
<li>热带的对流性阵雨尺度小、变化快，任何模式的降雨量都只能当参考。</li>
<li>降雨概率只有部分模式输出，所以对比图用的是降雨量，各家都有。</li>
<li>预报不是观测。要核对实际下了多少雨，还是得看园区的雨量筒。</li>
<li>App 不缓存天气数据，每次打开都重新读取。离线时只显示上一次读到的内容。</li>
</ul>`,
en:`<h4 class="info-h">What this app does</h4>
<p class="info-p">For the same spot, different national weather services produce different forecasts. This app draws them on one chart so you can see the disagreement instead of trusting a single source. When models agree, confidence is higher. When they spread apart, leave yourself more margin.</p>
<h4 class="info-h">Four ways to set a location</h4>
<ul class="info-l">
<li><b>Current location</b>: phone GPS, usually within 10–50 m. Most accurate when you stand in the field. Needs the page opened over https.</li>
<li><b>Search city</b>: finds a place by name, but lands on the town centre.</li>
<li><b>Coordinates</b>: decimal degrees, best for a fixed plot. Minus sign for south and west.</li>
<li><b>Tap the map</b>: tap anywhere on the map page to add that exact spot.</li>
</ul>
<h4 class="info-h">The three tabs</h4>
<ul class="info-l">
<li><b>Forecast</b>: current conditions, next 24 hours and 10 days from the main model.</li>
<li><b>Compare</b>: every ticked model on one chart. Drag across the chart to read each model's value at that time.</li>
<li><b>Accuracy</b>: each model's hourly temperature over recent past days against ECMWF ERA5 reanalysis at the same hour, scored as mean absolute error.</li>
</ul>
<h4 class="info-h">How to read the accuracy tab</h4>
<p class="info-p">The reference is ECMWF ERA5 reanalysis: a recomputed history of the atmosphere after assimilating surface stations, radiosondes and satellites worldwide. It is the standard reference in meteorology. ERA5 lags by a few days, so the window sits between 7 and 4 days back.</p>
<p class="info-p">Three things to keep in mind. It checks the <b>past</b> and promises nothing about the future. ERA5 is itself a model product, not a measurement at your plot, so it does not replace your rain gauge and thermometer. And a sample of a few dozen hours is indicative, not a ranking. If ERA5 cannot be read, the tab falls back to distance from the multi-model consensus and says so — that is agreement, not accuracy.</p>
<h4 class="info-h">Limits worth knowing</h4>
<ul class="info-l">
<li>Global models run on 9–25 km grid cells. One cell covers a wide area and is not a measurement at your plot.</li>
<li>Tropical convective showers are small and fast. Rainfall totals from any model are indicative only.</li>
<li>Rain probability is produced by only some models, so the compare chart uses rainfall, which all models report.</li>
<li>A forecast is not an observation. To know what actually fell, read your rain gauge.</li>
<li>The app never caches weather data. Each open re-reads it. Offline, you see the last data that loaded.</li>
</ul>`,
ms:`<h4 class="info-h">Apa aplikasi ini buat</h4>
<p class="info-p">Untuk tempat yang sama, agensi cuaca berbeza memberi ramalan berbeza. Aplikasi ini melukis semuanya dalam satu carta supaya anda nampak jurangnya, bukan hanya percaya satu sumber. Bila model sepakat, keyakinan lebih tinggi. Bila jurang lebar, beri lebih ruang dalam perancangan.</p>
<h4 class="info-h">Empat cara tetapkan lokasi</h4>
<ul class="info-l">
<li><b>Lokasi semasa</b>: GPS telefon, biasanya 10–50 m. Paling tepat bila anda berdiri di ladang. Perlu halaman dibuka melalui https.</li>
<li><b>Cari bandar</b>: cari ikut nama, tetapi jatuh di pusat pekan.</li>
<li><b>Koordinat</b>: darjah perpuluhan, sesuai untuk petak tetap. Tanda tolak untuk selatan dan barat.</li>
<li><b>Ketik peta</b>: ketik mana-mana tempat pada halaman peta.</li>
</ul>
<h4 class="info-h">Tiga tab</h4>
<ul class="info-l">
<li><b>Ramalan</b>: keadaan semasa, 24 jam dan 10 hari akan datang daripada model utama.</li>
<li><b>Banding</b>: semua model bertanda dalam satu carta. Seret pada carta untuk baca nilai setiap model.</li>
<li><b>Ketepatan</b>: suhu setiap jam bagi setiap model untuk beberapa hari lepas berbanding analisis semula ERA5 ECMWF pada jam yang sama, dikira sebagai ralat mutlak purata.</li>
</ul>
<h4 class="info-h">Cara baca tab ketepatan</h4>
<p class="info-p">Rujukannya ialah analisis semula ERA5 ECMWF: sejarah atmosfera yang dikira semula selepas mengasimilasi stesen permukaan, belon radiosonde dan satelit seluruh dunia. Ia rujukan piawai dalam meteorologi. ERA5 lewat beberapa hari, jadi tempoh semakan berada antara 7 hingga 4 hari lepas.</p>
<p class="info-p">Tiga perkara. Ia menyemak masa <b>lepas</b>, bukan jaminan masa depan. ERA5 sendiri produk model, bukan ukuran di petak anda, jadi ia tidak ganti tolok hujan dan termometer. Sampel beberapa puluh jam hanya panduan, bukan kedudukan rasmi. Jika ERA5 tidak dapat dibaca, tab ini beralih kepada jarak dari konsensus dan menyatakannya — itu persetujuan, bukan ketepatan.</p>
<h4 class="info-h">Had yang perlu diingat</h4>
<ul class="info-l">
<li>Model global guna sel grid 9–25 km. Satu sel meliputi kawasan luas, bukan ukuran di petak anda.</li>
<li>Hujan perolakan tropika kecil dan cepat berubah. Jumlah hujan hanya panduan.</li>
<li>Peluang hujan hanya dikeluarkan sebahagian model, jadi carta banding guna jumlah hujan.</li>
<li>Ramalan bukan cerapan. Untuk tahu jumlah sebenar, baca tolok hujan anda.</li>
<li>Aplikasi tidak menyimpan cache data cuaca. Setiap kali dibuka ia baca semula.</li>
</ul>`};
const SOURCES = [
  {n:'Open-Meteo', d:{zh:'预报 API · 8 个模式 · 城市地理编码',en:'Forecast API · 8 models · geocoding',ms:'API ramalan · 8 model · geokod'}, u:'https://open-meteo.com/'},
  {n:'ECMWF ERA5', d:{zh:'再分析资料 · 准度核对的对照基准',en:'Reanalysis · reference for the accuracy check',ms:'Analisis semula · rujukan semakan ketepatan'}, u:'https://climate.copernicus.eu/climate-reanalysis'},
  {n:'ECMWF IFS', d:{zh:'欧洲中期天气预报中心 · 开放数据 CC-BY 4.0',en:'ECMWF open data · CC-BY 4.0',ms:'Data terbuka ECMWF · CC-BY 4.0'}, u:'https://www.ecmwf.int/'},
  {n:'NOAA GFS', d:{zh:'美国国家海洋和大气管理局',en:'US National Oceanic and Atmospheric Administration',ms:'NOAA Amerika Syarikat'}, u:'https://www.noaa.gov/'},
  {n:'DWD ICON', d:{zh:'德国气象局',en:'Deutscher Wetterdienst, Germany',ms:'Perkhidmatan Cuaca Jerman'}, u:'https://www.dwd.de/'},
  {n:'ECCC GEM', d:{zh:'加拿大环境部',en:'Environment and Climate Change Canada',ms:'Alam Sekitar Kanada'}, u:'https://weather.gc.ca/'},
  {n:'Météo-France ARPEGE', d:{zh:'法国气象局',en:'Météo-France',ms:'Météo-France'}, u:'https://meteofrance.com/'},
  {n:'JMA', d:{zh:'日本气象厅',en:'Japan Meteorological Agency',ms:'Agensi Meteorologi Jepun'}, u:'https://www.jma.go.jp/'},
  {n:'UKMO', d:{zh:'英国气象局',en:'UK Met Office',ms:'Met Office UK'}, u:'https://www.metoffice.gov.uk/'},
  {n:'OpenStreetMap · CARTO', d:{zh:'地图底图 · ODbL',en:'Map tiles · ODbL',ms:'Jubin peta · ODbL'}, u:'https://www.openstreetmap.org/copyright'}
];
function drawInfo(){
  $('#info-body').innerHTML = INFO[S.lang] + `
    <div class="group" style="margin-top:22px"><h4>${t('dataSrc')}</h4>
      ${SOURCES.map(s => `<a class="src" href="${s.u}" target="_blank" rel="noopener">
        <span style="flex:1"><b>${s.n}</b><small>${s.d[S.lang]}</small></span><span class="go">↗</span></a>`).join('')}
    </div>
    <div class="group"><h4>${t('about')}</h4><p style="margin-bottom:10px">${t('app')} · ${t('version')}</p></div>`;
}

/* ---------- 15. Tabs, language, boot ---------- */
function setTab(which){
  const s = which === 'saved';
  $('#tab-saved').classList.toggle('on', s);
  $('#tab-map').classList.toggle('on', !s);
  $('#pane-saved').classList.toggle('on', s);
  $('#pane-map').classList.toggle('on', !s);
  $('#app-sub').textContent = s ? t('subSaved') : t('subMap');
  if(s && map && tapMarker){          // leaving the map: drop the pending pin
    map.removeLayer(tapMarker); tapMarker = null;
    $('#map-foot').textContent = t('mapHint');
  }
  if(!s) initMap();
}
$('#tab-saved').addEventListener('click', () => setTab('saved'));
$('#tab-map').addEventListener('click', () => setTab('map'));
$('#btn-info').addEventListener('click', () => { drawInfo(); show('#sheet-info'); });
$('#btn-set').addEventListener('click', () => { drawSettings(); show('#sheet-set'); });
$('#btn-lang').addEventListener('click', e => { e.stopPropagation(); $('#lang-menu').classList.toggle('on'); });
document.addEventListener('click', () => $('#lang-menu').classList.remove('on'));
$$('#lang-menu [data-lang]').forEach(b => b.addEventListener('click', () => {
  S.lang = b.dataset.lang; save(); applyLang(); $('#lang-menu').classList.remove('on');
}));

function applyLang(){
  document.documentElement.lang = S.lang;
  $('#btn-lang').textContent = {zh:'中', en:'EN', ms:'BM'}[S.lang];
  $('#app-name').textContent = t('app');
  document.title = `${t('app')} · Predict Weather`;
  $('#app-sub').textContent = $('#pane-saved').classList.contains('on') ? t('subSaved') : t('subMap');
  $$('[data-t]').forEach(n => n.textContent = t(n.dataset.t));
  $('#q').placeholder = t('searchPh');
  $('#m-name').placeholder = t('namePh');
  $$('#lang-menu [data-lang]').forEach(b => b.classList.toggle('on', b.dataset.lang === S.lang));
  if(!$('#q').value) $('#q-out').innerHTML = `<p class="searching">${t('searchEmpty')}</p>`;
  renderList(); refreshPins();
  if(map) $('#map-foot').textContent = t('mapHint');
  drawBasemapSwitch();
  if(openSheetId === '#sheet-info') drawInfo();
  if(openSheetId === '#sheet-set') drawSettings();
  if(openSheetId === '#sheet-model') drawModelPicker();
  if($('#detail').classList.contains('on')){ paintHead(); paintBody(); }
}

window.addEventListener('online', () => { loadAll(); });
window.addEventListener('offline', () => toast(t('offline')));
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if(D.tab === 'compare' && D.cmp && D.cmp !== 'fail' && $('#detail').classList.contains('on')) buildChart();
  }, 160);
});
window.addEventListener('popstate', () => {
  if(openSheetId){ closeSheetNow(); return; }
  if($('#detail').classList.contains('on')) closeDetail();
});

(async function boot(){
  const saved = await store.get(KEY);
  if(saved) S = Object.assign(S, saved);
  if(!Array.isArray(S.locations)) S.locations = [];
  if(!Array.isArray(S.compare) || !S.compare.length) S.compare = MODELS.map(m => m.id);
  S.compare = S.compare.filter(id => MODELS.some(m => m.id === id));
  if(!MODELS.some(m => m.id === S.defaultModel)) S.defaultModel = 'best_match';
  const OK = {temp:['celsius','fahrenheit'], wind:['kmh','mph','kn','ms'], rain:['mm','inch']};
  const FB = {temp:'celsius', wind:'kmh', rain:'mm'};
  S.units = S.units || {};
  Object.keys(OK).forEach(k => { if(!OK[k].includes(S.units[k])) S.units[k] = FB[k]; });
  if(!T[S.lang]) S.lang = 'zh';
  if(!BASEMAPS[S.basemap]) S.basemap = 'sat';
  applyLang();
  renderList();
  loadAll();
  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    const reg = () => navigator.serviceWorker.register('sw.js').catch(() => {});
    if(document.readyState === 'complete') reg();
    else window.addEventListener('load', reg);
  }
})();
