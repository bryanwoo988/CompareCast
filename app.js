/* =====================================================================
   天气预测 · Predict Weather · Ramalan Cuaca
   Data: Open-Meteo forecast, geocoding and ERA5 archive APIs (CORS-enabled)
   ===================================================================== */
'use strict';

/* ---------- 1. Models (Open-Meteo model ids) ---------- */
/* Shown in About, and kept equal to sw.js's VERSION by tests/version.test.js.
   The old hardcoded "2.0" never moved, so the one place a user looks to check
   whether an update landed was the one place that could not tell them. */
const APP_VERSION = '3.21.1';

/* What changed, per release.

   Newest first. tests/releases.test.js fails the build if APP_VERSION has no
   entry here or the order slips, so a release cannot quietly ship without
   telling the user what it did. */
const RELEASES = [
  {v:'3.21.1',
   zh:['拿掉了下雨、太阳、云和星星的背景动画，比较省电；每种天气的背景颜色照旧，启动画面也保留'],
   en:['Removed the rain, sun, cloud and star background animations to save battery; each weather keeps its background colour, and the splash screen stays'],
   ms:['Animasi latar hujan, matahari, awan dan bintang dibuang untuk menjimatkan bateri; warna latar setiap cuaca kekal, dan skrin pembuka dikekalkan']},
  {v:'3.21.0',
   zh:['以后更新不用清缓存、也不用关掉重开：刚打开或回到 App 时自动换成新版本，并回到你原来那一页；正在操作时只在底部提示，不会打断你',
       '打开 App 时有启动画面',
       '「关于」里加了 Created by Bryan Woo 和二维码：别人扫一下就能用手机浏览器直接打开这个 App，也可以直接分享链接'],
   en:['Updates no longer need a cleared cache or a close-and-reopen: the app switches to the new version when it is opened or brought back, and returns you to the page you were on; while you are busy it only offers the update at the bottom, without interrupting',
       'A splash screen when the app opens',
       'About now shows Created by Bryan Woo and a QR code: anyone can scan it to open the app straight in a phone browser, or you can share the link'],
   ms:['Kemas kini tidak lagi perlu cache dikosongkan atau aplikasi ditutup dan dibuka semula: aplikasi bertukar ke versi baharu apabila dibuka atau dikembalikan, dan membawa anda kembali ke halaman tadi; semasa anda sibuk ia hanya menawarkan kemas kini di bawah tanpa mengganggu',
       'Skrin pembuka apabila aplikasi dibuka',
       'Perihal kini memaparkan Created by Bryan Woo dan kod QR: sesiapa boleh mengimbasnya untuk membuka aplikasi terus dalam pelayar telefon, atau anda boleh berkongsi pautan']},
  {v:'3.20.0',
   zh:['地块多的时候，提醒改成紧凑排版：按条件分组、一行放好几个地块、最严重的排最前面，弹出来就能看到最要紧的',
       '「每天摘要」的提醒把降雨机率最高的地块排最前面，标题直接写出最高值',
       '点开提醒会进到 App 里的一页，列出这条提醒涵盖的每个地块和完整数字，点任何一个地块就能进去看'],
   en:['With many locations, reminders are now compact: grouped by limit, several locations to a line, worst first, so the banner shows what matters most',
       'Daily summary reminders put the wettest location first and show the peak in the title',
       'Tapping a reminder opens a page in the app listing every location it covers with the full figures; tap any one to open it'],
   ms:['Dengan banyak lokasi, peringatan kini padat: dikumpul mengikut had, beberapa lokasi sebaris, paling teruk dahulu, jadi sepanduk menunjukkan yang paling penting',
       'Peringatan ringkasan harian meletakkan lokasi paling basah di hadapan dan menunjukkan nilai tertinggi dalam tajuk',
       'Mengetik peringatan membuka halaman dalam aplikasi yang menyenaraikan setiap lokasi berserta angka penuh; ketik mana-mana untuk membukanya']},
  {v:'3.19.0',
   zh:['「模式准度」改成真正的预报准度：比较各模式提前 1 天、提前 3 天的预报。以前量到的是起始分析，会把排名排错——在吉隆坡，旧方法排第一的 ECMWF，真正的提前 1 天预报只排第三',
       '每张卡和详情页都写着「更新于几点」；超过三小时的数据会变灰并写明多久以前。App 回到前台时，超过半小时的数据会自动重新读取',
       '切换单位或模式时，慢回来的旧数据不会再盖掉新数据（例如卡片卡在 30° 而不是 86°F）',
       '某个模式在这天没有数据、或只有部分小时时，图表下面会写明；模式之间的差异只用完整一天来比',
       '存储的资料有一笔坏掉时，App 照样能打开，好的地块都还在',
       '地图函式库改成打开地图时才载入，列表更快出来；载入失败会提示并可重试',
       '第一次打开时先选语言；可以放大缩小画面；灰色小字更清楚；按钮更好按',
       '改名时打的字不会被刷新吃掉；两个分页同时开着不会互相覆盖；存储失败会提示'],
   en:['\u201cModel accuracy\u201d now measures real forecasts, made 1 and 3 days ahead. It used to measure starting analyses and could rank models wrongly \u2014 in Kuala Lumpur the old method put ECMWF first, while in real 1-day forecasts it came third',
       'Every card and the detail page say when they were updated; data older than three hours is greyed and says how old. Coming back to the app re-reads anything older than half an hour',
       'Changing units or model can no longer leave an older reply on screen (e.g. a card stuck on 30\u00b0 instead of 86\u00b0F)',
       'The chart says when a model has no data, or only part of the day; the spread between models uses full days only',
       'A damaged entry in saved data no longer stops the app from opening, and the good locations are all still there',
       'The map library loads when the map is opened, so the list appears sooner; if it fails to load you are told and can retry',
       'Choose your language on first launch; pinch-zoom works; dim text is easier to read; buttons are easier to tap',
       'Typing in the rename box is no longer wiped by a refresh; two open tabs no longer overwrite each other; a failed save is reported'],
   ms:['\u201cKetepatan model\u201d kini mengukur ramalan sebenar, dibuat 1 dan 3 hari lebih awal. Dahulu ia mengukur analisis permulaan dan boleh menyusun model dengan salah \u2014 di Kuala Lumpur kaedah lama meletakkan ECMWF di tempat pertama, sedangkan dalam ramalan 1 hari sebenar ia ketiga',
       'Setiap kad dan halaman butiran menyatakan masa kemas kini; data lebih tiga jam dikelabukan dan dinyatakan umurnya. Kembali ke aplikasi membaca semula data lebih setengah jam',
       'Menukar unit atau model tidak lagi meninggalkan jawapan lama di skrin (cth. kad tersekat pada 30\u00b0 bukannya 86\u00b0F)',
       'Carta menyatakan apabila sesuatu model tiada data atau hanya sebahagian hari; perbezaan antara model menggunakan hari penuh sahaja',
       'Satu entri rosak dalam data tersimpan tidak lagi menghalang aplikasi dibuka, dan lokasi yang baik masih ada',
       'Pustaka peta dimuatkan apabila peta dibuka, jadi senarai muncul lebih cepat; jika gagal, anda diberitahu dan boleh cuba lagi',
       'Pilih bahasa semasa pelancaran pertama; zum cubit berfungsi; teks malap lebih jelas; butang lebih mudah ditekan',
       'Teks dalam kotak nama tidak lagi hilang semasa segar semula; dua tab tidak lagi menulis ganti satu sama lain; kegagalan simpan dimaklumkan']},
  {v:'3.18.0',
   zh:['跨午夜的提醒时段（例如 22:00–02:00）现在读的是当晚到次日凌晨那几个小时。以前会读错小时',
       '把某个地块用到的时段全部关掉后，服务器上的旧提醒会一并撤掉。以前旧排程会留着继续发',
       '一小时内都取不到某地块的预报时，会发一条「暂时查不到预报」，不再沉默——沉默容易被当成没事',
       '只讲一个地块的提醒，点开会直接打开那个地块',
       '提醒设置页写明了：提醒里的数字用的是每个地块自己选的模式',
       '没有 randomUUID 的旧手机，以前永远登记不上提醒，现在可以了',
       '同步失败会自动重试几次；服务器端也更严格地检查推送密钥'],
   en:['Reminder windows that cross midnight (e.g. 22:00\u201302:00) now read that evening and the early hours after it; they used to read the wrong hours',
       'Switching off every window a location uses now withdraws its reminders from the server; the old schedule used to stay and keep sending',
       'If a location\u2019s forecast cannot be fetched for a whole hour, a \u201cforecast unavailable\u201d notice is sent instead of silence, which could be mistaken for all clear',
       'A reminder about a single location opens that location when tapped',
       'The reminder page now says that reminder figures use each location\u2019s own model',
       'Older phones without randomUUID could never register for reminders; now they can',
       'Failed syncs retry a few times on their own, and the server checks push keys more strictly'],
   ms:['Tempoh peringatan yang merentasi tengah malam (cth. 22:00\u201302:00) kini membaca malam itu dan awal pagi selepasnya; dahulu ia membaca jam yang salah',
       'Mematikan semua tempoh yang digunakan sesuatu lokasi kini menarik balik peringatannya dari pelayan; jadual lama dahulu kekal dan terus menghantar',
       'Jika ramalan sesuatu lokasi tidak dapat diperoleh selama sejam, notis \u201cramalan tidak dapat diperoleh\u201d dihantar, bukan diam',
       'Peringatan tentang satu lokasi membuka lokasi itu apabila diketik',
       'Halaman peringatan kini menyatakan angka peringatan menggunakan model setiap lokasi',
       'Telefon lama tanpa randomUUID tidak pernah dapat mendaftar; kini boleh',
       'Penyegerakan yang gagal dicuba semula beberapa kali, dan pelayan menyemak kunci push dengan lebih ketat']},
  {v:'3.17.0',
   zh:['同一时段的提醒合成一条通知，列出所有地块。以前每个地块各发一条，而且会互相覆盖——十个地块只看得到最后一个',
       '晚上设的提醒现在讲的是接下来的时段。以前晚上九点提醒「早上时段」，报的是当天已经过去的那个早上',
       '提醒发送失败（网络或服务器一时不通）会在一小时内自动补发，不再当天直接丢掉',
       '提醒里的数字跟 App 对得上：地块选了哪个模式，提醒就用哪个模式；降雨机率照旧来自 Best Match',
       '服务器加了防护：只接受真正的推送服务，限制请求大小和设备数量',
       '更新下载不完整时，不会再把离线版本弄坏'],
   en:['Reminders for the same window now arrive as one notification listing every location. Each location used to get its own, and they replaced each other \u2014 with ten locations you only saw the last one',
       'An evening reminder now describes the window still ahead. A 9 pm reminder for the morning window used to report the morning that had already gone',
       'A reminder that fails to send (network or server hiccup) is retried for up to an hour instead of being lost for the day',
       'Reminder figures match the app: each location uses the model it is set to, with chance of rain still from Best Match',
       'The server now accepts only real push services and limits request size and device count',
       'An incomplete update download can no longer break the offline copy'],
   ms:['Peringatan untuk tempoh yang sama kini tiba sebagai satu pemberitahuan yang menyenaraikan semua lokasi. Dahulu setiap lokasi mendapat satu, dan ia saling menggantikan \u2014 dengan sepuluh lokasi anda hanya nampak yang terakhir',
       'Peringatan waktu malam kini menerangkan tempoh yang akan datang. Dahulu peringatan jam 9 malam untuk tempoh pagi melaporkan pagi yang sudah berlalu',
       'Peringatan yang gagal dihantar dicuba semula sehingga sejam, tidak lagi hilang untuk hari itu',
       'Angka dalam peringatan sepadan dengan aplikasi: setiap lokasi guna model yang ditetapkan, kebarangkalian hujan masih dari Best Match',
       'Pelayan kini hanya menerima perkhidmatan push sebenar dan mengehadkan saiz permintaan serta bilangan peranti',
       'Muat turun kemas kini yang tidak lengkap tidak lagi merosakkan salinan luar talian']},
  {v:'3.16.1',
   zh:['修好设置页滑不顺：在弹层里往下滑会被误判成下拉刷新，刷新逻辑再把弹层自己的滚动挡掉。现在弹层和覆盖页一律不触发下拉刷新',
       '全 App 的滚动更顺了：挡滚动的监听器以前一直挂着，现在只在真的在拖动或下拉时才挂',
       '修好今天那句白话结论说错话：它只看当前时间之后，却写「全天无雨」——明明早上下过 1.1mm。现在写「接下来降雨机率低」',
       '「无雨」改成「降雨机率低」：机率 49% 也会被判成这一类，说死了不负责任',
       '降雨那一页加了一行说明：柱子是所选模式的雨量，百分比来自 Best Match',
       '排版页拖动结束时不会再误触到那一行的开关'],
   en:['Fixed the settings page scrolling badly: a downward swipe inside a sheet was read as a pull-to-refresh, and the refresh logic then blocked the sheet\u2019s own scroll. Sheets and overlay pages no longer arm the pull',
       'Scrolling is smoother everywhere: the listener that blocks scrolling used to stay attached at all times, and is now attached only while a drag or pull is actually running',
       'Fixed today\u2019s plain-language line contradicting the page: it only looks at the hours ahead but said \u201cno rain all day\u201d with 1.1 mm already fallen. It now says \u201clow chance from here on\u201d',
       '\u201cNo rain\u201d became \u201clow chance of rain\u201d \u2014 a 49% hour landed in that branch, and stating it as a fact was not honest',
       'The precipitation view now says where its two numbers come from: bars are the selected model\u2019s amounts, percentages are Best Match',
       'Ending a drag in the layout editor no longer flips that row\u2019s switch'],
   ms:['Membaiki halaman tetapan yang sukar diskrol: leretan ke bawah dalam helaian disalahanggap sebagai tarik-untuk-muat-semula, dan logik itu menyekat skrol helaian itu sendiri',
       'Skrol lebih lancar di seluruh aplikasi: pendengar yang menyekat skrol kini dipasang hanya semasa seretan atau tarikan benar-benar berjalan',
       'Membaiki ayat ringkas hari ini yang bercanggah: ia hanya melihat jam di hadapan tetapi menulis \u201ctiada hujan sepanjang hari\u201d sedangkan 1.1 mm sudah turun',
       '\u201cTiada hujan\u201d ditukar kepada \u201ckebarangkalian hujan rendah\u201d',
       'Paparan hujan kini menyatakan sumber kedua-dua nombornya',
       'Menamatkan seretan dalam penyunting susunan tidak lagi menogol suis baris itu']},
  {v:'3.16.0',
   zh:['详情页现在可以自己排版：设置 → 详情页排版，长按一行拖动排序，右边的开关决定显示或隐藏',
       '喷药看风、收成看雨——把你最常看的那块拖到最上面就好，不用每次滑到下面去找',
       '可排的有八块：一句白话结论、实况、十天、数据卡片、当天数据格、气温对比图、降雨概率图、准确度',
       '顶部的温度和日期条固定不动，所以不管怎么排都不会卡在某一天出不来',
       '以后新增的卡片会自动出现在你的排版里，不用重排'],
   en:['The detail page can be rearranged: Settings \u2192 Detail page layout. Press and hold a row to drag it; the switch on the right shows or hides that section',
       'Spraying wants wind, harvesting wants rain \u2014 put the section you actually open the page for at the top instead of scrolling to it',
       'Eight sections can be moved: the plain-language line, Conditions, ten days, data cards, day figures, the temperature comparison, the rain chance chart, accuracy',
       'The temperature header and the date strip stay fixed, so no arrangement can strand you on one day',
       'Sections added in later releases appear in your arrangement on their own \u2014 no need to redo it']},
  {v:'3.15.1',
   zh:['十天卡片挪到实况卡片正下方，跟 iPhone 一样——小时和十天是同一个问题的两个尺度，本来就该连着看；数据格子和对比图往下挪'],
   en:['The ten-day card now sits directly under the Conditions card, the way iPhone has it \u2014 hours and days are the same question at two scales, so they belong together; the data cards and comparison charts moved down'],
   ms:['Kad sepuluh hari kini betul-betul di bawah kad Keadaan, sama seperti iPhone \u2014 jam dan hari ialah soalan sama pada dua skala; kad data dan graf perbandingan turun ke bawah']},
  {v:'3.15.0',
   zh:['切到水滴，小时条变成降雨强度柱：柱高就是雨量，全天同一把尺，底下是降雨机率',
       '切到风，小时条变成一条贯穿全天的风速曲线，现在之前虚线、现在一个圆点，浅色带是阵风',
       '每小时的风向箭头现在是真的风向，按当时风往哪吹转',
       '气温页不再显示降雨百分比（那是降雨页的事）',
       '十天列表跟着切换：降雨看当天逐时柱状 + 总雨量 + 机率，风看曲线 + 风速范围',
       '十天那个「未来 10 天」标题拿掉了，十行日期本来就说得清楚'],
   en:['The droplet tab turns the hourly strip into precipitation bars \u2014 bar height is the amount, one scale for the whole day, chance of rain underneath',
       'The wind tab turns it into one speed line across the day: dashed before now, a dot at now, a lighter band for gusts',
       'The hourly wind arrows now show the real direction for that hour',
       'The temperature tab no longer prints rain percentages \u2014 those belong to the rain tab',
       'The ten-day list follows the same switch: hourly bars + total + chance for rain, a line + a speed range for wind',
       'Dropped the \u201cNext 10 days\u201d heading; ten dated rows already say it']},
  {v:'3.14.0',
   zh:['详情页重新排序，学 iOS 天气：实况小时条排在前面，十天概览接着，多模式对比图挪到下面',
       '实况卡片加了气温 / 降雨 / 风速三个切换，按一下就看接下来每小时的那一项',
       '风速视图的每小时图标换成风向箭头'],
   en:['The detail page follows iOS Weather\u2019s order now: the hourly Conditions card first, the ten-day list next, the model-comparison charts moved further down',
       'The Conditions card has temperature / precipitation / wind toggles \u2014 tap one to read that metric hour by hour',
       'On the wind view each hour shows a direction arrow instead of a weather icon']},
  {v:'3.13.1',
   zh:['风向与气压两张卡片重做：密齿刻度环，风向用「来向圆点 + 去向箭头」，四个方位都标'],
   en:['Rebuilt the wind and pressure cards: a proper tick ring, wind shown as a dot for where it comes from and an arrow for where it goes'],
   ms:['Kad angin dan tekanan dibina semula: cincin penanda sebenar, angin ditunjuk dengan titik arah datang dan anak panah arah tuju']},
  {v:'3.13.0',
   zh:['详情页顶部加了一句白话结论，例如「下午有雨，最高 86%」——不用自己从一堆数字里推',
       '数据格子改成卡片：风向罗盘、气压表盘、日出日落弧线、紫外线色阶条',
       '加回十天概览，而且现在可以点，点哪天就看哪天',
       '补上能见度与露点'],
   en:['A plain-language line at the top of the detail page, e.g. "Rain in the afternoon, peaking at 86%"',
       'The data cells became cards: a wind compass, a pressure dial, a sunrise arc, a UV scale',
       'The ten-day overview is back, and tapping a row now selects that day',
       'Added visibility and dew point'],
   ms:['Satu baris kesimpulan di atas halaman perincian, contoh "Hujan petang, tertinggi 86%"',
       'Sel data menjadi kad: kompas angin, tolok tekanan, lengkung matahari, skala UV',
       'Gambaran sepuluh hari kembali, dan mengetik baris kini memilih hari itu',
       'Menambah penglihatan dan takat embun']},
  {v:'3.12.0',
   zh:['修好「当前实况」里降雨概率和紫外线显示全天最高值的问题——晚上九点不会再写着 100% 下雨、紫外线 9',
       '其他日期的这两格改称「最高降雨概率」「最高紫外线」，说清楚是全天值'],
   en:['Fixed rain chance and UV under "Right now" showing the whole day\u2019s peak — 9pm no longer claims 100% rain and UV 9',
       'On other days those two now read "Peak rain chance" and "Peak UV", so it is clear they are daily figures'],
   ms:['Membaiki peluang hujan dan UV di bawah "Sekarang" yang memaparkan nilai tertinggi harian',
       'Pada hari lain kedua-duanya kini "Peluang hujan tertinggi" dan "UV tertinggi"']},
  {v:'3.11.1',
   zh:['修好了一处会让离线与通知一起失效的隐患', '清掉 66 条没人用的旧文案，应用包更小'],
   en:['Fixed a fault that could have taken offline support and notifications down together',
       'Removed 66 unused strings, so the app downloads smaller'],
   ms:['Membaiki kelemahan yang boleh melumpuhkan sokongan luar talian dan pemberitahuan sekali gus',
       'Membuang 66 teks tidak terpakai, jadi aplikasi lebih kecil']},
  {v:'3.11.0',
   zh:['详情页加了天气动画：下雨会下雨、阴天有云飘、晴天有阳光、夜晚有星星',
       '晴天以前没有专属配色，现在有了'],
   en:['The detail page now animates the weather: rain falls, clouds drift, sun glows, stars twinkle',
       'Clear days finally have their own colour scheme'],
   ms:['Halaman perincian kini beranimasi mengikut cuaca: hujan turun, awan hanyut, matahari bersinar, bintang berkelip',
       'Hari cerah kini ada skema warna tersendiri']},
  {v:'3.10.0',
   zh:['更新现在开一次就到位，不用再开两次'],
   en:['Updates now land on the first launch instead of the second'],
   ms:['Kemas kini kini tiba pada lancaran pertama, bukan kedua']},
  {v:'3.9.0',
   zh:['更新后会弹出这张说明，告诉你这一版改了什么',
       '修好了设定提醒时间时，时间选择器会自己收起来的问题',
       '修好了拖动排序时，后台刷新会让拖拽失效的问题',
       '一个地块都没勾时不再报错，改为提示你去勾一个',
       '从设定进通知页后，返回键现在能正常退回'],
   en:['This panel now appears after an update, listing what changed',
       'Fixed the time picker closing by itself while setting a reminder time',
       'Fixed drag-to-reorder silently failing when a background refresh landed',
       'Ticking no locations no longer shows an error — it explains what to do',
       'The back button now works after opening reminders from settings'],
   ms:['Panel ini kini muncul selepas kemas kini, menyenaraikan apa yang berubah',
       'Pemilih masa tidak lagi tertutup sendiri semasa menetapkan masa peringatan',
       'Susun-seret tidak lagi gagal senyap apabila muat semula latar tiba',
       'Tiada lokasi ditanda tidak lagi dipaparkan sebagai ralat',
       'Butang kembali kini berfungsi selepas membuka peringatan dari tetapan']},
  {v:'3.8.0',
   zh:['通知登记状态不再谎报成功，失败会说明原因', '登记失败后会自动重试'],
   en:['Reminder registration no longer claims success when it failed, and says why',
       'A failed registration now retries by itself'],
   ms:['Pendaftaran peringatan tidak lagi mendakwa berjaya apabila gagal',
       'Pendaftaran yang gagal kini mencuba semula sendiri']},
  {v:'3.7.0',
   zh:['提醒改用地块所在时区，「早上 6 点」指的是田里的 6 点', '「关于」里的版本号现在是真的'],
   en:['Reminders follow each location\u2019s own time zone', 'The version in About is now the real one'],
   ms:['Peringatan mengikut zon waktu lokasi itu sendiri', 'Versi dalam Perihal kini yang sebenar']},
  {v:'3.6.0',
   zh:['天气提醒上线：按时段、按地块推送'],
   en:['Weather reminders are live: per time window, per location'],
   ms:['Peringatan cuaca kini aktif: ikut tempoh masa dan lokasi']},
  {v:'3.3.0',
   zh:['下拉刷新，并会顺带检查有没有新版本'],
   en:['Pull to refresh, which also checks for a new version'],
   ms:['Tarik untuk muat semula, sekali gus menyemak versi baharu']},
  {v:'3.2.0',
   zh:['长按地点可拖动排序，排最前的成为地图默认视角'],
   en:['Hold a location to drag it into order; the first becomes the map\u2019s default view'],
   ms:['Tekan dan tahan lokasi untuk menyusunnya']},
  {v:'3.1.0',
   zh:['地图加了定位、加点与地名搜索', '修好了地图手势与页面滚动打架'],
   en:['The map gained locate, add and place search', 'Fixed map gestures fighting page scroll'],
   ms:['Peta kini ada cari lokasi, tambah dan carian tempat']},
  {v:'3.0.0',
   zh:['详情页改为按日期组织，图表可触摸查值'],
   en:['The detail page is organised by date, with touch-readable charts'],
   ms:['Halaman perincian disusun mengikut tarikh']}
];

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
  dragHint:'长按地点可拖动排序，排在最前的会成为地图的默认视角',
  sumRain:(p,pk)=>`${p}有雨，最高 ${pk}%`, sumShowers:(p,pk)=>`${p}可能有零星阵雨，最高 ${pk}%`,
  sumHot:(t)=>`全天降雨机率低，最高 ${t}`, sumCalm:'全天降雨机率低', sumUnknown:'暂无足够数据',
  sumHotRest:(t)=>`接下来降雨机率低，最高 ${t}`, sumCalmRest:'接下来降雨机率低',
  pNight:'凌晨', pMorning:'早上', pAfternoon:'下午', pEvening:'晚上',
  condT:'实况', vRain:'降雨', vWind:'风速', sInten:'强度', sChance:'降雨机率',
  lyEntry:'详情页排版', lyDesc:'长按一行拖动排序，右边的开关决定显示或隐藏。顶部的温度和日期条固定不动。',
  lySummary:'一句白话结论', lyTenday:'十天', lyCards:'数据卡片', lyCells:'当天数据格',
  lyChartT:'气温对比图', lyChartP:'降雨概率图', lyAccuracy:'准确度',
  lyChipNote:'模式选择在这张卡里。藏起来之后，改对比模式要来设置这边。',
  lyReset:'恢复默认排版', lyHidden:'已隐藏', lyAllHidden:'中间的区块全部藏起来了，详情页只剩顶部和底部。',
  lyOn:'显示', lyOff:'隐藏',
  lyDefault:'默认', lyCustom:'已自定义', lyHiddenN:n => `已自定义 · 藏了 ${n} 项`,
  srcRain:'雨量柱来自所选模式；降雨机率来自 Best Match，因为只有它每个地点都有这一项。',
  cWind:'风', cPress:'气压', cSun:'日出日落', cUV:'紫外线', cHumid:'湿度', cVis:'能见度', cRain:'降雨',
  dewPoint:(v)=>`露点 ${v}`, visClear:'视野通透', visOk:'一般', visPoor:'有雾或霾',
  uvLow:'低', uvMid:'中等', uvHigh:'高', uvVeryHigh:'很高', uvExtreme:'极高',
  pressLow:'低', pressHigh:'高', today:'今天',
  ntEntry:'通知提醒', ntOff:'未开启', ntSummary:(b,w)=>`${b} 个地块 · ${w} 个时段`,
  ntMaster:'启用提醒', ntWindows:'时段', ntRules:'提醒条件', ntBlocks:'地块',
  wMorning:'早上', wAfternoon:'下午', wEvening:'晚上', wNight:'凌晨',
  ntFrom:'起', ntTo:'止', ntAt:'提醒时间', ntCross:'此时段跨天',
  ntTzNote:(z)=>`时间按地块所在时区计算（${z}）`,
  ntModelNote:'提醒里的温度、雨量和风，用的是每个地块自己选的模式；降雨机率来自 Best Match，跟详情页一样。',
  qrCap:'扫描二维码，就能用手机浏览器直接打开这个 App', qrAlt:'打开这个 App 的二维码', shareApp:'分享 App 链接', shareText:'多模式天气对比，按地块发提醒', linkCopied:'链接已复制',
  updReady:(v)=>`新版本 ${v} 已准备好`, updNow:'立即更新', updLater:'稍后',
  noticeAt:(w)=>`提醒送达于 ${w}`, noticeMore:(n)=>`还有 ${n} 个地块放不进这条通知，请到地块列表查看。`, noticeGone:'这个地块已经删除',
  mapLoading:'正在载入地图…', mapFail:'地图没载入成功。',
  updAt:(w)=>`更新于 ${w}`, updAgo:(h)=>`${h} 小时前`,
  saveFail:'保存失败：手机储存空间可能已满，刚才的更改可能没有存下来。',
  covNone:(s)=>`这天没有数据：${s}`, covPart:(s)=>`这天只有部分小时，不计入上面的差异：${s}`, covUntil:(d)=>`只到 ${d}`, covHours:(h)=>`${h} 小时`,
  ntDigest:'每天摘要', ntThreshold:'仅超阈值',
  rRainProb:'降雨概率', rRainSum:'降雨量', rTMax:'最高温', rTMin:'最低温', rWind:'风速', rGust:'阵风',
  ntNoLoc:'还没有地点。先加一个，才能设定要提醒哪一块。',
  ntNoWin:'四个时段都关闭了。上面至少打开一个，才有东西可以勾。',
  ntPermOn:'已允许通知', ntPermAsk:'允许通知', ntPermDenied:'通知被系统拒绝了。要改的话，去手机设置里找到这个网站或应用，重新允许。',
  ntTest:'发一条测试通知', ntTestTitle:'天气预测', ntTestBody:'通知通路正常。定时提醒会按你的设定由服务器送出。',
  ntTestFail:'这个浏览器发不出通知。',
  ntSynced:'已登记，提醒会按上面的设定送达。',
  ntSyncing:'正在登记…', ntSyncFail:'登记失败，稍后会自动重试。检查一下网络。',
  ntNeedPerm:'打开主开关并允许通知后，提醒才会送达。',
  ntNoBlocksSel:'还没有勾选任何地块。在下面的表格里选一个，提醒才有对象。',
  ntNoActive:'勾选的地块用到的时段都关着，目前不会发任何提醒。打开对应的时段就会恢复。',
  ntIosHint:'iPhone 必须先把这个应用「加到主屏幕」，只在浏览器里开着收不到通知。',
  mapHint:'按 + 放置一个地点，或在上方搜索地名', locsUnit:n=>'个地点',
  railLocate:'定位到我', railAdd:'加一个地点', railLayer:'底图', mapSearchPh:'搜索地名',
  placeName:'名称（留空则用坐标）',
  placeConfirm:'放在这里', placeCancel:'取消',
  pickModel:'预报模式', pickModelD:'选择由哪个模式驱动这个地点。',
  unavail:'这个地点没有该模式数据', avail:'可用',
  now:'当前实况', humid:'湿度', wind:'风速', gust:'阵风', press:'气压',
  rainToday:'今日降雨', rainChance:'降雨概率', rainChanceMax:'最高降雨概率', uv:'紫外线', uvMax:'最高紫外线', dir:'风向', sunrise:'日出', sunset:'日落',
  probSrc:'降雨概率与紫外线来自 Best Match 混合模式，因为有几个模式不输出这两项。',
  now2:'现在',
  tMax:'最高气温', tMin:'最低气温', rainSum:'降雨总量', windMax:'最大风速',
  vTemp:'气温', hiMark:'高', loMark:'低',
  spreadTxt:(a,b,ut,ur)=>`各家模式对这一天最高气温的最大差距是 ${a} ${ut}，全日累计降雨的差距是 ${b} ${ur}。差距越大，预报越不确定。`,
  accT7:'模式预报准度',
  accIdle:'核对要另外取数（各模式过去的预报 + ERA5 再分析），所以不在打开页面时自动进行。',
  accRun:'开始核对', accSub:'对照 ERA5 再分析',
  accLoading:'正在取各模式过去的预报，和 ERA5 再分析比对…',
  accWindow:(a,b,n)=>`核对区间：${a} 至 ${b}（UTC），每个模式都用同样的 ${n} 个整点`,
  accMethodEra:'方法：对区间里的每个整点，取各模式「提前 1 天」和「提前 3 天」对这一刻做的预报，和 ECMWF ERA5 再分析比，算平均绝对误差（MAE）。所有模式用同一组整点。数字越小，这个模式在你这里预报得越准。按提前 1 天排序。',
  accEraNote:'三点提醒：一、ERA5 是再分析（同化观测后重算的），不是你园区的实测值，也不能代替雨量筒；它由 ECMWF 制作，对 ECMWF 可能略有利。二、ERA5 大约晚一周发布，所以这里核对的是一到两周前，样本只有一周多，只能当参考。三、Best Match 是几个模式拼起来的，不是单一模式，不在榜上。',
  accNone:'ERA5 对照数据或各模式过去的预报读不到（ERA5 大约晚一周发布，或接口暂时无回应），所以这里改用「与多模式共识的偏离」来排序。这不是准确度评分。',
  accCons:'与共识的偏离', accConsD:'每个模式跟所有模式平均值的平均差距（未来 48 小时气温）。偏离小只代表跟大多数一致，不代表更准。',
  accBest:'提前 1 天误差最小', accMae:'误差 · 提前 1 天 / 3 天',
  accMissing:(s)=>`没有足够的过去预报可比，不在榜上：${s}`,
  editName:'重命名', rename:'新名称', rmLoc:'删除这个地点', failLoad:'读不到预报。检查网络后重试。',
  retry:'重试', offline:'目前离线，显示的是上次读到的数据。', noNet:'目前离线，连上网络后再试。',
  unitSection:'单位', tempU:'温度', windU:'风速', rainU:'降雨',
  defModel:'新地点默认模式', defModelD:'加新地点时先用这个模式。之后每个地点都能单独改。',
  cmpSection:'对比哪些模式', cmpD:'勾选的模式会出现在每个地点的对比图和准度核对里。',
  about:'关于', version:'版本',
  relTitle:'这一版有什么变化', relDone:'知道了', dataSrc:'数据来源', savedOk:'已保存', deleted:'已删除'
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
  dragHint:'Hold a location to drag it into order — the first one becomes the map\u2019s default view',
  sumRain:(p,pk)=>`Rain ${p}, peaking at ${pk}%`, sumShowers:(p,pk)=>`Scattered showers possible ${p}, up to ${pk}%`,
  sumHot:(t)=>`Low chance of rain, high of ${t}`, sumCalm:'Low chance of rain all day', sumUnknown:'Not enough data yet',
  sumHotRest:(t)=>`Low chance of rain from here on, high of ${t}`, sumCalmRest:'Low chance of rain from here on',
  pNight:'overnight', pMorning:'in the morning', pAfternoon:'in the afternoon', pEvening:'in the evening',
  condT:'Conditions', vRain:'Precipitation', vWind:'Wind', sInten:'Intensity', sChance:'Chance of rain',
  lyEntry:'Detail page layout', lyDesc:'Press and hold a row to drag it. The switch on the right shows or hides that section. The temperature header and the date strip stay at the top.',
  lySummary:'Plain-language line', lyTenday:'Ten days', lyCards:'Data cards', lyCells:'Day figures',
  lyChartT:'Temperature comparison', lyChartP:'Rain chance chart', lyAccuracy:'Accuracy',
  lyChipNote:'The model picker lives in this card. Hide it and models are changed from settings instead.',
  lyReset:'Restore the default order', lyHidden:'Hidden', lyAllHidden:'Every middle section is hidden; the detail page is just the header and the footer.',
  lyOn:'Shown', lyOff:'Hidden',
  lyDefault:'Default', lyCustom:'Customised', lyHiddenN:n => `Customised · ${n} hidden`,
  srcRain:'The bars are the selected model\u2019s amounts; the percentages come from Best Match, the one source that always has them.',
  cWind:'Wind', cPress:'Pressure', cSun:'Sun', cUV:'UV index', cHumid:'Humidity', cVis:'Visibility', cRain:'Rain',
  dewPoint:(v)=>`Dew point ${v}`, visClear:'Clear view', visOk:'Moderate', visPoor:'Haze or fog',
  uvLow:'Low', uvMid:'Moderate', uvHigh:'High', uvVeryHigh:'Very high', uvExtreme:'Extreme',
  pressLow:'Low', pressHigh:'High', today:'Today',
  ntEntry:'Reminders', ntOff:'Off', ntSummary:(b,w)=>`${b} location${b===1?'':'s'} · ${w} window${w===1?'':'s'}`,
  ntMaster:'Enable reminders', ntWindows:'Time windows', ntRules:'Alert when', ntBlocks:'Locations',
  wMorning:'Morning', wAfternoon:'Afternoon', wEvening:'Evening', wNight:'Overnight',
  ntFrom:'From', ntTo:'To', ntAt:'Notify at', ntCross:'This window crosses midnight',
  ntTzNote:(z)=>`Times are in each location's own time zone (${z})`,
  ntModelNote:'Reminder temperatures, rainfall and wind use each location\u2019s own model; chance of rain comes from Best Match, as on the detail page.',
  qrCap:'Scan to open this app straight in a phone browser', qrAlt:'QR code that opens this app', shareApp:'Share the app link', shareText:'Multi-model weather comparison with per-plot reminders', linkCopied:'Link copied',
  updReady:(v)=>`Version ${v} is ready`, updNow:'Update now', updLater:'Later',
  noticeAt:(w)=>`Delivered ${w}`, noticeMore:(n)=>`${n} more locations did not fit in this notification; see them in the location list.`, noticeGone:'This location has been deleted',
  mapLoading:'Loading the map\u2026', mapFail:'The map did not load.',
  updAt:(w)=>`Updated ${w}`, updAgo:(h)=>`${h} h ago`,
  saveFail:'Could not save: the phone\u2019s storage may be full, so the last change may not have been kept.',
  covNone:(s)=>`No data for this day: ${s}`, covPart:(s)=>`Only part of this day, left out of the spread above: ${s}`, covUntil:(d)=>`ends ${d}`, covHours:(h)=>`${h} h`,
  ntDigest:'Daily summary', ntThreshold:'Only when exceeded',
  rRainProb:'Rain chance', rRainSum:'Rainfall', rTMax:'High temp', rTMin:'Low temp', rWind:'Wind', rGust:'Gusts',
  ntNoLoc:'No locations yet. Add one first, then choose which ones to be reminded about.',
  ntNoWin:'All four windows are off. Turn at least one on above and it will appear here.',
  ntPermOn:'Notifications allowed', ntPermAsk:'Allow notifications', ntPermDenied:'Notifications are blocked by the system. To change it, find this site or app in your phone settings and allow them again.',
  ntTest:'Send a test notification', ntTestTitle:'Predict Weather', ntTestBody:'The notification path works. Scheduled reminders are sent by the server on the times you set.',
  ntTestFail:'This browser cannot show notifications.',
  ntSynced:'Registered — reminders will arrive as configured above.',
  ntSyncing:'Registering…', ntSyncFail:'Registration failed; it will retry. Check your connection.',
  ntNeedPerm:'Turn the switch on and allow notifications, then reminders will arrive.',
  ntNoBlocksSel:'No locations ticked yet. Pick one in the table below and reminders will have something to report on.',
  ntNoActive:'The windows your ticked locations use are all switched off, so no reminders will be sent. Switch one back on to resume.',
  ntIosHint:'On iPhone the app must be added to the Home Screen first — notifications never arrive while it only runs in the browser.',
  mapHint:'Press + to place a location, or search for a place above', locsUnit:n=>n === 1 ? 'location' : 'locations',
  railLocate:'Locate me', railAdd:'Add a location', railLayer:'Basemap', mapSearchPh:'Search for a place',
  placeName:'Name (blank uses the coordinates)',
  placeConfirm:'Place it here', placeCancel:'Cancel',
  pickModel:'Forecast model', pickModelD:'Choose which model powers this location.',
  unavail:'No data for this location', avail:'Available',
  now:'Right now', humid:'Humidity', wind:'Wind', gust:'Gusts', press:'Pressure',
  rainToday:'Rain today', rainChance:'Rain chance', rainChanceMax:'Peak rain chance', uv:'UV index', uvMax:'Peak UV', dir:'Direction', sunrise:'Sunrise', sunset:'Sunset',
  probSrc:'Rain chance and UV come from the blended Best Match model, because several models do not produce them.',
  now2:'Now',
  tMax:'High', tMin:'Low', rainSum:'Total rain', windMax:'Max wind',
  vTemp:'Temperature', hiMark:'H', loMark:'L',
  spreadTxt:(a,b,ut,ur)=>`For this day the models differ by up to ${a} ${ut} on the high temperature and ${b} ${ur} on total rainfall. A wider spread means a less certain forecast.`,
  accT7:'Forecast accuracy by model',
  accIdle:'This check fetches each model\u2019s past forecasts and the ERA5 reanalysis separately, so it does not run just because the page opened.',
  accRun:'Run the check', accSub:'against ERA5 reanalysis',
  accLoading:'Fetching each model\u2019s past forecasts and comparing them with ERA5 reanalysis\u2026',
  accWindow:(a,b,n)=>`Window checked: ${a} to ${b} (UTC), the same ${n} hours for every model`,
  accMethodEra:'Method: for every hour in the window, the forecast each model made 1 day ahead and 3 days ahead is compared with ECMWF ERA5 reanalysis for that hour, as mean absolute error (MAE). Every model is scored on the same hours. Smaller means that model forecast better here. Ranked by the 1-day-ahead error.',
  accEraNote:'Three cautions. ERA5 is a reanalysis, recomputed after assimilating observations, not a measurement at your plot and no substitute for a rain gauge; it is made by ECMWF and may slightly favour ECMWF. ERA5 is published about a week late, so this checks one to two weeks back on little more than a week of data: treat it as a guide. Best Match stitches several models together, so it is not ranked.',
  accNone:'ERA5 or the models\u2019 past forecasts could not be read (ERA5 is published about a week late, or the endpoint did not respond), so this list falls back to how far each model sits from the multi-model consensus. That is agreement, not accuracy.',
  accCons:'Distance from consensus', accConsD:'Average gap between each model and the mean of all models, over the next 48 hours of temperature. A small gap only means it agrees with the majority.',
  accBest:'Smallest 1-day-ahead error', accMae:'Error · 1 day / 3 days ahead',
  accMissing:(s)=>`Not enough past forecasts to score, left out: ${s}`,
  editName:'Rename', rename:'New name', rmLoc:'Remove this location', failLoad:'Could not load the forecast. Check your connection and try again.',
  retry:'Retry', offline:'Offline — showing the last data that loaded.', noNet:'You are offline. Try again once you are back online.',
  unitSection:'Units', tempU:'Temperature', windU:'Wind', rainU:'Precipitation',
  defModel:'Default model for new locations', defModelD:'Used when you add a location. You can still change it per location.',
  cmpSection:'Models to compare', cmpD:'Ticked models appear in the compare chart and the accuracy check.',
  about:'About', version:'Version',
  relTitle:'What changed', relDone:'Got it', dataSrc:'Data sources', savedOk:'Saved', deleted:'Removed'
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
  dragHint:'Tekan dan tahan lokasi untuk menyusunnya — yang pertama menjadi paparan asal peta',
  sumRain:(p,pk)=>`Hujan ${p}, tertinggi ${pk}%`, sumShowers:(p,pk)=>`Mungkin hujan renyai ${p}, sehingga ${pk}%`,
  sumHot:(t)=>`Kebarangkalian hujan rendah, tertinggi ${t}`, sumCalm:'Kebarangkalian hujan rendah sepanjang hari', sumUnknown:'Data belum cukup',
  sumHotRest:(t)=>`Kebarangkalian hujan rendah selepas ini, tertinggi ${t}`, sumCalmRest:'Kebarangkalian hujan rendah selepas ini',
  pNight:'dini hari', pMorning:'pagi', pAfternoon:'petang', pEvening:'malam',
  condT:'Keadaan', vRain:'Hujan', vWind:'Angin', sInten:'Keamatan', sChance:'Kebarangkalian hujan',
  lyEntry:'Susunan halaman butiran', lyDesc:'Tekan dan tahan satu baris untuk seretnya. Suis di sebelah kanan menunjuk atau menyembunyikan bahagian itu. Suhu di atas dan jalur tarikh kekal di tempatnya.',
  lySummary:'Ayat ringkas', lyTenday:'Sepuluh hari', lyCards:'Kad data', lyCells:'Angka hari itu',
  lyChartT:'Graf perbandingan suhu', lyChartP:'Graf kebarangkalian hujan', lyAccuracy:'Ketepatan',
  lyChipNote:'Pemilih model ada dalam kad ini. Jika disembunyikan, model ditukar dari tetapan.',
  lyReset:'Pulihkan susunan asal', lyHidden:'Disembunyikan', lyAllHidden:'Semua bahagian tengah disembunyikan; halaman butiran tinggal bahagian atas dan bawah.',
  lyOn:'Ditunjuk', lyOff:'Disembunyi',
  lyDefault:'Asal', lyCustom:'Diubah suai', lyHiddenN:n => `Diubah suai · ${n} disembunyikan`,
  srcRain:'Bar ialah jumlah hujan model yang dipilih; peratusan datang dari Best Match, satu-satunya sumber yang sentiasa ada.',
  cWind:'Angin', cPress:'Tekanan', cSun:'Matahari', cUV:'Indeks UV', cHumid:'Kelembapan', cVis:'Penglihatan', cRain:'Hujan',
  dewPoint:(v)=>`Takat embun ${v}`, visClear:'Pandangan jelas', visOk:'Sederhana', visPoor:'Jerebu atau kabus',
  uvLow:'Rendah', uvMid:'Sederhana', uvHigh:'Tinggi', uvVeryHigh:'Sangat tinggi', uvExtreme:'Ekstrem',
  pressLow:'Rendah', pressHigh:'Tinggi', today:'Hari ini',
  ntEntry:'Peringatan', ntOff:'Tidak aktif', ntSummary:(b,w)=>`${b} lokasi · ${w} tempoh`,
  ntMaster:'Aktifkan peringatan', ntWindows:'Tempoh masa', ntRules:'Beritahu apabila', ntBlocks:'Lokasi',
  wMorning:'Pagi', wAfternoon:'Petang', wEvening:'Malam', wNight:'Dini hari',
  ntFrom:'Dari', ntTo:'Hingga', ntAt:'Beritahu pada', ntCross:'Tempoh ini melepasi tengah malam',
  ntTzNote:(z)=>`Masa mengikut zon waktu lokasi itu sendiri (${z})`,
  ntModelNote:'Suhu, hujan dan angin dalam peringatan menggunakan model setiap lokasi; kebarangkalian hujan dari Best Match, sama seperti halaman butiran.',
  qrCap:'Imbas untuk membuka aplikasi ini terus dalam pelayar telefon', qrAlt:'Kod QR untuk membuka aplikasi ini', shareApp:'Kongsi pautan aplikasi', shareText:'Perbandingan cuaca pelbagai model dengan peringatan setiap petak', linkCopied:'Pautan disalin',
  updReady:(v)=>`Versi ${v} sudah sedia`, updNow:'Kemas kini', updLater:'Nanti',
  noticeAt:(w)=>`Dihantar ${w}`, noticeMore:(n)=>`${n} lagi lokasi tidak muat dalam pemberitahuan ini; lihat dalam senarai lokasi.`, noticeGone:'Lokasi ini telah dipadam',
  mapLoading:'Memuatkan peta\u2026', mapFail:'Peta gagal dimuatkan.',
  updAt:(w)=>`Dikemas kini ${w}`, updAgo:(h)=>`${h} jam lalu`,
  saveFail:'Gagal simpan: storan telefon mungkin penuh, jadi perubahan terakhir mungkin tidak disimpan.',
  covNone:(s)=>`Tiada data untuk hari ini: ${s}`, covPart:(s)=>`Hanya sebahagian hari ini, tidak dikira dalam perbezaan di atas: ${s}`, covUntil:(d)=>`hingga ${d}`, covHours:(h)=>`${h} jam`,
  ntDigest:'Ringkasan harian', ntThreshold:'Hanya bila melebihi',
  rRainProb:'Peluang hujan', rRainSum:'Jumlah hujan', rTMax:'Suhu tertinggi', rTMin:'Suhu terendah', rWind:'Angin', rGust:'Tiupan',
  ntNoLoc:'Belum ada lokasi. Tambah satu dahulu, kemudian pilih yang mana hendak diperingatkan.',
  ntNoWin:'Keempat-empat tempoh dimatikan. Hidupkan sekurang-kurangnya satu di atas.',
  ntPermOn:'Pemberitahuan dibenarkan', ntPermAsk:'Benarkan pemberitahuan', ntPermDenied:'Pemberitahuan disekat oleh sistem. Cari tapak atau aplikasi ini dalam tetapan telefon dan benarkan semula.',
  ntTest:'Hantar pemberitahuan ujian', ntTestTitle:'Ramalan Cuaca', ntTestBody:'Laluan pemberitahuan berfungsi. Peringatan berjadual dihantar oleh pelayan pada masa yang anda tetapkan.',
  ntTestFail:'Pelayar ini tidak boleh memaparkan pemberitahuan.',
  ntSynced:'Didaftarkan — peringatan akan sampai mengikut tetapan di atas.',
  ntSyncing:'Mendaftar…', ntSyncFail:'Pendaftaran gagal; ia akan cuba lagi. Semak sambungan anda.',
  ntNeedPerm:'Hidupkan suis dan benarkan pemberitahuan, barulah peringatan akan sampai.',
  ntNoBlocksSel:'Belum ada lokasi ditanda. Pilih satu dalam jadual di bawah.',
  ntNoActive:'Tempoh yang digunakan oleh lokasi bertanda semuanya dimatikan, jadi tiada peringatan dihantar. Hidupkan semula untuk sambung.',
  ntIosHint:'Pada iPhone, aplikasi mesti ditambah ke Skrin Utama dahulu — pemberitahuan tidak sampai jika hanya dibuka dalam pelayar.',
  mapHint:'Tekan + untuk letak lokasi, atau cari nama tempat di atas', locsUnit:n=>'lokasi',
  railLocate:'Cari saya', railAdd:'Tambah lokasi', railLayer:'Peta asas', mapSearchPh:'Cari nama tempat',
  placeName:'Nama (kosong guna koordinat)',
  placeConfirm:'Letak di sini', placeCancel:'Batal',
  pickModel:'Model ramalan', pickModelD:'Pilih model yang menjana lokasi ini.',
  unavail:'Tiada data untuk lokasi ini', avail:'Ada',
  now:'Sekarang', humid:'Kelembapan', wind:'Angin', gust:'Tiupan', press:'Tekanan',
  rainToday:'Hujan hari ini', rainChance:'Peluang hujan', rainChanceMax:'Peluang hujan tertinggi', uv:'Indeks UV', uvMax:'UV tertinggi', dir:'Arah', sunrise:'Matahari naik', sunset:'Matahari turun',
  probSrc:'Peluang hujan dan UV datang dari model gabungan Best Match, kerana beberapa model tidak mengeluarkannya.',
  now2:'Sekarang',
  tMax:'Tertinggi', tMin:'Terendah', rainSum:'Jumlah hujan', windMax:'Angin maksimum',
  vTemp:'Suhu', hiMark:'T', loMark:'R',
  spreadTxt:(a,b,ut,ur)=>`Untuk hari ini, model berbeza sehingga ${a} ${ut} pada suhu tertinggi dan ${b} ${ur} pada jumlah hujan. Jurang lebih besar bermakna ramalan kurang pasti.`,
  accT7:'Ketepatan ramalan mengikut model',
  accIdle:'Semakan ini mengambil ramalan lalu setiap model dan analisis semula ERA5 secara berasingan, jadi ia tidak berjalan hanya kerana halaman dibuka.',
  accRun:'Jalankan semakan', accSub:'berbanding analisis semula ERA5',
  accLoading:'Mengambil ramalan lalu setiap model dan membandingkannya dengan analisis semula ERA5\u2026',
  accWindow:(a,b,n)=>`Tempoh disemak: ${a} hingga ${b} (UTC), ${n} jam yang sama untuk setiap model`,
  accMethodEra:'Kaedah: untuk setiap jam dalam tempoh itu, ramalan setiap model yang dibuat 1 hari dan 3 hari lebih awal dibandingkan dengan analisis semula ERA5 ECMWF bagi jam itu, sebagai ralat mutlak purata (MAE). Semua model dinilai pada jam yang sama. Lebih kecil bermakna model itu meramal lebih tepat di sini. Disusun mengikut ralat 1 hari lebih awal.',
  accEraNote:'Tiga peringatan. ERA5 ialah analisis semula, bukan ukuran di petak anda dan bukan ganti tolok hujan; ia dihasilkan oleh ECMWF dan mungkin sedikit memihak kepada ECMWF. ERA5 diterbitkan kira-kira seminggu lewat, jadi semakan ini melihat satu hingga dua minggu lalu dengan data lebih sedikit daripada dua minggu: jadikan panduan sahaja. Best Match menggabungkan beberapa model, jadi ia tidak disenaraikan.',
  accNone:'ERA5 atau ramalan lalu model tidak dapat dibaca (ERA5 diterbitkan kira-kira seminggu lewat, atau titik akhir tidak menjawab), jadi senarai ini beralih kepada jarak setiap model dari konsensus. Itu persetujuan, bukan ketepatan.',
  accCons:'Jarak dari konsensus', accConsD:'Purata beza antara setiap model dengan purata semua model, untuk suhu 48 jam akan datang. Jurang kecil hanya bermakna ia sepakat dengan majoriti.',
  accBest:'Ralat 1 hari terkecil', accMae:'Ralat · 1 hari / 3 hari lebih awal',
  accMissing:(s)=>`Tiada cukup ramalan lalu untuk dinilai, tidak disenaraikan: ${s}`,
  editName:'Tukar nama', rename:'Nama baharu', rmLoc:'Buang lokasi ini', failLoad:'Gagal memuatkan ramalan. Semak sambungan dan cuba lagi.',
  retry:'Cuba lagi', offline:'Di luar talian — data terakhir dipaparkan.', noNet:'Anda di luar talian. Cuba lagi bila ada sambungan.',
  unitSection:'Unit', tempU:'Suhu', windU:'Angin', rainU:'Hujan',
  defModel:'Model asal untuk lokasi baharu', defModelD:'Digunakan bila anda tambah lokasi. Boleh tukar untuk setiap lokasi.',
  cmpSection:'Model untuk dibanding', cmpD:'Model bertanda muncul dalam carta banding dan semakan ketepatan.',
  about:'Perihal', version:'Versi',
  relTitle:'Apa yang berubah', relDone:'Faham', dataSrc:'Sumber data', savedOk:'Disimpan', deleted:'Dibuang'
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
    try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; }
    catch(e){ return null; }
  },
  /* true when it stuck; a full or blocked storage used to fail in silence */
  async set(k, v){
    try{ localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch(e){ return false; }
  }
};
let S = {
  lang:'zh', locations:[], defaultModel:'best_match',
  compare:MODELS.map(m => m.id),
  units:{temp:'celsius', wind:'kmh', rain:'mm'},
  basemap:'sat',
  /* null means "whatever the build's default order is" — resolved against the
     section registry on every render, never frozen into a list (layout.js) */
  layout:null
};
/* said once per session: a failed save means the change is gone on the next
   launch, and the user would otherwise find out only then */
let saveWarned = false;
const save = () => store.set(KEY, S).then(ok => {
  if(ok || saveWarned) return;
  saveWarned = true;
  toast(t('saveFail'));
});
const t = k => T[S.lang][k];

/* ---------- 4b. Reminder settings ----------
   Thresholds are stored in metric (°C, km/h, mm) and converted only for
   display, so switching units never has to migrate stored numbers and a 35
   can never be reinterpreted as 35°F. */
const NOTIFY_DEFAULTS = {
  enabled:false,
  windows:[
    {id:'morning',   on:true,  from:'06:00', to:'12:00', at:'06:00', mode:'threshold'},
    {id:'afternoon', on:true,  from:'12:00', to:'18:00', at:'12:00', mode:'threshold'},
    {id:'evening',   on:false, from:'18:00', to:'23:59', at:'18:00', mode:'digest'},
    {id:'night',     on:false, from:'00:00', to:'06:00', at:'00:00', mode:'digest'}
  ],
  rules:{
    rainProb:{on:true,  v:60},
    rainSum: {on:false, v:5},
    tMax:    {on:false, v:35},
    tMin:    {on:false, v:22},
    wind:    {on:true,  v:20},
    gust:    {on:false, v:35}
  }
};
const NOTIFY_RULES = ['rainProb','rainSum','tMax','tMin','wind','gust'];
const clone = o => JSON.parse(JSON.stringify(o));

/* Repairs S.notify in place. The time inputs hand back '' when cleared and
   localStorage can hold anything at all, so nothing here is trusted. */
function normalizeNotify(){
  if(!S.notify || typeof S.notify !== 'object') S.notify = clone(NOTIFY_DEFAULTS);
  const N = S.notify;
  N.enabled = !!N.enabled;

  const byId = {};
  if(Array.isArray(N.windows)) N.windows.forEach(w => { if(w && w.id) byId[w.id] = w; });
  N.windows = NOTIFY_DEFAULTS.windows.map(def => {
    const w = byId[def.id] || {};
    const time = (v, fb) => minutesOf(v) < 0 ? fb : v;
    return {
      id:def.id,
      on:typeof w.on === 'boolean' ? w.on : def.on,
      from:time(w.from, def.from),
      to:time(w.to, def.to),
      at:time(w.at, def.at),
      mode:(w.mode === 'digest' || w.mode === 'threshold') ? w.mode : def.mode
    };
  });

  const r = (N.rules && typeof N.rules === 'object') ? N.rules : {};
  N.rules = {};
  NOTIFY_RULES.forEach(k => {
    const def = NOTIFY_DEFAULTS.rules[k], got = r[k] || {};
    N.rules[k] = {
      on:typeof got.on === 'boolean' ? got.on : def.on,
      v:Number.isFinite(+got.v) ? +got.v : def.v
    };
  });

  /* a window that no longer exists must not keep a location subscribed to it */
  const ids = N.windows.map(w => w.id);
  S.locations.forEach(l => {
    l.notify = Array.isArray(l.notify) ? l.notify.filter(x => ids.includes(x)) : [];
  });
}

function notifySummary(){
  if(!S.notify || !S.notify.enabled) return t('ntOff');
  const blocks = S.locations.filter(l => (l.notify || []).length).length;
  const wins = S.notify.windows.filter(w => w.on).length;
  return t('ntSummary')(blocks, wins);
}
/* the settings row says whether anything was changed, and what was hidden —
   a layout the user forgot about is the likeliest reason a card "went missing" */
function layoutSummary(){
  if(isDefaultLayout(S.layout, sectionIds())) return t('lyDefault');
  const off = resolveLayout(S.layout, sectionIds()).filter(x => !x.on).length;
  return off ? t('lyHiddenN')(off) : t('lyCustom');
}

/* ---------- 5. Units ---------- */
const ULBL = {celsius:'°C', fahrenheit:'°F', kmh:'km/h', mph:'mph', kn:'kn', ms:'m/s', mm:'mm', inch:'in'};
const uT = () => ULBL[S.units.temp];
const uW = () => ULBL[S.units.wind];
const uR = () => ULBL[S.units.rain];
const nz = v => v !== null && v !== undefined && !Number.isNaN(v);
const fT = v => nz(v) ? Math.round(v) + '°' : '—';
const fW = v => nz(v) ? (S.units.wind === 'ms' ? v.toFixed(1) : Math.round(v)) + ' ' + uW() : '—';
const fR = v => nz(v) ? (S.units.rain === 'inch' ? v.toFixed(2) : v.toFixed(1)) + ' ' + uR() : '—';
/* bare numbers, for the places that print the unit once in a header instead of
   on every value; the API already answers in the user's units */
const rainOut   = v => S.units.rain === 'inch' ? v.toFixed(2) : v.toFixed(1);
const windShown = v => S.units.wind === 'ms' ? v.toFixed(1) : String(Math.round(v));
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
    const j = await r.json();
    /* when it was fetched: nothing on screen used to say, so a day-old number
       looked exactly like a new one (reqlogic.js) */
    if(j && typeof j === 'object') j._at = Date.now();
    return j;
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
const SAFE_CURRENT = 'temperature_2m,relative_humidity_2m,visibility,dew_point_2m,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,surface_pressure,precipitation,is_day';
const MIN_CURRENT  = 'temperature_2m,wind_speed_10m,is_day';
const SAFE_HOURLY  = 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day';
const MIN_HOURLY   = 'temperature_2m,precipitation';
const SAFE_DAILY   = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset';
const MIN_DAILY    = 'temperature_2m_max,temperature_2m_min,precipitation_sum';

/* card summary: one model, small payload, with a reduced-variable retry */
/* The full variable set, retried with the minimum on a 400 — a model that
   cannot produce one of them. Offline or a timeout is not retried: it would
   fail the same way. The payload is tagged with the model it came from, so
   it can never be drawn under another model's badge. */
async function fullOrLite(loc, days, full, lite, ms){
  const model = loc.model || S.defaultModel;
  const q = vars => API + '?' + new URLSearchParams(Object.assign(
    {latitude:loc.lat, longitude:loc.lon, models:model, timezone:'auto', forecast_days:days}, unitParams(), vars));
  let j;
  try{ j = await jget(q(full), ms); }
  catch(e){ if(!isBadRequest(e)) throw e; j = await jget(q(lite), ms); }
  if(j && typeof j === 'object') j._model = model;
  return j;
}
/* card summary: one model, small payload */
function getSummary(loc){
  return fullOrLite(loc, '2',
    {current:SAFE_CURRENT, daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum'},
    {current:MIN_CURRENT, daily:MIN_DAILY});
}
/* full detail for the main model */
function getMain(loc){
  return fullOrLite(loc, '10',
    {current:SAFE_CURRENT, hourly:SAFE_HOURLY, daily:SAFE_DAILY},
    {current:MIN_CURRENT, hourly:MIN_HOURLY, daily:MIN_DAILY}, 20000);
}
/* precipitation probability and UV are produced by only some models, so they
   always come from Open-Meteo's blended best_match and are labelled as such */
function getExtras(loc){
  const p = Object.assign({
    latitude:loc.lat, longitude:loc.lon, timezone:'auto', forecast_days:'10',
    hourly:'precipitation_probability,uv_index', daily:'precipitation_probability_max,uv_index_max'
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
  out._at = Date.now();
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
/* What each model forecast for past hours, 1 and 3 days before them.

   This replaces past_days on the forecast API. For past hours that returns
   each model's latest run about them — a 0-6 hour nowcast, not a forecast
   made days earlier — so the old table ranked starting analyses, not
   forecast skill (review finding B1). Checked on Kuala Lumpur over the same
   216 hours before the change: the old method put ECMWF first; real 1-day
   forecasts put GFS first and ECMWF third. */
const PREV_RUNS = 'https://previous-runs-api.open-meteo.com/v1/forecast';
async function getPrevRuns(loc, models, startDate, endDate){
  const mk = list => ({
    latitude:loc.lat, longitude:loc.lon, models:list.join(','), timezone:'UTC',
    start_date:startDate, end_date:endDate, temperature_unit:'celsius',
    hourly:'temperature_2m_previous_day1,temperature_2m_previous_day3'
  });
  try{ return await jget(PREV_RUNS + '?' + new URLSearchParams(mk(models)), 25000); }
  catch(e){
    const rs = await Promise.allSettled(models.map(id => jget(PREV_RUNS + '?' + new URLSearchParams(mk([id])), 20000)));
    return mergeModels(rs, models);
  }
}
/* ERA5 reanalysis — the verification reference. models=era5 is explicit:
   without it the archive serves a blend of IFS, ERA5 and ERA5-Land, and the
   card was naming a reference it had not requested (finding A05). */
function getEra5(loc, startDate, endDate){
  const p = {
    latitude:loc.lat, longitude:loc.lon, start_date:startDate, end_date:endDate, models:'era5',
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
/* "Updated 06:12", with the age once it is past three hours ago. The time is
   the phone's own clock: it answers "how old is this", not "what time is it
   at the plot". */
function updLabel(at){
  if(typeof at !== 'number') return '';
  const f = freshness(at, Date.now()), d = new Date(at);
  const hm = d.toLocaleTimeString(locale(), {hour:'2-digit', minute:'2-digit', hour12:false});
  const when = f.otherDay ? d.toLocaleDateString(locale(), {month:'short', day:'numeric'}) + ' ' + hm : hm;
  return t('updAt')(when) + (f.stale ? ' · ' + t('updAgo')(f.hours) : '');
}
const isStale = d => !!(d && freshness(d._at, Date.now()).stale);

function cardHTML(l){
  let d = cache[l.id];
  const m = M(l.model || S.defaultModel);
  /* a payload fetched for another model is not this card's data */
  if(d && d._model && d._model !== m.id) d = undefined;
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
    if(isStale(d)) cls += ' stale';
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
        <span class="upd">${d && d._at ? esc(updLabel(d._at)) : coordText(l)}</span>
      </div></button>`;
}
function makeCard(l){
  const node = el(cardHTML(l));
  node.addEventListener('click', () => openDetail(l.id));
  return node;
}
function renderList(){
  const box = $('#loc-list'); box.innerHTML = '';
  const hint = $('#list-hint');
  if(hint){
    hint.textContent = t('dragHint');
    hint.style.display = S.locations.length >= 3 ? 'block' : 'none';
  }
  if(!S.locations.length){ box.appendChild(el(`<p class="empty">${t('empty')}</p>`)); return; }
  S.locations.forEach(l => box.appendChild(makeCard(l)));
}
/* swap a single card in place — a finished request no longer rebuilds
   every card and every map marker on the page */
/* ids whose refresh landed while their card was under the user's finger */
const deferredCards = new Set();

function updateCard(id){
  const l = S.locations.find(x => x.id === id);
  const old = document.querySelector(`#loc-list [data-id="${id}"]`);
  if(!l || !old){ if(!(drag && drag.on)) renderList(); return; }
  /* Replacing the node being dragged detaches it: the transform goes, the
     handler holds a dead element, and the drop silently does nothing. A pull
     to refresh followed by a drag hits this every time, so the refresh waits. */
  if(drag && drag.on && drag.card === old){ deferredCards.add(id); return; }
  old.replaceWith(makeCard(l));
}

function flushDeferredCards(){
  if(!deferredCards.size) return;
  const ids = [...deferredCards];
  deferredCards.clear();
  ids.forEach(updateCard);
}
/* A card reply is written only if it is still the latest request for that
   card and the units and model it was asked in are still the ones in use.
   Clearing the cache on a unit change did not stop an older Celsius reply
   landing after the Fahrenheit one and leaving the card on "30°" (review
   finding A03). A failure never replaces data that loaded. */
const cardReq = makeLatest();
const cardSig = l => [l.model || S.defaultModel, S.units.temp, S.units.wind, S.units.rain].join('|');
async function loadCard(l){
  const fresh = cardReq.begin(l.id), sig = cardSig(l);
  let r, ok = true;
  try{ r = await getSummary(l); }catch(e){ ok = false; }
  if(!fresh() || cardSig(l) !== sig) return;
  if(!S.locations.some(x => x.id === l.id)) return;   // deleted while loading
  if(ok) cache[l.id] = r;
  else if(!cache[l.id]) cache[l.id] = null;
  updateCard(l.id); updatePin(l.id);
}
function loadAll(){ S.locations.forEach(loadCard); }

/* ---------- 8b. Drag to reorder ----------
   Press and hold a card, then drag. The order is the array order, and position
   one also decides where the map opens, so this is how a location is made the
   default view.

   A plain press must still open the detail page and a plain swipe must still
   scroll the list, so the hold is what separates the three: move too early and
   it was a scroll, release too early and it was a tap. */
const HOLD_MS = 350, SLOP = 10, EDGE = 90;
let drag = null, suppressClick = false;

/* touch-action cannot be changed mid-gesture, so a running drag or pull has to
   block scrolling with preventDefault — which needs a non-passive listener.
   Left registered on document permanently it would cost every scroll in the
   app its passive fast path, for gestures that are almost never running, so it
   is attached for the length of the gesture and taken off again. */
const blockScroll = e => e.preventDefault();
let scrollBlocked = 0;
function holdScroll(on){
  if(on){ if(scrollBlocked++) return; document.addEventListener('touchmove', blockScroll, {passive:false}); }
  else  { if(!scrollBlocked || --scrollBlocked) return; document.removeEventListener('touchmove', blockScroll, {passive:false}); }
}

function cardMetrics(){
  const cards = Array.from(document.querySelectorAll('#loc-list .loc'));
  const sy = window.scrollY;
  return cards.map(c => {
    const r = c.getBoundingClientRect();
    return {el:c, top:r.top + sy, h:r.height, centre:r.top + sy + r.height / 2};
  });
}

function beginDrag(){
  if(!drag) return;
  const m = cardMetrics();
  const from = m.findIndex(x => x.el === drag.card);
  if(from < 0){ drag = null; return; }
  drag.on = true;
  drag.from = from;
  drag.to = from;
  drag.metrics = m;
  /* the gap the card leaves behind is its own outer height, so every card it
     passes shifts by exactly that much whatever its own height is */
  drag.slot = m[from].h + 14;
  drag.card.classList.add('dragging');
  drag.card.style.transform = 'translateY(0px) scale(1.03)';
  $('#loc-list').classList.add('reordering');
  holdScroll(true);
  drag.autoTimer = setInterval(autoScroll, 16);
}

function autoScroll(){
  if(!drag || !drag.on) return;
  const y = drag.clientY;
  let d = 0;
  if(y < EDGE) d = -Math.ceil((EDGE - y) / 6);
  else if(y > window.innerHeight - EDGE) d = Math.ceil((y - (window.innerHeight - EDGE)) / 6);
  if(d){ window.scrollBy(0, d); paintDrag(); }
}

function paintDrag(){
  if(!drag || !drag.on) return;
  const dy = (drag.clientY + window.scrollY) - drag.startPageY;
  drag.card.style.transform = `translateY(${dy}px) scale(1.03)`;
  const centre = drag.metrics[drag.from].centre + dy;
  const to = targetIndex(drag.metrics.map(x => x.centre), centre);
  drag.to = to;
  drag.metrics.forEach((x, i) => {
    if(i === drag.from) return;
    let shift = 0;
    if(drag.from < to && i > drag.from && i <= to) shift = -drag.slot;
    else if(drag.from > to && i >= to && i < drag.from) shift = drag.slot;
    x.el.style.transform = shift ? `translateY(${shift}px)` : '';
  });
}

function endDrag(){
  if(!drag) return;
  clearTimeout(drag.holdTimer);
  clearInterval(drag.autoTimer);
  const d = drag;
  drag = null;
  if(!d.on) return;
  holdScroll(false);
  $('#loc-list').classList.remove('reordering');
  d.metrics.forEach(x => { x.el.style.transform = ''; });
  d.card.classList.remove('dragging');
  /* a drag ends over a card, and that card's click must not open it */
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 60);
  if(d.to !== d.from){
    S.locations = moveItem(S.locations, d.from, d.to);
    save(); renderList(); refreshPins();
    deferredCards.clear();          // renderList already rebuilt every card
  } else {
    flushDeferredCards();
  }
}

function initReorder(){
  const list = $('#loc-list');
  list.addEventListener('pointerdown', e => {
    if(e.button !== undefined && e.button !== 0) return;
    const card = e.target.closest('.loc');
    if(!card) return;
    drag = {card, on:false, clientY:e.clientY,
            startPageY:e.clientY + window.scrollY, startClientY:e.clientY,
            pointerId:e.pointerId};
    drag.holdTimer = setTimeout(beginDrag, HOLD_MS);
  });
  list.addEventListener('pointermove', e => {
    if(!drag) return;
    drag.clientY = e.clientY;
    if(!drag.on){
      /* moved before the hold completed: the user is scrolling, not dragging */
      if(Math.abs(e.clientY - drag.startClientY) > SLOP){ clearTimeout(drag.holdTimer); drag = null; }
      return;
    }
    paintDrag();
  });
  ['pointerup','pointercancel'].forEach(ev => list.addEventListener(ev, endDrag));
  window.addEventListener('pointerup', endDrag);
  list.addEventListener('click', e => {
    if(!suppressClick) return;
    e.stopPropagation(); e.preventDefault();
  }, true);
}

/* ---------- 8c. Pull to refresh ----------
   Two jobs on one gesture: re-read the weather, and ask GitHub whether a newer
   build of the app itself exists. The second is the reason this exists — the
   shell is fetched network-first on each launch, but a page already open
   keeps running the code it started with until something makes it look. */
const PULL_MAX = 90, PULL_TRIGGER = 52, UPDATE_WAIT_MS = 4000;
let pull = null, refreshing = false;

function pullEls(){ return {box:$('#ptr'), ring:$('#ptr-ring')}; }

function paintPull(offset, ready){
  const {box, ring} = pullEls();
  if(!box) return;
  box.style.transform = `translate(-50%, ${offset}px)`;
  box.style.opacity = Math.min(1, offset / 28).toFixed(2);
  box.classList.toggle('ready', !!ready);
  /* the ring turns with the pull, so the gesture feels connected to it even
     before the threshold is reached */
  if(ring) ring.style.transform = `rotate(${offset * 4}deg)`;
}

function resetPull(){
  const {box, ring} = pullEls();
  if(!box) return;
  box.classList.add('snap');
  box.classList.remove('ready', 'spinning');
  box.style.transform = 'translate(-50%, 0px)';
  box.style.opacity = '0';
  if(ring) ring.style.transform = '';
  setTimeout(() => box.classList.remove('snap'), 260);
}

async function runRefresh(){
  if(refreshing) return;
  refreshing = true;
  const {box} = pullEls();
  if(box){
    box.classList.remove('snap');
    box.classList.add('spinning');
    box.style.transform = `translate(-50%, ${PULL_TRIGGER}px)`;
    box.style.opacity = '1';
  }
  /* the user asked for fresh data, so a newer build — if there is one — is
     applied straight away rather than offered */
  const checked = checkForUpdate({asked:true});
  Object.keys(cache).forEach(k => delete cache[k]);
  renderList();
  loadAll();
  if(D.loc && $('#detail').classList.contains('on')){ D.acc = null; D.ext = null; loadDetail(); }
  await Promise.race([checked, new Promise(r => setTimeout(r, UPDATE_WAIT_MS))]);
  await new Promise(r => setTimeout(r, 400));
  refreshing = false;
  resetPull();
}

/* ---------- 8d. Updates ----------
   A new build used to reach an open app only through pull-to-refresh or a
   close-and-reopen, and an iPhone resumes a home-screen app far more often
   than it relaunches one — so people cleared their cache to get it. Now the
   page asks the server which build is live when it opens, whenever it comes
   back to the screen, and every quarter hour in use; updatelogic.js decides
   whether to apply it at once or offer it. The service worker revalidates
   every file with the server, so a reload always brings the new build. */
let visibleSince = Date.now(), updateReady = null, lastUpdateCheck = 0;
async function liveVersion(){
  try{
    const r = await fetch('./sw.js', {cache:'no-cache'});
    return r.ok ? parseSwVersion(await r.text()) : null;
  }catch(e){ return null; }
}
async function checkForUpdate(opts){
  const asked = !!(opts && opts.asked);
  if(!navigator.onLine) return false;
  if(!asked && Date.now() - lastUpdateCheck < 60e3) return !!updateReady;
  lastUpdateCheck = Date.now();
  /* the worker too, so it is ready with the new files by the time we reload */
  try{
    const reg = 'serviceWorker' in navigator && await navigator.serviceWorker.getRegistration();
    if(reg) reg.update().catch(() => {});
  }catch(e){}
  const v = await liveVersion();
  if(!v || v === APP_VERSION) return false;
  updateReady = v;
  actOnUpdate(asked);
  return true;
}
/* someone in the middle of something: a sheet or page open, a field being
   typed in, a drag, a pull, or a pin being placed on the map */
function appBusy(){
  const a = document.activeElement;
  return !!openSheetId || $('#notify').classList.contains('on') || $('#layout').classList.contains('on')
    || !!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
    || !!(drag && drag.on) || !!(lyDrag && lyDrag.on) || !!pull || !!(P && P.on);
}
function actOnUpdate(asked){
  if(!updateReady) return;
  const what = updateAction({hidden:document.visibilityState !== 'visible',
                             sinceVisibleMs:Date.now() - visibleSince, busy:appBusy(), asked:!!asked});
  if(what === 'apply') applyUpdate(false);
  else if(what === 'banner') showUpdateBar(updateReady);
}
/* reload into the new build, back on the same page. An automatic one is
   tried once per version per ten minutes (updatelogic.js: no reload loops);
   the user's own tap always goes through. */
function applyUpdate(byUser){
  let tried = null;
  try{ tried = JSON.parse(sessionStorage.getItem('pw:tried') || 'null'); }catch(e){}
  if(byUser !== true && !mayAutoReload(tried, updateReady, Date.now())){ showUpdateBar(updateReady); return; }
  try{ sessionStorage.setItem('pw:tried', JSON.stringify({v:updateReady, at:Date.now()})); }catch(e){}
  try{
    sessionStorage.setItem('pw:resume', JSON.stringify({
      loc:$('#detail').classList.contains('on') && D.loc ? D.loc.id : null,
      day:D.day || 0, map:document.body.classList.contains('map-mode')}));
  }catch(e){}
  location.reload();
}
function showUpdateBar(v){
  const bar = $('#upd-bar');
  if(!bar || bar.classList.contains('on')) return;
  $('#upd-text').textContent = t('updReady')(v);
  $('#upd-go').textContent = t('updNow');
  bar.classList.add('on');
}
$('#upd-go').addEventListener('click', () => applyUpdate(true));
/* "later" only hides the bar: the update still lands the next time the app
   comes back to the screen */
$('#upd-later').addEventListener('click', () => $('#upd-bar').classList.remove('on'));
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  visibleSince = Date.now();
  if(updateReady) actOnUpdate(); else checkForUpdate();
});
setInterval(() => { if(document.visibilityState === 'visible') checkForUpdate(); }, 15 * 60e3);

function initPullRefresh(){
  /* Anything laid over the list scrolls itself, and the body behind it is
     parked at the top — so `window.scrollY <= 0` alone read every downward
     swipe inside a sheet as a pull, and the preventDefault below then ate
     that sheet's own scroll. Overlays have to be excluded explicitly. */
  const overlaid = () => !!openSheetId
                      || $('#detail').classList.contains('on')
                      || $('#notify').classList.contains('on')
                      || $('#layout').classList.contains('on');
  const armed = () => !overlaid()
                   && !document.body.classList.contains('map-mode')
                   && !(drag && drag.on)
                   && !refreshing
                   && window.scrollY <= 0;
  window.addEventListener('pointerdown', e => {
    if(!armed()) return;
    pull = {startY:e.clientY, offset:0, active:false};
  }, {passive:true});
  window.addEventListener('pointermove', e => {
    if(!pull) return;
    const dy = e.clientY - pull.startY;
    if(dy <= 0 || !armed()){ if(pull.active){ holdScroll(false); resetPull(); } pull = null; return; }
    if(!pull.active && dy < 6) return;
    /* the browser would otherwise rubber-band the page while we are drawing
       our own indicator, which is the blank white area this replaces */
    if(!pull.active) holdScroll(true);
    pull.active = true;
    pull.offset = pullOffset(dy, PULL_MAX);
    paintPull(pull.offset, pull.offset >= PULL_TRIGGER);
  }, {passive:true});
  const release = () => {
    if(!pull) return;
    const go = pull.active && pull.offset >= PULL_TRIGGER;
    if(pull.active) holdScroll(false);
    pull = null;
    if(go) runRefresh(); else resetPull();
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

}

/* ---------- 9. Map ---------- */
let map, myLayer, mapCentred = false;
/* Leaflet loads when the map is first opened, not before the app can draw.
   As a blocking <script> ahead of app.js, a slow CDN held the plot list back
   by the same delay though the list never uses the map, and a CDN that never
   answered left `L is not defined` and a blank map (finding B14).

   Integrity-checked: a tampered or truncated copy is refused rather than run,
   and the crossorigin request it needs is also what lets the service worker
   see the real status instead of an opaque one. */
const LEAFLET = {
  js:{src:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
      sri:'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g=='},
  css:{href:'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
       sri:'sha512-h9FcoyWjHcOcmEVkxOfTLnmZFWIH0iZhZT1H2TbOq55xssQGEJHEaIm+PgoUaZbRvQTNTluNOEfb1ZRy6D3BOw=='}
};
let leafletLoad = null;
function loadLeaflet(){
  if(window.L) return Promise.resolve();
  if(leafletLoad) return leafletLoad;
  leafletLoad = new Promise((ok, fail) => {
    if(!document.querySelector('link[data-leaflet]')){
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET.css.href; css.integrity = LEAFLET.css.sri;
      css.crossOrigin = 'anonymous'; css.dataset.leaflet = '1';
      document.head.appendChild(css);
    }
    const js = document.createElement('script');
    js.src = LEAFLET.js.src; js.integrity = LEAFLET.js.sri; js.crossOrigin = 'anonymous';
    js.onload = () => (window.L ? ok() : fail(new Error('leaflet')));
    js.onerror = () => { js.remove(); fail(new Error('leaflet')); };
    document.head.appendChild(js);
  }).catch(e => { leafletLoad = null; throw e; });    // a later tap tries again
  return leafletLoad;
}
function openMap(){
  if(map){ initMap(); return; }
  const note = $('#map-load');
  note.textContent = t('mapLoading'); note.classList.add('on');
  loadLeaflet().then(() => { note.classList.remove('on'); initMap(); })
    .catch(() => {
      note.innerHTML = `${esc(navigator.onLine ? t('mapFail') : t('noNet'))} <button class="retry" id="map-retry">${t('retry')}</button>`;
      const r = $('#map-retry'); if(r) r.addEventListener('click', openMap);
    });
}

function initMap(){
  if(map){ setTimeout(() => map.invalidateSize(), 80); return; }
  const c = S.locations.length ? [S.locations[0].lat, S.locations[0].lon] : [4.2105, 101.9758];
  map = L.map('map', {zoomControl:false, zoomSnap:0}).setView(c, S.locations.length ? 9 : 6);
  setBasemap(S.basemap || 'sat');
  myLayer = L.layerGroup().addTo(map);
  bindRail();
  bindMapSearch();
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
  /* CARTO now serves a 2KB "API KEY REQUIRED" placeholder on these endpoints at
     both 1x and 2x, so street and dark were silently blank. Esri needs no key and
     already backs the satellite layer, so all three basemaps share one provider
     and one attribution. */
  street:{ name:'bmStreet', cls:'bm-street', maxZoom:19,
        url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        attr:'Tiles © Esri' },
  dark:{ name:'bmDark', cls:'bm-dark', maxZoom:16,
        url:'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        attr:'Tiles © Esri' }
};
let baseTiles = [];
function setBasemap(id){
  const b = BASEMAPS[id] || BASEMAPS.sat;
  const next = BASEMAPS[id] ? id : 'sat';
  if(S.basemap !== next){ S.basemap = next; save(); }
  const wrap = $('#map');
  /* swap only our own basemap class: assigning className outright also wiped
     Leaflet's (leaflet-container, leaflet-touch-drag...), which is where the
     container gets overflow:hidden and touch-action:none. Without them the
     tiles spilled past the map and the browser's native panning fought
     Leaflet's drag handler. */
  if(wrap){
    Object.keys(BASEMAPS).forEach(k => wrap.classList.remove(BASEMAPS[k].cls));
    wrap.classList.add(b.cls);
  }
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
    b.addEventListener('click', () => {
      setBasemap(b.dataset.bm);
      host.classList.remove('on');
      const lb = $('[data-rail="layer"]'); if(lb) lb.classList.remove('on');
    }));
}

/* the location count used to be a chip floating on the map; on a page where
   every pixel of map counts it belongs in the header line instead */
function updateSub(){
  const el2 = $('#app-sub'); if(!el2) return;
  const onMap = document.body.classList.contains('map-mode');
  el2.textContent = onMap
    ? `${t('subMap')} · ${S.locations.length} ${t('locsUnit')(S.locations.length)}`
    : t('subSaved');
}

const RAIL = [
  ['locate', 'railLocate', '<circle cx="12" cy="12" r="3.4"/><circle cx="12" cy="12" r="7.6"/><path d="M12 1.6v3M12 19.4v3M22.4 12h-3M4.6 12h-3"/>'],
  ['add',    'railAdd',    '<path d="M12 5v14M5 12h14"/>'],
  ['layer',  'railLayer',  '<path d="m12 3 9 4.6-9 4.6-9-4.6L12 3z"/><path d="m3.6 12.4 8.4 4.3 8.4-4.3M3.6 16.9l8.4 4.3 8.4-4.3"/>']
];
function renderRail(){
  return RAIL.map(([id, key, path]) =>
    `<button data-rail="${id}" aria-label="${t(key)}" title="${t(key)}">
      <svg viewBox="0 0 24 24">${path}</svg></button>`).join('');
}
function bindRail(){
  const host = $('#map-rail'); if(!host) return;
  host.innerHTML = renderRail();
  host.querySelector('[data-rail="locate"]').addEventListener('click', locateMe);
  host.querySelector('[data-rail="layer"]').addEventListener('click', e => {
    const box = $('#basemaps'), btn = e.currentTarget;
    const open = box.classList.toggle('on');
    btn.classList.toggle('on', open);
  });
  host.querySelector('[data-rail="add"]').addEventListener('click',
    () => P.on ? exitPlace() : enterPlace(null));
}

/* Search results and "locate me" are long jumps. flyTo animates them over
   requestAnimationFrame, which browsers throttle in a backgrounded or
   non-compositing tab — the flight then never lands and the map silently stays
   put. These jumps are instant instead, which is also what the big map apps do
   for a search result. */
function jumpTo(lat, lon, minZoom){
  if(!map) return;
  map.setView([lat, lon], Math.max(map.getZoom(), minZoom), {animate:false});
}

/* Place search, shared by the add-location sheet and the map's search bar.
   They were near-copies (finding: copies drift, so a fix has to reach every
   one). 350 ms debounce, and the latest query wins: a slow reply for an
   abandoned query cannot paint over a newer one — nor, now, over an input
   that was cleared while it was in flight, which both copies allowed. The
   caller renders; every name it is handed is still untrusted text. */
const placeReq = makeLatest(), placeTimers = {};
function cancelPlaceSearch(key){ clearTimeout(placeTimers[key]); placeReq.begin(key); }
function placeSearch(key, q, on){
  clearTimeout(placeTimers[key]);
  const fresh = placeReq.begin(key);
  placeTimers[key] = setTimeout(async () => {
    try{
      const j = await geoSearch(q), rs = (j && j.results) || [];
      if(!fresh()) return;
      if(!rs.length) return on.empty();
      on.results(rs.map(r => ({r, region:[r.admin1, r.country].filter(Boolean).join(', '),
        at:`${(+r.latitude).toFixed(3)}°, ${(+r.longitude).toFixed(3)}°`})));
    }catch(e){
      if(!fresh()) return;
      on.fail(navigator.onLine ? t('failLoad') : t('noNet'));
    }
  }, 350);
}

function bindMapSearch(){
  const inp = $('#map-q'), out = $('#map-q-out');
  if(!inp || !out || inp.dataset.bound) return;
  inp.dataset.bound = '1';
  inp.placeholder = t('mapSearchPh');
  const clear = () => { out.className = 'ms-out'; out.innerHTML = ''; };
  const msg = txt => { out.className = 'ms-out on'; out.innerHTML = `<p>${txt}</p>`; };

  inp.addEventListener('input', e => {
    const q = e.target.value.trim();
    if(q.length < 2){ cancelPlaceSearch('map'); clear(); return; }
    msg(t('searching'));
    placeSearch('map', q, {
      empty:() => msg(t('noResult')),
      fail:msg,
      results:list => {
        out.className = 'ms-out on';
        out.innerHTML = '';
        list.slice(0, 6).forEach(({r, region, at}) => {
          const b = el(`<button class="ms-row"><span style="flex:1;min-width:0"><b>${esc(r.name)}</b>
            <small>${esc(region)} · ${at}</small></span><span class="go">›</span></button>`);
          b.addEventListener('click', () => {
            inp.value = ''; inp.blur(); clear();
            jumpTo(+r.latitude, +r.longitude, 12);
            if(typeof enterPlace === 'function') enterPlace({name:r.name, region});
          });
          out.appendChild(b);
        });
      }
    });
  });
}

/* Placement mode.

   The crosshair is fixed at the centre of the screen and the map moves under
   it, rather than the user tapping a spot: a finger covers the target it is
   trying to hit, and tap-to-place is what made every pan end in an accidental
   pin. Purely transient — never written to S. */
let P = {on:false, name:'', region:''};

function enterPlace(seed){
  if(!map) return;
  P = {on:true, name:(seed && seed.name) || '', region:(seed && seed.region) || ''};
  $('#map-cross').classList.add('on');
  const btn = $('[data-rail="add"]'); if(btn) btn.classList.add('on');
  map.on('move', syncPlaceCoords);
  renderPlaceBar();
}
function exitPlace(){
  P = {on:false, name:'', region:''};
  const cross = $('#map-cross'); if(cross) cross.classList.remove('on');
  const btn = $('[data-rail="add"]'); if(btn) btn.classList.remove('on');
  if(map) map.off('move', syncPlaceCoords);
  dropRail();
  const foot = $('#map-foot');
  if(foot){ foot.classList.remove('placing'); foot.textContent = t('mapHint'); }
}
/* On a short screen — landscape, or a small phone — the vertically centred rail
   runs into the confirm bar and its bottom button becomes unpressable. Lift it
   only when the two would actually meet, so tall screens keep the centred
   position the rail was designed around. */
function liftRailClear(){
  const rail = $('#map-rail'), foot = $('#map-foot');
  if(!rail || !foot) return;
  rail.style.top = ''; rail.style.bottom = ''; rail.style.transform = '';
  const r = rail.getBoundingClientRect(), f = foot.getBoundingClientRect();
  if(r.bottom <= f.top - 8) return;
  rail.style.top = 'auto';
  rail.style.transform = 'none';
  rail.style.bottom = Math.round(f.height + 32) + 'px';
}
function dropRail(){
  const rail = $('#map-rail');
  if(rail){ rail.style.top = ''; rail.style.bottom = ''; rail.style.transform = ''; }
}

function syncPlaceCoords(){
  const out = $('#place-coords');
  if(!out || !map) return;
  const c = map.getCenter();
  out.textContent = `${c.lat.toFixed(4)}°, ${c.lng.toFixed(4)}°`;
}
function renderPlaceBar(){
  const foot = $('#map-foot'); if(!foot) return;
  const c = map.getCenter();
  foot.classList.add('placing');
  foot.innerHTML = `
    <div class="pb-top"><span id="place-coords">${c.lat.toFixed(4)}°, ${c.lng.toFixed(4)}°</span></div>
    <input id="place-name" type="text" placeholder="${esc(t('placeName'))}" value="${esc(P.name)}">
    <div class="pb-row">
      <button class="pb-cancel" id="place-cancel">${t('placeCancel')}</button>
      <button class="pb-ok" id="place-ok">${t('placeConfirm')}</button>
    </div>`;
  liftRailClear();
  $('#place-cancel').addEventListener('click', exitPlace);
  $('#place-ok').addEventListener('click', () => {
    const c2 = map.getCenter();
    const lat = +c2.lat.toFixed(5), lon = +c2.lng.toFixed(5);
    const typed = $('#place-name').value.trim();
    addLocation({name:typed || `${lat.toFixed(3)}, ${lon.toFixed(3)}`,
                 region:typed ? P.region : '', lat, lon}, {stay:true});
    exitPlace();
  });
}

let myDot = null;
/* navigates only — saving the spot is a separate, deliberate act (press +) */
function locateMe(){
  const btn = $('[data-rail="locate"]');
  if(!navigator.geolocation){ toast(t('gpsFail')); return; }
  if(!window.isSecureContext){ toast(t('gpsInsecure')); return; }
  if(btn) btn.classList.add('busy');
  navigator.geolocation.getCurrentPosition(pos => {
    if(btn) btn.classList.remove('busy');
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    /* added to the map, not to myLayer, which refreshPins clears */
    if(myDot) map.removeLayer(myDot);
    myDot = L.marker([lat, lon], {interactive:false,
      icon:L.divIcon({className:'', html:'<div class="me-dot"></div>', iconSize:[0,0]})}).addTo(map);
    jumpTo(lat, lon, 14);
  }, err => {
    if(btn) btn.classList.remove('busy');
    toast(err && err.code === 1 ? t('gpsDenied') : t('gpsFail'));
  }, {enableHighAccuracy:true, timeout:12000, maximumAge:30000});
}

const pins = {};
function pinIcon(l){
  const d = cache[l.id], m = M(l.model || S.defaultModel);
  const temp = d && d.current ? fT(pick(d.current,'temperature_2m',m.id,true)) : '—';
  return L.divIcon({className:'', iconSize:[0,0],
    html:`<div class="pin${isStale(d) ? ' stale' : ''}"><b style="background:${m.color}">${temp}</b><small>${esc(l.name)}</small></div>`});
}
function updatePin(id){
  const l = S.locations.find(x => x.id === id);
  if(!l || !pins[id]) return;
  pins[id].setIcon(pinIcon(l));
}
function refreshPins(){
  updateSub();
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

$('#q').addEventListener('input', e => {
  const q = e.target.value.trim(), out = $('#q-out');
  const note = txt => { out.innerHTML = `<p class="searching">${txt}</p>`; };
  if(q.length < 2){ cancelPlaceSearch('sheet'); note(t('searchEmpty')); return; }
  note(t('searching'));
  placeSearch('sheet', q, {
    empty:() => note(t('noResult')),
    fail:note,
    results:list => {
      out.innerHTML = '';
      list.forEach(({r, region, at}) => {
        const b = el(`<button class="result"><span style="flex:1"><b>${esc(r.name)}</b>
          <small>${esc(region)} · ${at}</small></span><span class="go">›</span></button>`);
        b.addEventListener('click', () => addLocation({
          name:r.name, region, lat:+(+r.latitude).toFixed(5), lon:+(+r.longitude).toFixed(5)}));
        out.appendChild(b);
      });
    }
  });
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

/* opts.stay keeps the caller where it is — the map pins several places in a
   row, and jumping to the saved list after each one is unusable there.
   Returns the new location, or null when it duplicates an existing pin. */
function addLocation(o, opts){
  const stay = !!(opts && opts.stay);
  const dup = findNearby(S.locations, +o.lat, +o.lon);
  if(dup){
    toast(t('dupLoc'));
    if(!stay){
      hide();
      $('#m-name').value = $('#m-lat').value = $('#m-lon').value = '';
    }
    return null;
  }
  const l = {id:'l' + Date.now() + Math.floor(Math.random()*99), name:o.name, region:o.region || '',
             lat:+o.lat, lon:+o.lon, model:S.defaultModel, notify:[]};
  S.locations.push(l); save(); renderList(); refreshPins();
  if(!stay){ hide(); setTab('saved'); }
  loadCard(l);
  return l;
}

/* ---------- 11. Detail page ---------- */
let D = {loc:null, main:null, cmp:null, cmpIds:null, ext:null, acc:null, day:0, hvar:'temp', busy:false, seq:0};
let detailSeq = 0;

function openDetail(id){
  const loc = S.locations.find(x => x.id === id); if(!loc) return;
  /* a new location always opens on today; D.day survives everything else */
  D = {loc, main:null, cmp:null, cmpIds:null, ext:null, acc:null, day:0, hvar:'temp', busy:false, seq:++detailSeq};
  paintHead();
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
$('#nt-back').addEventListener('click', exitNotify);
$('#ly-back').addEventListener('click', exitLayout);
$('#d-modelbtn').addEventListener('click', () => { drawModelPicker(); show('#sheet-model'); });

function paintHead(){
  const loc = D.loc, m = M(loc.model || S.defaultModel), sum = D.main || cache[loc.id];
  $('#d-name').textContent = loc.name;
  $('#d-region').textContent = loc.region || coordText(loc);
  $('#d-modelname').textContent = m.short;
  $('#d-badge').innerHTML = `<span class="dot" style="background:${m.color}"></span>${m.short}`;
  const page = $('#detail');
  page.classList.remove('rain','cloud','night','clear');
  if(sum && sum.current){
    const c = sum.current, code = pick(c,'weather_code',m.id,true), day = pick(c,'is_day',m.id,true);
    const w = wmo(code);
    $('#d-icon').innerHTML = icon(iconFor(code, day), 110);
    $('#d-temp').innerHTML = `${Math.round(pick(c,'temperature_2m',m.id,true))}<span style="font-size:30px;letter-spacing:-1px">${uT()}</span>`;
    $('#d-cond').textContent = w[S.lang];
    if(day === 0) page.classList.add('night');
    else if(w.s === 'rain') page.classList.add('rain');
    else if(w.s === 'cloud') page.classList.add('cloud');
    else page.classList.add('clear');   /* sunny had no class at all before */
  } else {
    $('#d-icon').innerHTML = icon('cloud', 110);
    $('#d-temp').textContent = '—'; $('#d-cond').textContent = t('loading');
  }
  paintUpdated();
}
function paintUpdated(){
  const sum = D.main || cache[D.loc && D.loc.id], el = $('#d-upd');
  if(el) el.textContent = sum && sum._at ? updLabel(sum._at) : '';
  $('#detail').classList.toggle('stale', isStale(sum));
}

/* Every call starts a new sequence. It used to bump only while busy, and busy
   went false before the extras and compare replies had landed, so a reload
   could be overtaken by the replies of the load before it (finding B12).

   `quiet` is the refresh on return to the app: what is on screen stays up,
   greyed with its age, instead of dropping to a loading page, and a failure
   keeps it rather than replacing it with an error. */
async function loadDetail(opts){
  const quiet = !!(opts && opts.quiet);
  D.seq = ++detailSeq;
  D.busy = true;
  const seq = D.seq, loc = D.loc;
  const current = () => D.seq === seq;
  if(!quiet) $('#d-body').innerHTML = `<div class="big-msg"><p>${t('loading')}</p></div>`;
  try{
    const main = await getMain(loc);
    if(!current()) return;
    D.main = main;
    /* the page's reply is the newest data for the card too: supersede any
       card request still in flight so it cannot write an older one back */
    cardReq.begin(loc.id);
    cache[loc.id] = main;
    paintHead(); updateCard(loc.id); updatePin(loc.id);
    paintDetail();
    getExtras(loc).then(r => { if(!current()) return; D.ext = r; paintDetail(); })
                  .catch(() => { if(current() && !quiet){ D.ext = 'fail'; paintDetail(); } });
    fetchCompare();
  }catch(e){
    if(!current()) return;
    if(cache[loc.id] === undefined){ cache[loc.id] = null; updateCard(loc.id); }
    if(quiet){ paintHead(); return; }
    $('#d-body').innerHTML = `<div class="big-msg"><b>${t('failLoad')}</b>
      <p>${navigator.onLine ? '' : t('noNet')}</p><button class="retry" id="d-retry">${t('retry')}</button></div>`;
    const r = $('#d-retry'); if(r) r.addEventListener('click', () => loadDetail());
  }finally{
    if(current()) D.busy = false;
  }
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
    paintDetail();
    const sel = $('#d-body .dcell.on');
    if(sel) sel.scrollIntoView({inline:'center', block:'nearest'});
  }));
}

/* ----- Plain-language summary -----
   One line that turns a screen of numbers into something you can act on.
   The judgement lives in summary.js so all three languages share it. */
function renderSummary(){
  const d = D.main, dd = d && d.daily, ex = (D.ext && D.ext !== 'fail') ? D.ext : null;
  /* the field, not just the object: a response that carried no probabilities
     used to reach .slice() and take the whole detail page down with it */
  if(!dd || !dd.time || !dd.time[D.day] || !ex || !ex.hourly
     || !Array.isArray(ex.hourly.time) || !Array.isArray(ex.hourly.precipitation_probability)) return '';
  const dayISO = dd.time[D.day];
  const {start, n} = sliceDay(ex.hourly.time, dayISO);
  if(start < 0) return '';
  const probs = ex.hourly.precipitation_probability.slice(start, start + n);
  /* on today, rain that already fell is not a decision to make */
  const nowAt = nowIndex(ex.hourly.time.slice(start, start + n), (d.current && d.current.time) || '');
  const m = M(D.loc.model || S.defaultModel);
  const mx = pick(dd, 'temperature_2m_max', m.id, true);
  const sum = summarize({probs, tMax:mx && nz(mx[D.day]) ? mx[D.day] : null, from:nowAt >= 0 ? nowAt : 0});

  const PART = {night:'pNight', morning:'pMorning', afternoon:'pAfternoon', evening:'pEvening'};
  let txt;
  if(sum.kind === 'rain')          txt = t('sumRain')(t(PART[sum.part]), Math.round(sum.peak));
  else if(sum.kind === 'showers')  txt = t('sumShowers')(t(PART[sum.part]), Math.round(sum.peak));
  /* "all day" is only honest when the whole day was examined; on today the
     judgement starts at the current hour, so it says "from here on" instead */
  else if(sum.kind === 'hot')      txt = t(sum.rest ? 'sumHotRest' : 'sumHot')(fT(sum.tMax));
  else if(sum.kind === 'calm')     txt = t(sum.rest ? 'sumCalmRest' : 'sumCalm');
  else return '';
  return `<p class="d-sum">${esc(txt)}</p>`;
}

/* ----- Card grid -----
   A number with no sense of scale is just a number: 1007 hPa means nothing
   without knowing where it sits, and "SE" means nothing without a dial. */
const card = (title, body) => `<div class="wcard"><h5>${title}</h5>${body}</div>`;

/* Bearing to a point on a circle: 0deg is north, which in SVG is straight up. */
const onRing = (deg, r, cx, cy) => {
  const t = (deg - 90) * Math.PI / 180;
  return [ (cx + r * Math.cos(t)), (cy + r * Math.sin(t)) ];
};

/* A dense ring of ticks, cardinals longer. Sparse ticks read as a clock face;
   the density is what makes it read as an instrument. */
function tickRing(from, to, step, rOuter, shortLen, longEvery, longLen){
  let out = '';
  for(let d = from; d <= to; d += step){
    const isLong = Math.round(d / step) % longEvery === 0;
    const len = isLong ? longLen : shortLen;
    const [x1, y1] = onRing(d, rOuter, 50, 50);
    const [x2, y2] = onRing(d, rOuter - len, 50, 50);
    out += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
      stroke="rgba(255,255,255,${isLong ? '.5' : '.26'})" stroke-width="${isLong ? 1.5 : 1}" stroke-linecap="round"/>`;
  }
  return out;
}

function windCard(c, m){
  const g = k => pick(c, k, m.id, true);
  const sp = g('wind_speed_10m'), dir = g('wind_direction_10m'), gust = g('wind_gusts_10m');
  if(!nz(sp)) return '';
  const val = S.units.wind === 'ms' ? sp.toFixed(1) : String(Math.round(sp));

  let marks = '';
  if(nz(dir)){
    /* the dot sits where the wind comes FROM, the arrow shows where it goes —
       the pair is what makes the direction unambiguous */
    const [dx, dy] = onRing(dir, 33, 50, 50);
    const [ax, ay] = onRing(dir + 180, 33, 50, 50);
    marks = `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="3.2" fill="#fff"/>
      <g transform="translate(${ax.toFixed(1)} ${ay.toFixed(1)}) rotate(${(dir + 180).toFixed(1)})">
        <path d="M0 5 L-3.6 -2.5 L0 -1 L3.6 -2.5 Z" fill="#fff"/>
      </g>`;
  }
  const lab = (d, txt) => {
    const [x, y] = onRing(d, 23, 50, 50);
    return `<text x="${x.toFixed(1)}" y="${(y + 3).toFixed(1)}" fill="rgba(255,255,255,.72)"
      font-size="8.5" text-anchor="middle">${txt}</text>`;
  };
  return card(t('cWind'), `<div class="dial"><svg viewBox="0 0 100 100">
    ${tickRing(0, 355, 5, 40, 3.5, 6, 6)}
    ${lab(0,'N')}${lab(90,'E')}${lab(180,'S')}${lab(270,'W')}
    ${marks}
    <text x="50" y="50" fill="#fff" font-size="19" font-weight="600" text-anchor="middle">${val}</text>
    <text x="50" y="61" fill="rgba(255,255,255,.7)" font-size="8" text-anchor="middle">${uW()}</text>
    </svg></div><p class="cnote">${nz(gust) ? t('gust') + ' ' + fW(gust) : ''}${nz(dir) ? ' ' + compass(dir) : ''}</p>`);
}

/* Pressure sits on the same kind of ring rather than a car-style needle: the
   question is "where in the range is it", not "how fast is it going". */
function pressureCard(c, m){
  const v = pick(c, 'surface_pressure', m.id, true);
  if(!nz(v)) return '';
  const lo = 980, hi = 1040, SWEEP = 135;
  const frac = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const deg = -SWEEP + frac * SWEEP * 2;
  const [mx1, my1] = onRing(deg, 41, 50, 50);
  const [mx2, my2] = onRing(deg, 31, 50, 50);
  return card(t('cPress'), `<div class="dial"><svg viewBox="0 0 100 100">
    ${tickRing(-SWEEP, SWEEP, 5, 40, 3.5, 6, 6)}
    <line x1="${mx1.toFixed(1)}" y1="${my1.toFixed(1)}" x2="${mx2.toFixed(1)}" y2="${my2.toFixed(1)}"
      stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>
    <text x="50" y="52" fill="#fff" font-size="17" font-weight="600" text-anchor="middle">${Math.round(v)}</text>
    <text x="50" y="63" fill="rgba(255,255,255,.7)" font-size="8" text-anchor="middle">hPa</text>
    <text x="16" y="92" fill="rgba(255,255,255,.55)" font-size="8">${t('pressLow')}</text>
    <text x="84" y="92" fill="rgba(255,255,255,.55)" font-size="8" text-anchor="end">${t('pressHigh')}</text>
    </svg></div>`);
}

function sunCard(dd, m, today){
  const sr = pick(dd, 'sunrise', m.id, true), ss = pick(dd, 'sunset', m.id, true);
  if(!sr || !ss || !sr[D.day] || !ss[D.day]) return '';
  const hm = t2 => t2.slice(11, 16);
  const mins = t2 => (+t2.slice(11, 13)) * 60 + (+t2.slice(14, 16));
  const a = mins(sr[D.day]), b = mins(ss[D.day]);
  let dot = '';
  if(today && D.main.current && D.main.current.time){
    const now = mins(D.main.current.time);
    const f = Math.max(0, Math.min(1, (now - a) / Math.max(1, b - a)));
    const x = 12 + f * 76, y = 54 - Math.sin(f * Math.PI) * 34;
    dot = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#ffd76e"/>`;
  }
  return card(t('cSun'), `<div class="dial"><svg viewBox="0 0 100 66">
    <path d="M12 54 Q50 2 88 54" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="2" stroke-dasharray="3 3"/>
    <line x1="8" y1="54" x2="92" y2="54" stroke="rgba(255,255,255,.22)" stroke-width="1.4"/>${dot}
    <text x="12" y="64" fill="rgba(255,255,255,.75)" font-size="8.5">${hm(sr[D.day])}</text>
    <text x="88" y="64" fill="rgba(255,255,255,.75)" font-size="8.5" text-anchor="end">${hm(ss[D.day])}</text>
    </svg></div>`);
}

function uvCard(v){
  if(!nz(v)) return '';
  const lvl = v < 3 ? 'uvLow' : v < 6 ? 'uvMid' : v < 8 ? 'uvHigh' : v < 11 ? 'uvVeryHigh' : 'uvExtreme';
  const f = Math.max(0, Math.min(1, v / 12));
  return card(t('cUV'), `<div class="uvbox"><b>${Math.round(v)}</b><span>${t(lvl)}</span>
    <div class="uvbar"><i style="left:${(f * 100).toFixed(1)}%"></i></div></div>`);
}

function renderCardGrid(){
  const d = D.main; if(!d) return '';
  const m = M(D.loc.model || S.defaultModel);
  const c = d.current, dd = d.daily, today = D.day === 0;
  const ex = (D.ext && D.ext !== 'fail') ? D.ext : null;
  const eh = ex && ex.hourly ? ex.hourly : null;
  const k = (today && eh) ? nowIndex(eh.time, (c && c.time) || '') : -1;

  const uv = today
    ? (k >= 0 && eh.uv_index && nz(eh.uv_index[k]) ? eh.uv_index[k] : null)
    : (ex && ex.daily && nz(ex.daily.uv_index_max[D.day]) ? ex.daily.uv_index_max[D.day] : null);

  let cards = '';
  if(today && c){
    cards += windCard(c, m) + pressureCard(c, m);
  }
  cards += sunCard(dd, m, today) + uvCard(uv);
  if(today && c){
    const rh = pick(c, 'relative_humidity_2m', m.id, true), dp = pick(c, 'dew_point_2m', m.id, true);
    if(nz(rh)) cards += card(t('cHumid'),
      `<div class="cbig">${Math.round(rh)}%</div><p class="cnote">${nz(dp) ? t('dewPoint')(fT(dp)) : ''}</p>`);
    const vis = pick(c, 'visibility', m.id, true);
    if(nz(vis)){
      const km = vis / 1000;
      const q = km >= 10 ? 'visClear' : km >= 4 ? 'visOk' : 'visPoor';
      cards += card(t('cVis'), `<div class="cbig">${km >= 10 ? Math.round(km) : km.toFixed(1)} km</div><p class="cnote">${t(q)}</p>`);
    }
  }
  const ps = pick(dd, 'precipitation_sum', m.id, true);
  const prob = today
    ? (k >= 0 && eh && nz(eh.precipitation_probability[k]) ? eh.precipitation_probability[k] : null)
    : (ex && ex.daily && nz(ex.daily.precipitation_probability_max[D.day]) ? ex.daily.precipitation_probability_max[D.day] : null);
  if(ps && nz(ps[D.day])) cards += card(t('cRain'),
    `<div class="cbig">${fR(ps[D.day])}</div><p class="cnote">${nz(prob) ? Math.round(prob) + '%' : ''}</p>`);

  return cards ? `<div class="wgrid">${cards}</div>` : '';
}

/* ----- Ten-day overview -----
   The date strip answers "which day"; this answers "what kind of week".
   Rows are tappable, so it is a second way into the same selection. */
/* The ten-day list answers the same question as the strip above it, one row
   per day instead of one per hour, so it shows whichever metric is selected —
   and carries no heading, because ten dated rows are not ambiguous. */
function renderTenDay(){
  const d = D.main, dd = d && d.daily, hh = d && d.hourly;
  if(!dd || !dd.time || !dd.time.length) return '';
  const m = M(D.loc.model || S.defaultModel);
  const g = k => pick(dd, k, m.id, true);
  const nameOf = (day, i) => i === 0 ? t('today')
    : new Date(day + 'T12:00:00').toLocaleDateString(locale(), {weekday:'short'});
  const rows = D.hvar === 'rain' ? tenDayRain(dd, hh, g, m, nameOf)
             : D.hvar === 'wind' ? tenDayWind(dd, hh, m, nameOf)
             : tenDayTemp(dd, g, nameOf);
  return rows ? `<div class="glass tenday">${rows}</div>` : '';
}

function dayRow(i, name, inner){
  return `<button class="day${i === D.day ? ' on' : ''}" data-tenday="${i}">
    <span class="dn">${esc(name)}</span>${inner}</button>`;
}
/* hours of one day out of the ten-day hourly series */
function hoursOf(hh, day, arr){
  if(!hh || !hh.time || !arr) return null;
  const {start, n} = sliceDay(hh.time, day);
  if(start < 0) return null;
  const out = [];
  for(let k = 0; k < n; k++) out.push(nz(arr[start + k]) ? arr[start + k] : null);
  return out;
}

function tenDayTemp(dd, g, nameOf){
  const mx = g('temperature_2m_max'), mn = g('temperature_2m_min');
  const cd = g('weather_code'), ps = g('precipitation_sum');
  const all = [].concat(mx || [], mn || []).filter(nz);
  if(!all.length) return '';
  const lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  const rng = (hi - lo) > 0 ? (hi - lo) : 1;
  return dd.time.map((day, i) => {
    const a = mn ? mn[i] : null, b = mx ? mx[i] : null;
    let left = nz(a) ? ((a - lo) / rng) * 100 : 0;
    let wid = nz(a) && nz(b) ? Math.max(6, ((b - a) / rng) * 100) : 0;
    if(left + wid > 100) left = Math.max(0, 100 - wid);
    return dayRow(i, nameOf(day, i),
      `<span class="di">${icon(wmo(cd ? cd[i] : 3).i, 28)}</span>
       <span class="dp">${ps && nz(ps[i]) && ps[i] > 0 ? fR(ps[i]) : ''}</span>
       <span class="bar"><i style="left:${left.toFixed(1)}%;width:${wid.toFixed(1)}%"></i></span>
       <span class="dt"><i>${fT(a)}</i>${fT(b)}</span>`);
  }).join('');
}

function tenDayRain(dd, hh, g, m, nameOf){
  const ps = g('precipitation_sum');
  const ex = (D.ext && D.ext !== 'fail') ? D.ext : null;
  const pp = ex && ex.daily && ex.daily.precipitation_probability_max;
  const H = hh ? pick(hh, 'precipitation', m.id, true) : null;
  /* one scale across all ten days, or a damp Friday would draw itself as
     heavily as a flooded Wednesday */
  let top = 0;
  const series = dd.time.map(day => {
    const a = hoursOf(hh, day, H);
    if(a) a.forEach(x => { if(nz(x) && x > top) top = x; });
    return a;
  });
  top = Math.max(top, 0.6);
  return dd.time.map((day, i) => dayRow(i, nameOf(day, i),
    `<span class="spark">${series[i] ? sparkBars(series[i], top) : ''}</span>
     <span class="dv">${ps && nz(ps[i]) && ps[i] > 0 ? rainOut(ps[i]) + ' ' + uR() : '—'}</span>
     <span class="dq">${pp && nz(pp[i]) ? DROP + pp[i] + '%' : ''}</span>`)).join('');
}

function tenDayWind(dd, hh, m, nameOf){
  const W2 = hh ? pick(hh, 'wind_speed_10m', m.id, true) : null;
  const G2 = hh ? pick(hh, 'wind_gusts_10m', m.id, true) : null;
  let lo = Infinity, hi = -Infinity;
  const series = dd.time.map(day => {
    const sp = hoursOf(hh, day, W2);
    if(!sp) return null;
    const gu = hoursOf(hh, day, G2) || sp.map(() => null);
    sp.concat(gu).forEach(x => { if(nz(x)){ if(x < lo) lo = x; if(x > hi) hi = x; } });
    return {sp, gu};
  });
  if(!isFinite(lo)) return '';
  return dd.time.map((day, i) => {
    const s = series[i];
    const vals = s ? s.sp.filter(nz) : [];
    const range = vals.length
      ? `${windShown(Math.min.apply(null, vals))} – ${windShown(Math.max.apply(null, vals))}`
      : '—';
    return dayRow(i, nameOf(day, i),
      `<span class="spark">${s ? sparkLine(s.sp, s.gu, lo, hi) : ''}</span>
       <span class="dv wide">${range} <em>${uW()}</em></span>`);
  }).join('');
}

const SPK_W = 96, SPK_H = 22;
function sparkBars(a, top){
  const step = SPK_W / a.length, bw = Math.max(1.5, step - 1.5);
  const bars = a.map((x, k) => {
    const wet = nz(x) && x > 0;
    const h = wet ? Math.max(2.5, x / top * SPK_H) : 2.5;
    return `<rect class="${wet ? 'wet' : 'dry'}" x="${(k * step).toFixed(1)}" y="${(SPK_H - h).toFixed(1)}"
      width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="0.8"/>`;
  }).join('');
  return `<svg class="sbar" width="${SPK_W}" height="${SPK_H}" viewBox="0 0 ${SPK_W} ${SPK_H}">${bars}</svg>`;
}
function sparkLine(sp, gu, lo, hi){
  const n = sp.length;
  if(n < 2) return '';
  const x = k => (k / (n - 1) * SPK_W);
  const y = val => hi === lo ? SPK_H / 2
                 : SPK_H - 2 - (val - lo) / (hi - lo) * (SPK_H - 4);
  const pts = arr => arr.map((val, k) => nz(val) ? `${x(k).toFixed(1)},${y(val).toFixed(1)}` : null)
                        .filter(Boolean);
  const line = pts(sp), band = pts(gu);
  if(line.length < 2) return '';
  const shade = (band.length === line.length && gu.some((val, k) => nz(val) && nz(sp[k]) && val > sp[k] + 0.5))
    ? `<polygon class="wband" points="${band.concat(line.slice().reverse()).join(' ')}"/>` : '';
  return `<svg class="sline" width="${SPK_W}" height="${SPK_H}" viewBox="0 0 ${SPK_W} ${SPK_H}">
    ${shade}<polyline points="${line.join(' ')}"/></svg>`;
}

function bindTenDay(){
  $$('#d-body [data-tenday]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.tenday;
    if(i === D.day) return;
    D.day = i;
    paintDetail();
    /* the strip and the chart are above; jumping back makes the change visible */
    $('#detail').scrollTop = 0;
  }));
}

/* ----- Selected-day blocks ----- */
/* the heading every per-day block carries, so nothing on the page is ambiguous
   about which of the ten days it describes */
function dayLabel(){
  const dd = D.main && D.main.daily;
  if(!dd || !dd.time || !dd.time[D.day]) return '';
  return new Date(dd.time[D.day] + 'T12:00:00')
    .toLocaleDateString(locale(), {month:'long', day:'numeric', weekday:'short'});
}

/* ----- Conditions -----
   One card: which metric you are looking at, a switch for the other two, and
   the selected day's hours. Temperature is what most people want most of the
   time, so it leads; rain and wind are one tap away rather than a scroll. */
const HVARS = [
  ['temp', 'vTemp', '<path d="M14 14.8V5a2.5 2.5 0 0 0-5 0v9.8a5 5 0 1 0 5 0z"/>'],
  ['rain', 'vRain', '<path d="M12 3.2s5 5.6 5 8.8a5 5 0 0 1-10 0c0-3.2 5-8.8 5-8.8z"/>'],
  ['wind', 'vWind', '<path d="M3 8h10a2.6 2.6 0 1 0-2.6-2.6M3 12h14a2.6 2.6 0 1 1-2.6 2.6M3 16h8"/>']
];

/* Each metric is shown in the form that reads fastest, the way iOS does it:
   temperature as a glyph and a number, precipitation as intensity bars you can
   scan for the wet hours, wind as one continuous line carrying the day's shape.
   Copying the layout without copying that would miss the point. */
const HCOL_W = 62, HCOL_GAP = 6, RAIN_H = 46, WIND_H = 36;   /* must match index.html */
const DROP = '<svg class="hdrop" viewBox="0 0 24 24"><path d="M12 3.2s5 5.6 5 8.8a5 5 0 0 1-10 0c0-3.2 5-8.8 5-8.8z"/></svg>';
const xOf = k => k * (HCOL_W + HCOL_GAP) + HCOL_W / 2;

function renderHourStrip(){
  const d = D.main, m = M(D.loc.model || S.defaultModel);
  const hh = d && d.hourly, dd = d && d.daily;
  if(!hh || !hh.time || !dd || !dd.time || !dd.time[D.day]) return '';
  const {start, n} = sliceDay(hh.time, dd.time[D.day]);
  if(start < 0) return '';
  const nowAt = nowIndex(hh.time.slice(start, start + n), (d.current && d.current.time) || '');
  const ex = (D.ext && D.ext !== 'fail') ? D.ext : null;
  const P2 = {};
  if(ex && ex.hourly && ex.hourly.precipitation_probability)
    ex.hourly.time.forEach((tm, k) => { P2[tm] = ex.hourly.precipitation_probability[k]; });

  const v = D.hvar;
  const T2 = pick(hh,'temperature_2m',m.id,true);
  const R2 = pick(hh,'precipitation',m.id,true);
  const W2 = pick(hh,'wind_speed_10m',m.id,true);
  const G2 = pick(hh,'wind_gusts_10m',m.id,true);
  const Wd = pick(hh,'wind_direction_10m',m.id,true);
  const C2 = pick(hh,'weather_code',m.id,true), Dy = pick(hh,'is_day',m.id,true);
  const hourAt = k => k === nowAt ? t('now2') : hh.time[start + k].slice(11,16);
  const probAt = k => { const p = P2[hh.time[start + k]]; return nz(p) ? p : null; };
  const head = k => `<div class="hh">${hourAt(k)}</div>`;
  const cls = k => `hcol${k === nowAt ? ' nowcol' : ''}`;

  let cols = '', over = '', foot = '', sub;

  if(v === 'rain'){
    /* bars are read against each other, so one scale for the whole day — with a
       floor of 1 mm, or a drizzle would draw itself as a downpour */
    const mm = [];
    for(let k = 0; k < n; k++) mm.push(nz(R2 && R2[start + k]) ? R2[start + k] : 0);
    const top = Math.max(1, ...mm);
    for(let k = 0; k < n; k++){
      const h = mm[k] > 0 ? Math.max(4, Math.round(mm[k] / top * RAIN_H)) : 0;
      const p = probAt(k);
      cols += `<div class="${cls(k)}">${head(k)}
        <div class="hmm">${mm[k] > 0 ? rainOut(mm[k]) : ''}</div>
        <div class="hbar"><i style="height:${h}px"></i></div>
        <div class="hp">${p === null ? '' : DROP + p + '%'}</div></div>`;
    }
    sub = `${t('sInten')} (${uR()}) · ${t('sChance')}`;
    /* two quantities from two sources in one card: the bars are the selected
       model's, the percentages cannot be, and saying so here means it does not
       depend on the rain-chance chart further down being visible */
    foot = `<p class="note" style="margin:9px 0 0">${t('srcRain')}</p>`;

  } else if(v === 'wind'){
    const sp = [], gu = [];
    for(let k = 0; k < n; k++){
      sp.push(nz(W2 && W2[start + k]) ? W2[start + k] : null);
      gu.push(nz(G2 && G2[start + k]) ? G2[start + k] : null);
    }
    for(let k = 0; k < n; k++){
      /* the arrow points where the wind is going: a bearing is reported as the
         direction it blows FROM, so the glyph is turned the other way round */
      const dir = Wd && nz(Wd[start + k]) ? (Wd[start + k] + 180) % 360 : null;
      const turn = dir === null ? 'style="opacity:.35"' : `style="transform:rotate(${dir.toFixed(0)}deg)"`;
      cols += `<div class="${cls(k)}">${head(k)}
        <div class="harrowbox"><svg class="harrow" viewBox="0 0 24 24" ${turn}><path d="M12 19V6M12 6l-5 5M12 6l5 5"/></svg></div>
        <div class="ht">${nz(sp[k]) ? windShown(sp[k]) : '—'}</div>
        <div class="hu">${uW()}</div></div>`;
    }
    over = windLine(sp, gu, n, nowAt);
    sub = `${t('vWind')} (${uW()}) · ${t('gust')}`;

  } else {
    for(let k = 0; k < n; k++){
      const i = start + k;
      cols += `<div class="${cls(k)}">${head(k)}
        <div class="hi">${icon(iconFor(C2 ? C2[i] : 3, Dy ? Dy[i] : 1), 30)}</div>
        <div class="ht">${fT(T2 ? T2[i] : null)}</div></div>`;
    }
    sub = `${t('vTemp')} (${uT()})`;
  }

  const sw2 = HVARS.map(([id, key, path]) =>
    `<button class="hsw${id === v ? ' on' : ''}" data-hvar="${id}" aria-label="${t(key)}" title="${t(key)}">
      <svg viewBox="0 0 24 24">${path}</svg></button>`).join('');
  const w = n * HCOL_W + (n - 1) * HCOL_GAP;

  return `<div class="glass cond">
    <div class="cond-hd">
      <div><h4 style="margin:0">${t('condT')}</h4>
        <p class="cond-sub">${esc(sub)}</p></div>
      <div class="hswrow">${sw2}</div>
    </div>
    <div class="hstrip ${v}"><div class="hrow" style="width:${w}px">${cols}${over}</div></div>${foot}</div>`;
}

/* One line across the whole day rather than a number per column: the shape is
   the information. Dashed behind the current hour, solid ahead of it, with the
   gust band shaded above so a calm average with violent gusts cannot hide. */
function windLine(sp, gu, n, nowAt){
  const seen = sp.concat(gu).filter(nz);
  if(seen.length < 2) return '';
  const lo = Math.min(...seen), hi = Math.max(...seen);
  const y = val => hi === lo ? WIND_H / 2
                 : WIND_H - 4 - (val - lo) / (hi - lo) * (WIND_H - 8);
  const at = (arr, k) => nz(arr[k]) ? `${xOf(k).toFixed(1)},${y(arr[k]).toFixed(1)}` : null;
  const run = (arr, from, to) => { const p = []; for(let k = from; k <= to; k++){ const q = at(arr, k); if(q) p.push(q); } return p; };

  const cut = (nowAt >= 0 && nowAt < n) ? nowAt : 0;
  const past = run(sp, 0, cut), future = run(sp, cut, n - 1);
  const gust = run(gu, 0, n - 1), speed = run(sp, 0, n - 1);

  let band = '';
  if(gust.length > 1 && speed.length === gust.length && gu.some((g, k) => nz(g) && nz(sp[k]) && g > sp[k] + 0.5))
    band = `<polygon class="wband" points="${gust.concat(speed.slice().reverse()).join(' ')}"/>`;

  const dot = (nowAt >= 0 && nz(sp[nowAt]))
    ? `<circle class="wdot" cx="${xOf(nowAt).toFixed(1)}" cy="${y(sp[nowAt]).toFixed(1)}" r="3.4"/>` : '';
  const w = n * HCOL_W + (n - 1) * HCOL_GAP;

  return `<svg class="hline" width="${w}" height="${WIND_H}" viewBox="0 0 ${w} ${WIND_H}">
    ${band}
    ${past.length > 1 ? `<polyline class="wpast" points="${past.join(' ')}"/>` : ''}
    ${future.length > 1 ? `<polyline class="wnow" points="${future.join(' ')}"/>` : ''}
    ${dot}</svg>`;
}

function bindHourStrip(){
  $$('#d-body [data-hvar]').forEach(b => b.addEventListener('click', () => {
    if(D.hvar === b.dataset.hvar) return;
    D.hvar = b.dataset.hvar;
    paintDetail();
  }));
}

/* Observations belong to today and only today. Showing this minute's pressure
   under a heading that says 3 October would be exactly the kind of ambiguity
   this rebuild exists to remove, so other days get that day's aggregates and
   the rows with no daily equivalent are dropped rather than filled with —. */
function renderCells(){
  const d = D.main; if(!d) return '';
  const m = M(D.loc.model || S.defaultModel);
  const g = (o,k) => pick(o, k, m.id, true);
  const dd = d.daily, i = D.day, today = i === 0;
  const ex = (D.ext && D.ext !== 'fail') ? D.ext : null;
  const pp = ex && ex.daily ? ex.daily.precipitation_probability_max : null;
  const uv = ex && ex.daily ? ex.daily.uv_index_max : null;
  const sr = g(dd,'sunrise'), ss = g(dd,'sunset');
  const at = (arr, f) => (arr && nz(arr[i])) ? f(arr[i]) : null;
  /* rain chance and UV always come from Best Match, but this card is headed
     with the chosen model's name — so those two cells say their own source */
  const bm = m.id === 'best_match' ? '' : ' <i class="src">Best Match</i>';
  const rows = [];
  if(today){
    const c = d.current;
    const dir = g(c,'wind_direction_10m');
    rows.push([t('humid'), nz(g(c,'relative_humidity_2m')) ? Math.round(g(c,'relative_humidity_2m')) + '%' : null]);
    rows.push([nz(dir) ? `${t('wind')} · ${t('dir')} ${compass(dir)}` : t('wind'),
               nz(g(c,'wind_speed_10m')) ? fW(g(c,'wind_speed_10m')) : null]);
    rows.push([t('gust'), nz(g(c,'wind_gusts_10m')) ? fW(g(c,'wind_gusts_10m')) : null]);
    rows.push([t('rainToday'), at(g(dd,'precipitation_sum'), fR)]);
    rows.push([t('press'), nz(g(c,'surface_pressure')) ? Math.round(g(c,'surface_pressure')) + ' hPa' : null]);
  } else {
    rows.push([t('tMax'), at(g(dd,'temperature_2m_max'), fT)]);
    rows.push([t('tMin'), at(g(dd,'temperature_2m_min'), fT)]);
    rows.push([t('windMax'), at(g(dd,'wind_speed_10m_max'), fW)]);
    rows.push([t('gust'), at(g(dd,'wind_gusts_10m_max'), fW)]);
    rows.push([t('rainSum'), at(g(dd,'precipitation_sum'), fR)]);
  }
  /* These two used to read the DAILY MAXIMUM while sitting under a heading
     that says "right now". At 21:00 on a clear evening the card announced a
     100% rain chance and a UV of 9 — both were today's peaks, from hours ago.
     Today now reads the current hour; other days keep the daily figure and
     say plainly that it is a maximum. */
  if(today){
    const eh = ex && ex.hourly ? ex.hourly : null;
    const k = eh ? nowIndex(eh.time, (d.current && d.current.time) || '') : -1;
    const hourly = (arr, f) => (k >= 0 && arr && nz(arr[k])) ? f(arr[k]) : null;
    rows.push([t('rainChance') + bm, hourly(eh && eh.precipitation_probability, v => Math.round(v) + '%')]);
    rows.push([t('uv') + bm, hourly(eh && eh.uv_index, v => String(Math.round(v)))]);
  } else {
    rows.push([t('rainChanceMax') + bm, at(pp, v => Math.round(v) + '%')]);
    rows.push([t('uvMax') + bm, at(uv, v => String(Math.round(v)))]);
  }
  rows.push([t('sunrise'), (sr && sr[i]) ? sr[i].slice(11,16) : null]);
  rows.push([t('sunset'), (ss && ss[i]) ? ss[i].slice(11,16) : null]);
  const cells = rows.filter(r => r[1] !== null && r[1] !== undefined)
    .map(r => `<div class="cell"><small>${r[0]}</small><b>${r[1]}</b></div>`).join('');
  if(!cells) return '';
  const head = today
    ? `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/></svg>${t('now')}`
    : esc(dayLabel());
  return `<div class="glass"><h4>${head}<span class="r">${m.short}</span></h4>
    <div class="grid2">${cells}</div></div>`;
}

/* ----- The detail page -----
   One linear read from top to bottom, every block describing the day selected
   in the strip. There are no tabs: the old three-way split was the reason the
   same weather lived in three places (spec §4.1).

   The order below is the DEFAULT, not the law. Everyday use is "what are the
   next few hours" and then "what about the rest of the week", so the hourly
   strip and the ten-day list — the same question at two scales — lead, and the
   multi-model comparison you open to interrogate them sits underneath. Which
   is right for most people and wrong for some: spraying wants wind at the top,
   harvesting wants accumulated rain. So this registry is what a saved layout
   is resolved against, and adding a row here is all a new section needs to
   reach people who already rearranged their page. */
const SECTIONS = [
  {id:'summary',  key:'lySummary',  render:renderSummary},
  {id:'hourly',   key:'condT',      render:renderHourStrip},
  {id:'tenday',   key:'lyTenday',   render:renderTenDay},
  {id:'cards',    key:'lyCards',    render:renderCardGrid},
  {id:'cells',    key:'lyCells',    render:renderCells},
  {id:'chartT',   key:'lyChartT',   render:renderTempChart},
  {id:'chartP',   key:'lyChartP',   render:renderProbChart},
  {id:'accuracy', key:'lyAccuracy', render:renderAccuracyCard}
];
const sectionIds = () => SECTIONS.map(s => s.id);
const sectionById = id => SECTIONS.find(s => s.id === id);

function paintDetail(){
  if(!D.main){ $('#d-body').innerHTML = `<div class="big-msg"><p>${t('loading')}</p></div>`; return; }
  /* the extras and compare replies repaint the page after it has drawn, and
     used to wipe a name being typed into the rename box */
  const ri = $('#d-rename'), typing = !!ri && document.activeElement === ri;
  const caret = typing ? [ri.selectionStart, ri.selectionEnd] : null;
  /* the day strip is fixed at the top: it and the ten-day list are the only
     two ways to change the selected day, and it is the one that cannot be
     hidden, so the page can never strand you on today */
  const body = resolveLayout(S.layout, sectionIds())
    .filter(x => x.on)
    .map(x => sectionById(x.id).render())
    .join('');
  $('#d-body').innerHTML = renderDayStrip() + body + `
    <div class="glass" style="padding-bottom:10px">
      <h4>${t('editName')}</h4>
      <div class="field" style="margin-bottom:10px"><label>${t('rename')}</label>
        <input id="d-rename" type="text" value="${esc(D.renameDraft !== undefined ? D.renameDraft : D.loc.name)}"></div>
      <button class="cta ghost" id="d-saveName" style="margin-bottom:12px">${t('saveLoc')}</button>
      <button class="dangerbtn" id="d-remove">${t('rmLoc')}</button>
    </div>`;
  bindDayStrip();
  bindHourStrip();
  bindTenDay();
  bindModelChips();
  buildChart('#ch-temp', {vari:'temp', fill:true, marks:true});
  buildChart('#ch-prob', {vari:'prob', fill:true, marks:false, yRange:[0,100]});
  /* the strip starts at 00:00 so the whole day is there, but on today that
     would open on the small hours — put the current hour in the middle */
  const hs = $('#d-body .hstrip'), nc = $('#d-body .hcol.nowcol');
  if(hs && nc) hs.scrollLeft = Math.max(0, nc.offsetLeft - (hs.clientWidth - nc.clientWidth) / 2);
  paintAccuracyCard();
  const rn = $('#d-rename');
  rn.addEventListener('input', () => { D.renameDraft = rn.value; });
  if(typing){ rn.focus({preventScroll:true}); try{ rn.setSelectionRange(caret[0], caret[1]); }catch(e){} }
  $('#d-saveName').addEventListener('click', () => {
    const v = $('#d-rename').value.trim(); if(!v) return;
    D.renameDraft = undefined;
    /* the worker uses this as the notification title */
    D.loc.name = v; save(); paintHead(); renderList(); refreshPins(); scheduleSync(); toast(t('savedOk'));
  });
  $('#d-remove').addEventListener('click', () => {
    S.locations = S.locations.filter(x => x.id !== D.loc.id);
    delete cache[D.loc.id]; save(); renderList(); refreshPins(); scheduleSync(); exitDetail(); toast(t('deleted'));
  });
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
    ${spreadNote()}${coverageNote()}
  </div>`;
}
/* Rain probability. One source (best_match) and one line, so it always gets
   the gradient. Nothing is drawn at all when D.ext failed — an empty axis
   would read as "0% all day", which is a different claim (spec §4.6). */
function renderProbChart(){
  if(!D.ext || D.ext === 'fail') return '';
  return `<div class="glass">
    <h4>${t('rainChance')}<span class="r">%</span></h4>
    <div class="chartwrap" id="ch-prob"></div>
    <p class="note" style="margin-bottom:0">${t('probSrc')}</p>
  </div>`;
}

/* Model selection, right beside the chart it drives. Reads and writes the same
   S.compare the settings page does.

   Every model is listed, not only the ones already fetched. Listing just the
   loaded set meant that narrowing to a single model made the whole row vanish,
   and the row is the only way back — a one-way trap out of which the settings
   page was the sole escape. Toggling a model that is already on board stays a
   pure repaint (spec §5); ticking one that is not genuinely needs its data, so
   that case — and only that case — refetches. */
function renderModelChips(){
  const dead = D.cmp === 'fail';
  return `<div class="mchips${dead ? ' dead' : ''}">` + MODELS.map(m => {
    const on = S.compare.includes(m.id);
    /* selected while the compare payload is in flight: the line appears when
       it lands, and the chip says so rather than looking inert */
    const pending = on && !D.cmp;
    return `<button class="mchip${on ? ' on' : ''}${pending ? ' pending' : ''}" data-mchip="${m.id}"${dead ? ' disabled' : ''}>
      <span class="mdot" style="background:${m.color}"></span>${esc(m.short)}</button>`;
  }).join('') + '</div>';
}
function bindModelChips(){
  $$('#d-body [data-mchip]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.mchip;
    const loaded = (D.cmpIds && D.cmpIds.length) ? D.cmpIds : [];
    /* same rule as the settings page: the chart never ends up with no line */
    if(S.compare.includes(id)){
      if(S.compare.length <= 1) return;
      S.compare = S.compare.filter(x => x !== id);
    } else {
      S.compare = MODELS.map(m => m.id).filter(x => S.compare.includes(x) || x === id);
    }
    save();
    if(S.compare.every(x => loaded.includes(x))){
      b.classList.toggle('on', S.compare.includes(id));
      buildChart('#ch-temp', {vari:'temp', fill:true, marks:true});
      return;
    }
    reloadCompare();
  }));
}

/* refetch the compare payload for the current selection; used when a model the
   page does not hold is ticked on */
/* The only way a compare payload is fetched. It used to be written in three
   places, and only one had the location guard (finding B12: "duplicated code
   drifts apart"). A reply counts only if it is for the page still open and
   is the latest compare request; the ids it records are the ones actually in
   the payload, not the selection at the moment it landed — otherwise a model
   dropped by a partial failure was marked as loaded and never refetched. */
const cmpReq = makeLatest();
function loadedIds(r, ids){
  const hh = r && r.hourly, single = ids.length === 1;
  if(!hh) return [];
  return ids.filter(id => { const v = pick(hh, 'temperature_2m', id, single); return Array.isArray(v) && v.some(nz); });
}
function fetchCompare(){
  const seq = D.seq, loc = D.loc, ids = S.compare.slice(), fresh = cmpReq.begin('cmp');
  const ok = () => D.seq === seq && fresh();
  getCompare(loc, ids).then(r => {
    if(!ok()) return;
    D.cmp = r; D.cmpIds = loadedIds(r, ids); paintDetail();
  }).catch(() => { if(!ok()) return; D.cmp = 'fail'; paintDetail(); });
}
function reloadCompare(){
  D.cmp = null; D.cmpIds = null;
  paintDetail();
  fetchCompare();
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

/* How far apart the models are on the selected day. Same idea as the old
   compare tab's spread card, but scoped to the day on screen and folded into
   the chart it describes rather than given a section of its own. */
/* Hours of temperature each compared model has on the selected day, and the
   last date it has any. Models reach different distances ahead: past the end
   of its range a model used to vanish from the chart with its chip still on
   and no word why, and on its last part-day its six hours were set against
   another model's twenty-four in the spread (finding B4). */
const FULL_DAY_H = 20;
function coverage(){
  const d = (D.cmp && D.cmp !== 'fail' && D.cmp.hourly) ? D.cmp : null;
  const dd = D.main && D.main.daily;
  if(!d || !dd || !dd.time || !dd.time[D.day]) return null;
  const {start, n} = sliceDay(d.hourly.time, dd.time[D.day]);
  if(start < 0) return null;
  const single = S.compare.length === 1;
  return S.compare.map(id => {
    const v = pick(d.hourly, 'temperature_2m', id, single) || [];
    let last = -1;
    for(let i = v.length - 1; i >= 0; i--) if(nz(v[i])){ last = i; break; }
    return {id, hours:v.slice(start, start + n).filter(nz).length,
            lastDay:last >= 0 ? String(d.hourly.time[last]).slice(0, 10) : null};
  });
}
function coverageNote(){
  const cov = coverage();
  if(!cov) return '';
  const date = iso => new Date(iso + 'T12:00:00').toLocaleDateString(locale(), {month:'short', day:'numeric'});
  const zh = S.lang === 'zh', paren = x => zh ? `（${x}）` : ` (${x})`, list = a => a.join(zh ? '、' : ', ');
  const none = cov.filter(c => c.hours === 0)
    .map(c => M(c.id).short + (c.lastDay ? paren(t('covUntil')(date(c.lastDay))) : ''));
  const part = cov.filter(c => c.hours > 0 && c.hours < FULL_DAY_H)
    .map(c => M(c.id).short + paren(t('covHours')(c.hours)));
  let out = '';
  if(none.length) out += `<p class="note" style="margin-bottom:0">${esc(t('covNone')(list(none)))}</p>`;
  if(part.length) out += `<p class="note" style="margin-bottom:0">${esc(t('covPart')(list(part)))}</p>`;
  return out;
}
function spreadNote(){
  const d = (D.cmp && D.cmp !== 'fail' && D.cmp.hourly) ? D.cmp : null;
  const dd = D.main && D.main.daily;
  if(!d || !dd || !dd.time || !dd.time[D.day] || S.compare.length < 2) return '';
  const {start, n} = sliceDay(d.hourly.time, dd.time[D.day]);
  if(start < 0) return '';
  const single = S.compare.length === 1;
  /* only models with the whole day: a part-day max or sum is not comparable */
  const full = new Set((coverage() || []).filter(c => c.hours >= FULL_DAY_H).map(c => c.id));
  if(full.size < 2) return '';
  let tLo = Infinity, tHi = -Infinity, rLo = Infinity, rHi = -Infinity, any = false, rAny = false;
  S.compare.filter(id => full.has(id)).forEach(id => {
    const tv = pick(d.hourly,'temperature_2m',id,single), rv = pick(d.hourly,'precipitation',id,single);
    if(tv){
      const q = tv.slice(start, start + n).filter(nz);
      if(q.length){ any = true; const mx = Math.max.apply(null,q); tLo = Math.min(tLo,mx); tHi = Math.max(tHi,mx); }
    }
    if(rv){
      const q = rv.slice(start, start + n).filter(nz);
      if(q.length){ rAny = true; const sum = q.reduce((a,b) => a + b, 0); rLo = Math.min(rLo,sum); rHi = Math.max(rHi,sum); }
    }
  });
  if(!any) return '';
  const dt = isFinite(tHi - tLo) ? (tHi - tLo).toFixed(1) : '—';
  const dr = rAny && isFinite(rHi - rLo) ? (rHi - rLo).toFixed(S.units.rain === 'inch' ? 2 : 1) : '—';
  return `<p class="note" style="margin-bottom:0">${t('spreadTxt')(dt, dr, uT(), uR())}</p>`;
}

/* ----- Accuracy tab: verify each model against ECMWF ERA5 reanalysis ----- */
/* The one block on this page that is NOT about the selected day: it scores the
   models over the past week. It is deliberately last, ruled off and on a darker
   background, and its title always says so — a date-keyed page could otherwise
   make it read as "this day's accuracy", which is the very confusion this
   rebuild removes (spec §3). */
function renderAccuracyCard(){
  return `<div class="accblock" id="acc-host"></div>`;
}

function accCardHTML(){
  if(!D.acc)
    return `<div class="glass"><h4>${t('accT7')}<span class="r">${t('accSub')}</span></h4>
      <p class="note" style="margin:0 0 12px">${t('accIdle')}</p>
      <button class="retry" id="a-run" style="width:100%">${t('accRun')}</button></div>`;
  if(D.acc === 'busy')
    return `<div class="glass"><h4>${t('accT7')}<span class="r">${t('accSub')}</span></h4>
      <p class="note" style="margin:0">${t('accLoading')}</p></div>`;
  const a = D.acc;
  if(!a.rows.length)
    return `<div class="glass"><h4>${t('accT7')}</h4>
      <p class="note" style="margin:0 0 12px">${t('accNone')}</p>
      <button class="retry" id="a-retry" style="width:100%">${t('retry')}</button></div>`;
  const skill = a.mode === 'skill';
  const rows = a.rows.map((r, i) => {
    const pct = a.max > 0 ? Math.min(100, (r.v / a.max) * 100) : 0;
    const val = skill ? `${r.v.toFixed(2)} / ${r.v3.toFixed(2)} ${a.unit}` : `${r.v.toFixed(2)} ${a.unit}`;
    return `<div class="mrow" style="display:block">
      <div style="display:flex;align-items:center;gap:11px">
        <span class="mdot" style="background:${r.color}"></span>
        <span class="mn">${i === 0 ? '<b>' + r.name + '</b>' : r.name}</span>
        <span class="mv">${val}</span>
      </div>
      <div class="accbar"><i style="width:${(100 - pct).toFixed(0)}%;background:${r.color}"></i></div>
    </div>`;
  }).join('');
  const missing = skill && a.missing.length
    ? `<p class="note">${esc(t('accMissing')(a.missing.map(id => M(id).short).join(S.lang === 'zh' ? '、' : ', ')))}</p>` : '';
  return `<div class="glass">
      <h4>${skill ? t('accT7') : t('accCons')}<span class="r">${skill ? t('accMae') : ''}</span></h4>
      <p class="note" style="margin:0 0 12px">${skill ? t('accWindow')(a.from, a.to, a.n) : t('accNone')}</p>
      <div class="mlist">${rows}</div>
      ${missing}
      <p class="note">${skill ? t('accMethodEra') : t('accConsD')}</p>
      <p class="note" style="margin-bottom:0"><b>${a.rows[0].name}</b> · ${a.rows[0].v.toFixed(2)} ${a.unit} — ${skill ? t('accBest') : t('accCons')}</p>
      ${skill ? `<p class="note">${t('accEraNote')}</p>` : ''}
      <button class="retry" id="a-retry" style="width:100%">${t('retry')}</button>
    </div>`;
}

/* fills the card in place, so a finished verification never repaints the page
   under the user's finger */
function paintAccuracyCard(){
  const host = $('#acc-host'); if(!host) return;
  host.innerHTML = accCardHTML();
  const r = host.querySelector('#a-retry');
  if(r) r.addEventListener('click', () => { D.acc = null; paintAccuracyCard(); });
  const run = host.querySelector('#a-run');
  if(run) run.addEventListener('click', () => { runAccuracy(); paintAccuracyCard(); });
  if(!D.acc) armAccuracy();
}

/* The check costs two slow requests — ERA5 plus every model's past output — and
   it sits at the bottom of a long page, so opening a location does not pay for a
   block the user may never reach. It starts when that block is scrolled near, and
   the idle card carries a button so it is never only reachable by scrolling. */
let accScroll = null;
function armAccuracy(){
  const page = $('#detail');
  const off = () => { if(accScroll){ page.removeEventListener('scroll', accScroll); accScroll = null; } };
  off();
  if(D.acc) return;
  const check = () => {
    const host = $('#acc-host');
    if(!host){ off(); return; }
    if(D.acc){ off(); return; }
    if(host.getBoundingClientRect().top > page.clientHeight + 140) return;
    off();
    runAccuracy();
    paintAccuracyCard();
  };
  accScroll = check;
  page.addEventListener('scroll', check, {passive:true});
  check();
}

async function runAccuracy(){
  D.acc = 'busy';
  const loc = D.loc, models = S.compare.slice(), seq = D.seq;
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
    /* ERA5 is published about a week late. The old window, days -7 to -4,
       often had one day of it; two weeks back to six days back leaves
       several full days, and the dates shown are the ones that came back. */
    const from = ymd(new Date(now - 14 * day)), to = ymd(new Date(now - 6 * day));
    const [era, prev] = await Promise.all([getEra5(loc, from, to), getPrevRuns(loc, scored, from, to)]);
    const truth = {};
    if(era && era.hourly && era.hourly.time)
      era.hourly.time.forEach((tm, i) => { const v = era.hourly.temperature_2m[i]; if(nz(v)) truth[tm.slice(0, 13)] = v; });
    const ph = prev && prev.hourly, nTruth = Object.keys(truth).length;
    if(nTruth >= 24 && ph && ph.time){
      const single = scored.length === 1;
      const lead = (id, n) => pick(ph, 'temperature_2m_previous_day' + n, id, single) || [];
      const idx = ph.time.map((tm, i) => ({k:tm.slice(0, 13), i})).filter(x => truth[x.k] !== undefined);
      /* a model missing most of the window is left out rather than shrinking
         everyone's sample to nothing */
      const usable = scored.filter(id => idx.filter(x => nz(lead(id, 1)[x.i]) && nz(lead(id, 3)[x.i])).length >= 0.8 * idx.length);
      /* every model scored on the same hours: each used to be averaged over
         its own set and then ranked against the others */
      const hours = idx.filter(x => usable.every(id => nz(lead(id, 1)[x.i]) && nz(lead(id, 3)[x.i])));
      if(usable.length && hours.length >= 24){
        /* MAE is a difference in °C; only the scale changes for °F */
        const conv = S.units.temp === 'fahrenheit' ? 1.8 : 1;
        const mae = (id, n) => hours.reduce((a, x) => a + Math.abs(lead(id, n)[x.i] - truth[x.k]), 0) / hours.length * conv;
        const rows = usable.map(id => ({id, name:M(id).short, color:M(id).color, v:mae(id, 1), v3:mae(id, 3)}))
          .sort((a, b) => a.v - b.v);
        out = {mode:'skill', rows, unit:uT(), max:Math.max.apply(null, rows.map(r => Math.max(r.v, r.v3))),
               from:hours[0].k.slice(0, 10), to:hours[hours.length - 1].k.slice(0, 10), n:hours.length,
               missing:scored.filter(id => !usable.includes(id))};
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

  /* the same guard loadDetail uses: a verification for a location the user has
     already left must never paint over the one now on screen */
  if(D.seq !== seq) return;
  D.acc = out || {mode:'consensus', rows:[], max:0, unit:uT()};
  if($('#detail').classList.contains('on')) paintAccuracyCard();
}

/* ---------- 11b. Reminder settings page ---------- */
const WIN_LABEL = {morning:'wMorning', afternoon:'wAfternoon', evening:'wEvening', night:'wNight'};
/* rule -> which unit it is shown in, and how to convert to and from metric */
const RULE_UNIT = {
  rainProb:{unit:() => '%',   out:v => v,              back:v => v},
  rainSum: {unit:uR,          out:v => S.units.rain === 'inch' ? v / 25.4 : v,
                              back:v => S.units.rain === 'inch' ? v * 25.4 : v},
  tMax:    {unit:uT,          out:v => S.units.temp === 'fahrenheit' ? v * 9 / 5 + 32 : v,
                              back:v => S.units.temp === 'fahrenheit' ? (v - 32) * 5 / 9 : v},
  wind:    {unit:uW,          out:v => windOut(v), back:v => windBack(v)},
  gust:    {unit:uW,          out:v => windOut(v), back:v => windBack(v)}
};
RULE_UNIT.tMin = RULE_UNIT.tMax;
const WIND_PER_KMH = {kmh:1, mph:0.621371, kn:0.539957, ms:0.277778};
const windOut  = v => v * (WIND_PER_KMH[S.units.wind] || 1);
const windBack = v => v / (WIND_PER_KMH[S.units.wind] || 1);
/* one decimal for the units where whole numbers would be too coarse */
const ruleShown = k => {
  const raw = RULE_UNIT[k].out(S.notify.rules[k].v);
  return (k === 'rainSum' && S.units.rain === 'inch') ? raw.toFixed(2)
       : String(Math.round(raw * 10) / 10);
};

function openNotify(){
  normalizeNotify();
  /* nothing used to re-try a failed registration; opening the page does */
  if(S.notify.enabled) scheduleSync(1);
  const page = $('#notify');
  page.scrollTop = 0;
  page.classList.add('on');
  document.body.style.overflow = 'hidden';
  try{
    /* Opened from the settings sheet, which already owns a history entry.
       hide()'s history.back() is async and used to land AFTER this push,
       swallowing it — leaving the page open with no way for the back button
       to close it and body scroll locked. One overlay, one entry. */
    if(history.state && history.state.pw === 'sheet') history.replaceState({pw:'notify'}, '');
    else history.pushState({pw:'notify'}, '');
  }catch(e){}
  paintNotify();
}
function closeNotify(){
  $('#notify').classList.remove('on');
  document.body.style.overflow = '';
  if(openSheetId === '#sheet-set') drawSettings();
}
function exitNotify(){
  if(history.state && history.state.pw === 'notify') history.back();
  else closeNotify();
}

/* ---------- 11c. Detail-page layout ----------
   The same press-and-hold drag as the locations list, over a list of sections
   instead of places. What is written back is the resolved override, so the
   stored value is always canonical and a section added in a later release
   still finds its way in (layout.js). */
function openLayout(){
  const page = $('#layout');
  page.scrollTop = 0;
  page.classList.add('on');
  document.body.style.overflow = 'hidden';
  try{
    /* same one-overlay-one-entry rule as the notify page */
    if(history.state && history.state.pw === 'sheet') history.replaceState({pw:'layout'}, '');
    else history.pushState({pw:'layout'}, '');
  }catch(e){}
  paintLayout();
}
function closeLayout(){
  $('#layout').classList.remove('on');
  document.body.style.overflow = '';
  if(openSheetId === '#sheet-set') drawSettings();
}
function exitLayout(){
  if(history.state && history.state.pw === 'layout') history.back();
  else closeLayout();
}

function layoutRows(){
  return resolveLayout(S.layout, sectionIds());
}
/* every write goes through here, so nothing but a normalized layout is ever
   stored and the detail page repaints only when it is actually open */
function commitLayout(next){
  S.layout = normalizeLayout(next, sectionIds());
  save();
  paintLayout();
  if($('#detail').classList.contains('on') && D.main) paintDetail();
}

function paintLayout(){
  const rows = layoutRows();
  const body = rows.map(r => {
    const sec = sectionById(r.id);
    const note = r.id === 'chartT' ? `<small class="ly-note">${t('lyChipNote')}</small>` : '';
    return `<div class="ly-row${r.on ? '' : ' off'}" data-ly="${r.id}">
      <span class="ly-grip" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 9h16M4 15h16"/></svg></span>
      <span class="ly-txt"><b>${esc(t(sec.key))}</b>${note}</span>
      <button class="ly-sw" data-lytoggle="${r.id}" role="switch" aria-checked="${r.on}"
        aria-label="${esc(t(sec.key))} · ${r.on ? t('lyOn') : t('lyOff')}">${sw(r.on)}</button>
    </div>`;
  }).join('');
  const none = rows.every(r => !r.on) ? `<p class="nt-note" style="margin:12px 0 0">${t('lyAllHidden')}</p>` : '';
  const dflt = isDefaultLayout(S.layout, sectionIds());
  $('#ly-body').innerHTML = `
    <div class="group">
      <p style="margin:0 0 12px">${t('lyDesc')}</p>
      <div id="ly-list">${body}</div>
      ${none}
    </div>
    <div class="group">
      <button class="cta ghost" id="ly-reset"${dflt ? ' disabled' : ''}>${t('lyReset')}</button>
    </div>`;

  $$('#ly-body [data-lytoggle]').forEach(b => b.addEventListener('click', () => {
    if(lySuppressClick) return;                   // the press that ended a drag
    const id = b.dataset.lytoggle;
    const cur = layoutRows();
    commitLayout({
      order:  cur.map(x => x.id),
      hidden: cur.filter(x => x.id === id ? x.on : !x.on).map(x => x.id)
    });
  }));
  const rb = $('#ly-reset');
  if(rb) rb.addEventListener('click', () => { S.layout = null; save(); paintLayout();
    if($('#detail').classList.contains('on') && D.main) paintDetail(); });
}

/* The locations list drags whole cards against the window scroll; this list
   drags uniform rows inside a page that scrolls itself. Same hold-then-move
   rule, same pure arithmetic from listlogic.js, different geometry. */
let lyDrag = null, lySuppressClick = false;
function lyMetrics(){
  const rows = Array.from(document.querySelectorAll('#ly-list .ly-row'));
  const st = $('#layout').scrollTop;
  return rows.map(el => {
    const r = el.getBoundingClientRect();
    return {el, h:r.height, centre:r.top + st + r.height / 2};
  });
}
function lyBegin(){
  if(!lyDrag) return;
  const m = lyMetrics();
  const from = m.findIndex(x => x.el === lyDrag.row);
  if(from < 0){ lyDrag = null; return; }
  lyDrag.on = true; lyDrag.from = from; lyDrag.to = from; lyDrag.metrics = m;
  lyDrag.slot = m[from].h;
  lyDrag.row.classList.add('dragging');
  $('#ly-list').classList.add('reordering');
  holdScroll(true);
}
function lyPaint(){
  if(!lyDrag || !lyDrag.on) return;
  const st = $('#layout').scrollTop;
  const dy = (lyDrag.clientY + st) - lyDrag.startPageY;
  lyDrag.row.style.transform = `translateY(${dy}px) scale(1.02)`;
  const to = targetIndex(lyDrag.metrics.map(x => x.centre), lyDrag.metrics[lyDrag.from].centre + dy);
  lyDrag.to = to;
  lyDrag.metrics.forEach((x, i) => {
    if(i === lyDrag.from) return;
    let shift = 0;
    if(lyDrag.from < to && i > lyDrag.from && i <= to) shift = -lyDrag.slot;
    else if(lyDrag.from > to && i >= to && i < lyDrag.from) shift = lyDrag.slot;
    x.el.style.transform = shift ? `translateY(${shift}px)` : '';
  });
}
function lyEnd(){
  if(!lyDrag) return;
  clearTimeout(lyDrag.holdTimer);
  const d = lyDrag;
  lyDrag = null;
  if(!d.on) return;
  holdScroll(false);
  $('#ly-list').classList.remove('reordering');
  d.metrics.forEach(x => { x.el.style.transform = ''; });
  d.row.classList.remove('dragging');
  /* a drag that ends over a row's switch must not also flip it */
  lySuppressClick = true;
  setTimeout(() => { lySuppressClick = false; }, 60);
  if(d.to === d.from) return;
  const cur = layoutRows();
  commitLayout({
    order:  moveItem(cur.map(x => x.id), d.from, d.to),
    hidden: cur.filter(x => !x.on).map(x => x.id)
  });
}
function initLayoutReorder(){
  const page = $('#layout');
  page.addEventListener('pointerdown', e => {
    if(e.button !== undefined && e.button !== 0) return;
    const row = e.target.closest('#ly-list .ly-row');
    if(!row) return;
    lyDrag = {row, on:false, clientY:e.clientY,
              startPageY:e.clientY + page.scrollTop, startClientY:e.clientY};
    lyDrag.holdTimer = setTimeout(lyBegin, HOLD_MS);
  });
  page.addEventListener('pointermove', e => {
    if(!lyDrag) return;
    lyDrag.clientY = e.clientY;
    if(!lyDrag.on){
      if(Math.abs(e.clientY - lyDrag.startClientY) > SLOP){ clearTimeout(lyDrag.holdTimer); lyDrag = null; }
      return;
    }
    lyPaint();
  });
  ['pointerup','pointercancel'].forEach(ev => page.addEventListener(ev, lyEnd));
  window.addEventListener('pointerup', lyEnd);
}

const sw = on => `<span class="sw${on ? ' on' : ''}"><i></i></span>`;

function renderPermission(){
  const supported = typeof Notification !== 'undefined';
  const perm = supported ? Notification.permission : 'unsupported';
  let top = '';
  if(supported && perm === 'default')
    top = `<button class="cta ghost" id="nt-ask" style="margin-bottom:12px">${t('ntPermAsk')}</button>`;
  else if(supported && perm === 'granted')
    top = `<p class="nt-note" style="margin-bottom:12px">✓ ${t('ntPermOn')}</p>`;
  else if(supported && perm === 'denied')
    top = `<p class="nt-note" style="margin-bottom:12px">${t('ntPermDenied')}</p>`;
  /* success has to be earned: syncMessage never reports ok for a device that
     has not actually registered */
  const m = syncMessage(syncState, !!S.notify.enabled, perm);
  let warn;
  if(m.kind === 'ok')        warn = `<p class="nt-ok">✓ ${t('ntSynced')}<br>${t('ntIosHint')}</p>`;
  else if(m.kind === 'busy') warn = `<p class="nt-warn">${t('ntSyncing')}</p>`;
  else if(m.kind === 'warn') warn = `<p class="nt-warn">${m.reason === 'noblocks' ? t(S.locations.some(l => (l.notify || []).length) ? 'ntNoActive' : 'ntNoBlocksSel') : t('ntNeedPerm')}<br>${t('ntIosHint')}</p>`;
  else warn = `<p class="nt-warn">${t('ntSyncFail')}<br><code class="nt-why">${esc(m.reason)}${lastSyncError ? ' · ' + esc(lastSyncError) : ''}</code><br>${t('ntIosHint')}</p>`;
  const test = (supported && perm === 'granted')
    ? `<button class="cta ghost" id="nt-test">${t('ntTest')}</button>` : '';
  return top + warn + test;
}

function renderWindows(){
  return S.notify.windows.map(w => {
    const name = t(WIN_LABEL[w.id]);
    if(!w.on)
      return `<div class="nt-win"><div class="nt-win-hd"><b>${name}</b>
        <span data-wsw="${w.id}">${sw(false)}</span></div></div>`;
    const cross = minutesOf(w.to) <= minutesOf(w.from)
      ? `<div class="nt-cross">${t('ntCross')}</div>` : '';
    return `<div class="nt-win">
      <div class="nt-win-hd"><b>${name}</b><span data-wsw="${w.id}">${sw(true)}</span></div>
      <div class="nt-win-body">
        <div class="nt-times">
          <div class="nt-fld"><label>${t('ntFrom')}</label><input type="time" data-wt="${w.id}:from" value="${w.from}"></div>
          <div class="nt-fld"><label>${t('ntTo')}</label><input type="time" data-wt="${w.id}:to" value="${w.to}"></div>
        </div>
        <div class="nt-fld"><label>${t('ntAt')}</label><input type="time" data-wt="${w.id}:at" value="${w.at}"></div>
        ${cross}
        <div class="nt-mode">
          <button data-wm="${w.id}:digest" class="${w.mode === 'digest' ? 'on' : ''}">${t('ntDigest')}</button>
          <button data-wm="${w.id}:threshold" class="${w.mode === 'threshold' ? 'on' : ''}">${t('ntThreshold')}</button>
        </div>
      </div></div>`;
  }).join('');
}

function renderRules(){
  const LBL = {rainProb:'rRainProb', rainSum:'rRainSum', tMax:'rTMax', tMin:'rTMin', wind:'rWind', gust:'rGust'};
  return NOTIFY_RULES.map(k => {
    const r = S.notify.rules[k];
    /* tMin is a floor warning, so it reads ≤ while everything else reads ≥.
       Showing the operator is the only thing stopping people filling it in backwards. */
    const op = k === 'tMin' ? '≤' : '≥';
    return `<div class="nt-rule${r.on ? '' : ' off'}">
      <span data-rsw="${k}">${sw(r.on)}</span>
      <span class="rn">${t(LBL[k])}</span>
      <span class="op">${op}</span>
      <input type="number" inputmode="decimal" data-rv="${k}" value="${ruleShown(k)}">
      <span class="un">${RULE_UNIT[k].unit()}</span>
    </div>`;
  }).join('');
}

function renderMatrix(){
  const wins = S.notify.windows.filter(w => w.on);
  if(!S.locations.length) return `<p class="nt-note">${t('ntNoLoc')}</p>`;
  if(!wins.length) return `<p class="nt-note">${t('ntNoWin')}</p>`;
  const head = wins.map(w =>
    `<th><button data-col="${w.id}">${t(WIN_LABEL[w.id])}</button></th>`).join('');
  const rows = S.locations.map(l => {
    const on = l.notify || [];
    const cells = wins.map(w => `<td><span class="nt-cell${on.includes(w.id) ? ' on' : ''}" data-mx="${l.id}:${w.id}">
      <svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></span></td>`).join('');
    return `<tr><td>${esc(l.name)}</td>${cells}</tr>`;
  }).join('');
  return `<table class="nt-mx"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

/* the zone the reminders will actually use: the plots', when they agree */
function zoneLabel(){
  const zones = new Set(S.locations.filter(l => (l.notify || []).length)
    .map(l => (cache[l.id] && cache[l.id].timezone)).filter(Boolean));
  if(zones.size === 1) return [...zones][0];
  if(zones.size > 1) return [...zones].join(', ');
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/* toggles the "crosses midnight" line for one card, in place */
function refreshCrossNote(w, inp){
  const card = inp.closest('.nt-win'); if(!card) return;
  const body = card.querySelector('.nt-win-body'); if(!body) return;
  const need = minutesOf(w.to) <= minutesOf(w.from);
  let note = card.querySelector('.nt-cross');
  if(need && !note){
    note = document.createElement('div');
    note.className = 'nt-cross';
    note.textContent = t('ntCross');
    body.insertBefore(note, body.querySelector('.nt-mode'));
  } else if(!need && note){
    note.remove();
  }
}

/* Refreshes only the status block.

   The sync lands three seconds after an edit, and repainting the whole page
   there tore out whatever time picker the user had open — the same fault as
   the change handler, just delayed enough to look like a different bug. */
function paintSyncStatus(){
  const host = $('#nt-status'); if(!host) return;
  host.innerHTML = renderPermission();
  bindStatusButtons();
}
function bindStatusButtons(){
  const ask = $('#nt-ask');
  if(ask) ask.addEventListener('click', () => {
    Notification.requestPermission().then(() => { paintSyncStatus(); scheduleSync(0); }).catch(() => {});
  });
  const test = $('#nt-test');
  if(test) test.addEventListener('click', sendTestNotification);
}

function paintNotify(){
  const N = S.notify;
  $('#nt-body').innerHTML = `
    <div class="nt-master"><b>${t('ntMaster')}</b><span id="nt-on">${sw(N.enabled)}</span></div>
    <div id="nt-status">${renderPermission()}</div>
    <div class="glass"><h4>${t('ntWindows')}</h4>
      <p class="nt-note" style="margin:-4px 0 12px">${esc(t('ntTzNote')(zoneLabel()))}</p>
      <p class="nt-note" style="margin:-4px 0 12px">${esc(t('ntModelNote'))}</p>
      ${renderWindows()}</div>
    <div class="glass"><h4>${t('ntRules')}</h4>${renderRules()}</div>
    <div class="glass"><h4>${t('ntBlocks')}</h4>${renderMatrix()}</div>`;
  bindNotify();
}

function bindNotify(){
  const redraw = () => { save(); scheduleSync(); paintNotify(); };
  $('#nt-on').addEventListener('click', () => { S.notify.enabled = !S.notify.enabled; redraw(); });

  $$('#nt-body [data-wsw]').forEach(el2 => el2.addEventListener('click', () => {
    const w = S.notify.windows.find(x => x.id === el2.dataset.wsw);
    /* deliberately does NOT touch l.notify: turning a window off hides its
       column, and turning it back on must bring the old ticks back */
    if(w){ w.on = !w.on; redraw(); }
  }));
  $$('#nt-body [data-wt]').forEach(inp => inp.addEventListener('change', () => {
    const [id, field] = inp.dataset.wt.split(':');
    const w = S.notify.windows.find(x => x.id === id);
    if(!w) return;
    /* A native time picker fires change while the wheel is still spinning.
       Repainting here tore the open picker out of the DOM mid-gesture, so
       this updates the model and touches only the one line that can change. */
    if(minutesOf(inp.value) < 0){ inp.value = w[field]; return; }
    w[field] = inp.value;
    save(); scheduleSync();
    refreshCrossNote(w, inp);
  }));
  $$('#nt-body [data-wm]').forEach(b => b.addEventListener('click', () => {
    const [id, mode] = b.dataset.wm.split(':');
    const w = S.notify.windows.find(x => x.id === id);
    if(w){ w.mode = mode; redraw(); }
  }));

  $$('#nt-body [data-rsw]').forEach(el2 => el2.addEventListener('click', () => {
    const r = S.notify.rules[el2.dataset.rsw];
    if(r){ r.on = !r.on; redraw(); }
  }));
  $$('#nt-body [data-rv]').forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.rv, n = parseFloat(inp.value);
    /* same reason: reset this one field rather than rebuilding the page
       around a control the user is still in */
    if(!Number.isFinite(n)){ inp.value = ruleShown(k); return; }
    S.notify.rules[k].v = RULE_UNIT[k].back(n);
    save(); scheduleSync();
  }));

  $$('#nt-body [data-mx]').forEach(el2 => el2.addEventListener('click', () => {
    const [lid, wid] = el2.dataset.mx.split(':');
    const l = S.locations.find(x => x.id === lid);
    if(!l) return;
    l.notify = l.notify || [];
    l.notify = l.notify.includes(wid) ? l.notify.filter(x => x !== wid) : l.notify.concat(wid);
    redraw();
  }));
  $$('#nt-body [data-col]').forEach(b => b.addEventListener('click', () => {
    const wid = b.dataset.col;
    const all = S.locations.every(l => (l.notify || []).includes(wid));
    S.locations.forEach(l => {
      l.notify = l.notify || [];
      l.notify = all ? l.notify.filter(x => x !== wid)
                     : (l.notify.includes(wid) ? l.notify : l.notify.concat(wid));
    });
    redraw();
  }));

  bindStatusButtons();
}

/* the one thing on this page that really does fire today — it proves the
   permission and the service worker path, nothing more */
function sendTestNotification(){
  const body = {body:t('ntTestBody'), icon:'icon-192.png', badge:'icon-192.png', tag:'pw-test'};
  if('serviceWorker' in navigator){
    navigator.serviceWorker.getRegistration().then(reg => {
      if(reg && reg.showNotification) return reg.showNotification(t('ntTestTitle'), body);
      new Notification(t('ntTestTitle'), body);
    }).catch(() => toast(t('ntTestFail')));
    return;
  }
  try{ new Notification(t('ntTestTitle'), body); }catch(e){ toast(t('ntTestFail')); }
}

/* ---------- 11c. Push registration ----------
   The settings live on the phone; the worker needs its own copy to know who
   to wake and when. Anything that changes the schedule re-syncs. */
const PUSH_API = 'https://comparecast-push.hockhynnwoo.workers.dev';
const VAPID_PUBLIC = 'BBjBjJlP2b9oTWJFPK1CvEXXrrafJC0xmhlbOurC6GssgQQegLTVxAtfSk-iFVYmFPtkZqGIVTJhX3uRHP9TO1M';
/* 'unknown' until a registration actually succeeds — see syncMessage() */
let syncState = 'unknown', syncTimer = null, lastSyncError = '';

function deviceId(){
  /* also replaces an id saved by the old fallback, which the server refused
     forever because it carried a '.' (notifylogic.js) */
  if(!validDeviceId(S.deviceId)){
    S.deviceId = makeDeviceId(crypto);
    save();
  }
  return S.deviceId;
}

/* Withdraw this device from the worker. The response used to go unchecked,
   so a failed withdrawal looked exactly like a successful one while the old
   schedule kept sending. 404 means there was nothing to withdraw. */
async function withdrawDevice(){
  const res = await fetch(PUSH_API + '/sub', {method:'DELETE', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id:deviceId()})});
  if(!res.ok && res.status !== 404) throw new Error('HTTP ' + res.status);
}

/* A sync that failed for a reason time can fix — the network, a server
   error, a withdrawal that did not land — tries again a few times with a
   growing gap, instead of waiting for the next time the app is opened. */
let syncRetries = 0;
function retrySync(){
  if(syncRetries >= 5) return;
  syncRetries++;
  scheduleSync(30000 * syncRetries);
}

const b64ToBytes = b64 => {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};
const bytesToB64 = buf => btoa(String.fromCharCode.apply(null, new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/* debounced: changing four settings in a row is one registration, not four */
function scheduleSync(ms){
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncPush, ms === undefined ? 3000 : ms);
}

async function syncPush(){
  const done = st => { syncState = st; if($('#notify').classList.contains('on')) paintSyncStatus(); };
  if(!('serviceWorker' in navigator) || typeof Notification === 'undefined'
     || typeof PushManager === 'undefined') return done('unsupported');
  /* `ready` rather than getRegistration(): on a cold start the worker may not
     have taken control yet, and the old code silently gave up in that window */
  let reg;
  try{ reg = await navigator.serviceWorker.ready; }catch(e){ return done('nosw'); }
  if(!reg || !reg.pushManager) return done('nosw');

  /* switched off, or permission gone: withdraw rather than leave the worker
     pushing at a device that no longer wants it */
  if(!S.notify.enabled || Notification.permission !== 'granted'){
    try{
      const old = await reg.pushManager.getSubscription();
      if(old) await old.unsubscribe();
      await withdrawDevice();
    }catch(e){
      lastSyncError = (e && e.message) || 'withdraw';
      retrySync();
      return done('withdraw');
    }
    syncRetries = 0;
    return done('unknown');
  }

  /* what the worker would actually send for: ticked windows that are also
     switched on. Ticks alone used to be enough to POST, and a plot whose
     windows were all off got the whole registration rejected while the old
     schedule stayed live on the server. */
  const blocks = effectiveBlocks(S.locations, S.notify.windows);
  if(!blocks.length){
    try{ await withdrawDevice(); }
    catch(e){
      lastSyncError = (e && e.message) || 'withdraw';
      retrySync();
      return done('withdraw');
    }
    syncRetries = 0;
    return done('noblocks');
  }

  done('syncing');
  let sub;
  try{
    sub = await reg.pushManager.getSubscription();
    if(!sub) sub = await reg.pushManager.subscribe(
      {userVisibleOnly:true, applicationServerKey:b64ToBytes(VAPID_PUBLIC)});
  }catch(e){
    /* iOS refuses this outright unless the app was opened from the Home
       Screen, and that refusal used to vanish into a bare catch */
    lastSyncError = (e && (e.name + ': ' + e.message)) || 'subscribe';
    return done('subscribe');
  }
  try{
    const keys = sub.toJSON().keys || {};
    const body = {
      id:deviceId(),
      tz:Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      lang:S.lang,
      units:S.units,
      sub:{endpoint:sub.endpoint, keys:{p256dh:keys.p256dh, auth:keys.auth}},
      notify:{windows:S.notify.windows, rules:S.notify.rules},
      /* the plot's own zone, so "6am" means 6am at the field — right even if
         the phone is somewhere else. Falls back to the device's zone only
         when the forecast for that plot has not loaded yet. */
      blocks:blocks.map(({loc:l, windows}) =>
        ({id:l.id, name:l.name, lat:l.lat, lon:l.lon, windows,
          tz:(cache[l.id] && cache[l.id].timezone) || undefined,
          /* the plot's model, so a reminder quotes the figures its page shows */
          model:l.model || S.defaultModel}))
    };
    const res = await fetch(PUSH_API + '/sub', {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    if(!res.ok){
      let why = '';
      try{ why = (await res.json()).error || ''; }catch(e2){}
      lastSyncError = 'HTTP ' + res.status + (why ? ' · ' + why : '');
      /* a 4xx will not fix itself; a 5xx might */
      if(res.status >= 500) retrySync();
      return done('http' + res.status);
    }
    lastSyncError = '';
    syncRetries = 0;
    return done('synced');
  }catch(e){
    retrySync();
    lastSyncError = (e && (e.name + ': ' + e.message)) || 'network';
    return done('failed');
  }
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
      /* the old model's payload goes with the old choice: repainting from it
         put its numbers under the new model's badge, and kept them there if
         the refetch then failed (finding B3) */
      D.acc = null; D.ext = null; D.main = null; delete cache[D.loc.id];
      paintHead(); updateCard(D.loc.id); updatePin(D.loc.id);
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
      <button class="nt-row" id="set-notify"><b>${t('ntEntry')}</b>
        <span class="val">${esc(notifySummary())}</span><span class="chev">›</span></button>
    </div>
    <div class="group">
      <button class="nt-row" id="set-layout"><b>${t('lyEntry')}</b>
        <span class="val">${esc(layoutSummary())}</span><span class="chev">›</span></button>
    </div>
    <div class="group">
      <h4>${t('cmpSection')}</h4><p>${t('cmpD')}</p>
      ${MODELS.map(m => `<div class="row">
        <span class="mdot" style="background:${m.color}"></span>
        <span class="txt"><b>${m.short}</b><small>${m.org[S.lang]}</small></span>
        <button class="check ${S.compare.includes(m.id) ? 'on' : ''}" data-cmp="${m.id}">
          <svg viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></svg></button></div>`).join('')}
    </div>`;
  const nb = $('#set-notify');
  /* closeSheetNow, not hide: hide() rewinds history and would race the entry
     openNotify is about to take over */
  if(nb) nb.addEventListener('click', () => { closeSheetNow(); openNotify(); });
  const lb = $('#set-layout');
  if(lb) lb.addEventListener('click', () => { closeSheetNow(); openLayout(); });
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
      /* the accuracy table is derived from the same model list, so it has to be
         thrown away and rebuilt too, not just the compare chart */
      D.acc = null;
      reloadCompare();
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
<li><b>准度</b>：取各模式「提前 1 天」和「提前 3 天」对过去某段时间做的预报，跟 ECMWF ERA5 再分析同一时刻的气温相比，算平均绝对误差（MAE）。所有模式用同一组整点，数字小的那家，在这个位置预报得比较准。</li>
</ul>
<h4 class="info-h">准度那一页要怎么看</h4>
<p class="info-p">对照基准是 ECMWF 的 ERA5 再分析：把全球地面站、探空气球和卫星观测同化进模式后重算出来的历史场，气象界拿它当标准参照。ERA5 大约晚一周才发布，所以核对的是两周前到六天前这一段，页面上写的日期就是实际拿到数据的那几天。</p>
<p class="info-p">要留意三点。一、这是对<b>过去</b>的核对，不是对未来的保证。二、ERA5 本身也是模式产品，不是你园区里的实测值，不能代替雨量筒和温度计；它由 ECMWF 制作，对 ECMWF 可能略有利。三、样本只有一周多，只能当参考。读不到数据时，这页会自动改成「与共识的偏离」并写明——那是一致度，不是准确度。</p>
<h4 class="info-h">要注意的限制</h4>
<ul class="info-l">
<li>全球模式的格点在 9–25 公里之间，一个格点代表一大片区域，不等于你园区里的实测值。</li>
<li>热带的对流性阵雨尺度小、变化快，任何模式的降雨量都只能当参考。</li>
<li>降雨概率只有部分模式输出，所以对比图用的是降雨量，各家都有。</li>
<li>预报不是观测。要核对实际下了多少雨，还是得看园区的雨量筒。</li>
<li>App 不缓存天气数据。App 开着的时候断网，会继续显示已经读到的内容，并写明是几点更新的；没有网络时重新打开，就没有预报可看。</li>
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
<li><b>Accuracy</b>: the forecasts each model made 1 day and 3 days ahead for a recent past stretch, compared with ECMWF ERA5 reanalysis at the same hour and scored as mean absolute error. Every model is scored on the same hours; the smaller figure forecast better at this location.</li>
</ul>
<h4 class="info-h">How to read the accuracy tab</h4>
<p class="info-p">The reference is ECMWF ERA5 reanalysis: a recomputed history of the atmosphere after assimilating surface stations, radiosondes and satellites worldwide. It is the standard reference in meteorology. ERA5 is published about a week late, so the check covers roughly two weeks back to six days back, and the dates shown are the ones that actually came back.</p>
<p class="info-p">Three things to keep in mind. It checks the <b>past</b> and promises nothing about the future. ERA5 is itself a model product, not a measurement at your plot, so it does not replace your rain gauge and thermometer; it is made by ECMWF and may slightly favour ECMWF. And little more than a week of data is indicative, not a ranking. If the data cannot be read, the tab falls back to distance from the multi-model consensus and says so — that is agreement, not accuracy.</p>
<h4 class="info-h">Limits worth knowing</h4>
<ul class="info-l">
<li>Global models run on 9–25 km grid cells. One cell covers a wide area and is not a measurement at your plot.</li>
<li>Tropical convective showers are small and fast. Rainfall totals from any model are indicative only.</li>
<li>Rain probability is produced by only some models, so the compare chart uses rainfall, which all models report.</li>
<li>A forecast is not an observation. To know what actually fell, read your rain gauge.</li>
<li>The app never caches weather data. If the connection drops while it is open, it keeps showing what it already loaded, with the time it was updated; opened with no connection, it has no forecast to show.</li>
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
<li><b>Ketepatan</b>: ramalan yang dibuat setiap model 1 hari dan 3 hari lebih awal bagi satu tempoh lepas, dibandingkan dengan analisis semula ERA5 ECMWF pada jam yang sama dan dikira sebagai ralat mutlak purata. Semua model dinilai pada jam yang sama; angka lebih kecil meramal lebih tepat di lokasi ini.</li>
</ul>
<h4 class="info-h">Cara baca tab ketepatan</h4>
<p class="info-p">Rujukannya ialah analisis semula ERA5 ECMWF: sejarah atmosfera yang dikira semula selepas mengasimilasi stesen permukaan, belon radiosonde dan satelit seluruh dunia. Ia rujukan piawai dalam meteorologi. ERA5 diterbitkan kira-kira seminggu lewat, jadi semakan meliputi lebih kurang dua minggu hingga enam hari lepas, dan tarikh yang dipaparkan ialah tarikh data yang benar-benar diterima.</p>
<p class="info-p">Tiga perkara. Ia menyemak masa <b>lepas</b>, bukan jaminan masa depan. ERA5 sendiri produk model, bukan ukuran di petak anda, jadi ia tidak ganti tolok hujan dan termometer; ia dihasilkan oleh ECMWF dan mungkin sedikit memihak kepada ECMWF. Data lebih sedikit daripada dua minggu hanya panduan, bukan kedudukan rasmi. Jika data tidak dapat dibaca, tab ini beralih kepada jarak dari konsensus dan menyatakannya — itu persetujuan, bukan ketepatan.</p>
<h4 class="info-h">Had yang perlu diingat</h4>
<ul class="info-l">
<li>Model global guna sel grid 9–25 km. Satu sel meliputi kawasan luas, bukan ukuran di petak anda.</li>
<li>Hujan perolakan tropika kecil dan cepat berubah. Jumlah hujan hanya panduan.</li>
<li>Peluang hujan hanya dikeluarkan sebahagian model, jadi carta banding guna jumlah hujan.</li>
<li>Ramalan bukan cerapan. Untuk tahu jumlah sebenar, baca tolok hujan anda.</li>
<li>Aplikasi tidak menyimpan cache data cuaca. Jika sambungan terputus semasa ia dibuka, ia terus memaparkan data yang sudah dimuatkan berserta masa kemas kini; jika dibuka tanpa sambungan, tiada ramalan untuk dipaparkan.</li>
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
  {n:'Esri', d:{zh:'地图底图：World Imagery、World Street Map、Dark Gray Canvas、边界与地名 · Esri、Maxar、Earthstar Geographics 及 GIS 用户社群',en:'Basemaps: World Imagery, World Street Map, Dark Gray Canvas, Boundaries & Places · Esri, Maxar, Earthstar Geographics and the GIS user community',ms:'Peta asas: World Imagery, World Street Map, Dark Gray Canvas, Sempadan & Tempat · Esri, Maxar, Earthstar Geographics dan komuniti pengguna GIS'}, u:'https://www.esri.com/'}
];
function drawInfo(){
  $('#info-body').innerHTML = INFO[S.lang] + `
    <div class="group" style="margin-top:22px"><h4>${t('dataSrc')}</h4>
      ${SOURCES.map(s => `<a class="src" href="${s.u}" target="_blank" rel="noopener">
        <span style="flex:1"><b>${s.n}</b><small>${s.d[S.lang]}</small></span><span class="go">↗</span></a>`).join('')}
    </div>
    <div class="group"><h4>${t('about')}</h4>
      <p style="margin-bottom:4px">${t('app')} · ${t('version')} ${APP_VERSION}</p>
      <p class="credit">Created by Bryan Woo</p>
      <div class="share-card">
        <img class="qr" src="qr.svg" alt="${esc(t('qrAlt'))}" width="200" height="200">
        <p class="share-cap">${t('qrCap')}</p>
        <p class="share-url">${esc(APP_URL.replace(/^https:\/\//, '').replace(/\/$/, ''))}</p>
        <button class="cta ghost" id="share-app">${t('shareApp')}</button>
      </div>
    </div>`;
  $('#share-app').addEventListener('click', shareApp);
}

/* Where the app lives. qr.svg encodes exactly this address — regenerate it
   (README) if the address ever changes. */
const APP_URL = 'https://bryanwoo988.github.io/CompareCast/';
/* for someone who is not standing next to you: the phone's own share sheet,
   or the link copied where there is none */
async function shareApp(){
  if(navigator.share){
    try{ await navigator.share({title:t('app'), text:t('shareText'), url:APP_URL}); }catch(e){}
    return;
  }
  try{ await navigator.clipboard.writeText(APP_URL); toast(t('linkCopied')); }
  catch(e){ toast(APP_URL); }
}

/* ---------- 14b. Release notes ----------
   An update lands by itself — the service worker swaps the shell and the next
   load is simply different. Without this the user has no idea anything moved,
   which is exactly what happened when the version in About stayed at 2.0. */
function drawReleases(list){
  $('#rel-body').innerHTML = list.map(r => `
    <div class="rel-v"><b>${esc(r.v)}</b></div>
    <ul class="rel-l">${(r[S.lang] || r.en).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`).join('');
}

function maybeShowReleaseNotes(){
  const seen = S.seenVersion;
  /* a genuinely new install has nothing to catch up on; someone who already
     has locations but no record predates this feature, and does */
  const returning = S.locations.length > 0;
  if(seen === APP_VERSION){ return; }
  const list = notesSince(RELEASES, seen).slice(0, 4);
  S.seenVersion = APP_VERSION;
  save();
  if(!list.length || (!seen && !returning)) return;
  drawReleases(list);
  setTimeout(() => show('#sheet-rel'), 900);
}

$('#rel-done').addEventListener('click', hide);

/* ---------- 15. Tabs, language, boot ---------- */
function setTab(which){
  const s = which === 'saved';
  $('#tab-saved').classList.toggle('on', s);
  $('#tab-map').classList.toggle('on', !s);
  $('#pane-saved').classList.toggle('on', s);
  $('#pane-map').classList.toggle('on', !s);
  updateSub();
  document.body.classList.toggle('map-mode', !s);
  if(s && P.on) exitPlace();
  if(!s) openMap();
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
  if($('#map-q')) $('#map-q').placeholder = t('mapSearchPh');
  if($('#map-rail')) bindRail();
  drawBasemapSwitch();
  if(openSheetId === '#sheet-info') drawInfo();
  if(openSheetId === '#sheet-set') drawSettings();
  if(openSheetId === '#sheet-model') drawModelPicker();
  if($('#detail').classList.contains('on')){ paintHead(); paintDetail(); }
}

window.addEventListener('online', () => { loadAll(); });
window.addEventListener('offline', () => toast(t('offline')));
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if(!$('#detail').classList.contains('on') || !D.main) return;
    /* the SVG is laid out in pixels, so a rotation has to redraw both charts */
    buildChart('#ch-temp', {vari:'temp', fill:true, marks:true});
    buildChart('#ch-prob', {vari:'prob', fill:true, marks:false, yRange:[0,100]});
  }, 160);
});
window.addEventListener('popstate', () => {
  if(openSheetId){ closeSheetNow(); return; }
  if($('#layout').classList.contains('on')){ closeLayout(); return; }
  if($('#notify').classList.contains('on')){ closeNotify(); return; }
  if($('#detail').classList.contains('on')) closeDetail();
});

/* A reminder about a single plot opens that plot when tapped: the service
   worker either opens the app with ?loc= or, if it is already open, sends a
   message. Anything else on screen is closed first so the plot is what shows. */
/* An update reloads the page; this puts the user back where they were. */
function resumeAfterUpdate(){
  let r = null;
  try{ r = JSON.parse(sessionStorage.getItem('pw:resume') || 'null'); sessionStorage.removeItem('pw:resume'); }catch(e){}
  if(!r) return;
  if(r.map) setTab('map');
  if(r.loc && S.locations.some(l => l.id === r.loc)){
    openDetail(r.loc);
    if(r.day > 0) D.day = r.day;
  }
}
function openFromNotice(id){
  if(!id) return;
  try{ history.replaceState(history.state, '', location.pathname); }catch(e){}
  if(!S.locations.some(l => l.id === id)) return;
  if(openSheetId) closeSheetNow();
  if($('#notify').classList.contains('on')) closeNotify();
  if($('#layout').classList.contains('on')) closeLayout();
  openDetail(id);
}
/* A reminder about several plots, shown in full. The banner only ever shows
   its first few lines, whatever the phone; this page lists every plot the
   reminder covered with its complete figures, worst first, each one a way
   into that plot. */
function showNotice(n){
  if(!n || typeof n !== 'object') return;
  if(openSheetId) closeSheetNow();
  if($('#notify').classList.contains('on')) closeNotify();
  if($('#layout').classList.contains('on')) closeLayout();
  $('#notice-title').textContent = String(n.title || '');
  const when = typeof n.at === 'number'
    ? new Date(n.at).toLocaleString(locale(), {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false}) : '';
  let html = when ? `<p class="nt-when">${esc(t('noticeAt')(when))}</p>` : '';
  const rows = Array.isArray(n.detail) ? n.detail.filter(x => x && typeof x === 'object') : [];
  if(rows.length){
    html += rows.map(x => {
      const here = S.locations.some(l => l.id === x.id);
      return `<button class="nrow" data-notice-loc="${esc(String(x.id || ''))}"${here ? '' : ' disabled'}>
        <span class="nt"><b>${esc(String(x.name || ''))}</b><small>${esc(here ? String(x.text || '') : t('noticeGone'))}</small></span>
        ${here ? '<span class="go">›</span>' : ''}</button>`;
    }).join('');
  } else {
    /* sent before reminders carried the full detail: the text is all there is */
    html += `<p class="nbody">${esc(String(n.body || ''))}</p>`;
  }
  if(n.more > 0) html += `<p class="nt-note">${esc(t('noticeMore')(n.more))}</p>`;
  $('#notice-body').innerHTML = html;
  $$('#notice-body [data-notice-loc]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.noticeLoc;
    closeSheetNow();
    if(S.locations.some(l => l.id === id)) openDetail(id);
  }));
  show('#sheet-notice');
}
$('#notice-done').addEventListener('click', hide);
/* opened by tapping a reminder while the app was closed: the service worker
   parked it, because it is too long for a URL */
async function openParkedNotice(){
  try{ history.replaceState(history.state, '', location.pathname); }catch(e){}
  try{
    const c = await caches.open('pw-notice'), r = await c.match('./__notice');
    if(!r) return;
    const n = await r.json();
    await c.delete('./__notice');
    showNotice(n);
  }catch(e){}
}
if('serviceWorker' in navigator)
  navigator.serviceWorker.addEventListener('message', e => {
    if(!e.data) return;
    if(e.data.type === 'open-loc') openFromNotice(String(e.data.loc || ''));
    if(e.data.type === 'open-notice') showNotice(e.data.notice);
  });

/* Whatever storage handed back, made safe to run on. Broken JSON was always
   handled; valid JSON of the wrong shape — {locations:[null]}, {units:'x'} —
   crashed startup before a single plot was drawn (finding B13). */
function sanitizeState(){
  S.locations = cleanLocations(S.locations);
  S.locations.forEach(l => { if(l.model && !MODELS.some(m => m.id === l.model)) delete l.model; });
  S.compare = (Array.isArray(S.compare) ? S.compare : []).filter(id => MODELS.some(m => m.id === id));
  if(!S.compare.length) S.compare = MODELS.map(m => m.id);
  if(!MODELS.some(m => m.id === S.defaultModel)) S.defaultModel = 'best_match';
  const OK = {temp:['celsius','fahrenheit'], wind:['kmh','mph','kn','ms'], rain:['mm','inch']};
  const FB = {temp:'celsius', wind:'kmh', rain:'mm'};
  if(!S.units || typeof S.units !== 'object' || Array.isArray(S.units)) S.units = {};
  Object.keys(OK).forEach(k => { if(!OK[k].includes(S.units[k])) S.units[k] = FB[k]; });
  if(!T[S.lang]) S.lang = 'zh';
  if(!BASEMAPS[S.basemap]) S.basemap = 'sat';
  normalizeNotify();
}

/* Another tab of the app saved. Every save writes the whole state, so without
   this the two tabs overwrote each other's plots; this one now adopts what
   the other wrote instead. */
window.addEventListener('storage', e => {
  if(e.key !== KEY || !e.newValue) return;
  let next;
  try{ next = JSON.parse(e.newValue); }catch(err){ return; }
  if(!next || typeof next !== 'object') return;
  S = Object.assign(S, next);
  sanitizeState();
  applyLang(); renderList(); refreshPins();
  if($('#detail').classList.contains('on')){
    const still = D.loc && S.locations.find(l => l.id === D.loc.id);
    if(!still) exitDetail();
    else { D.loc = still; paintHead(); if(D.main) paintDetail(); }
  }
});

/* Coming back to the app. A PWA can sit in memory for days, and nothing used
   to reload it, so yesterday's "now" stayed on screen as today's (A06/B2).
   Anything older than half an hour is fetched again; what is on screen stays
   up meanwhile, greyed with its age once it is past three hours. */
function refreshIfOld(){
  if(document.visibilityState !== 'visible') return;
  const now = Date.now();
  if(navigator.onLine){
    S.locations.forEach(l => {
      const d = cache[l.id];
      if(d === null || (d && freshness(d._at, now).refresh)) loadCard(l);
    });
    if($('#detail').classList.contains('on') && D.main && freshness(D.main._at, now).refresh)
      loadDetail({quiet:true});
  }
  /* ages move on even when nothing was fetched */
  S.locations.forEach(l => updateCard(l.id));
  if($('#detail').classList.contains('on')) paintUpdated();
}
document.addEventListener('visibilitychange', refreshIfOld);
window.addEventListener('pageshow', e => { if(e.persisted) refreshIfOld(); });
setInterval(refreshIfOld, 10 * 60e3);

/* The phone's own language, as a starting point for the first-launch picker. */
function guessLang(){
  const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''])
    .map(x => String(x).toLowerCase());
  for(const p of prefs){
    if(p.startsWith('zh')) return 'zh';
    if(p.startsWith('ms')) return 'ms';
    if(p.startsWith('en')) return 'en';
  }
  return 'zh';
}
/* Asked once, on a first launch — with nothing saved at all, so nobody who
   already uses the app is asked. Closing it without choosing keeps the
   phone's language, and the choice is saved either way. */
function askFirstLanguage(){
  /* a new install has no release notes to catch up on, but the next update
     must know where to start from, or it would list every release there is */
  S.seenVersion = APP_VERSION;
  S.lang = guessLang(); applyLang(); save();
  const mark = () => $$('#sheet-firstlang [data-firstlang]').forEach(b => b.classList.toggle('on', b.dataset.firstlang === S.lang));
  mark();
  $$('#sheet-firstlang [data-firstlang]').forEach(b => b.addEventListener('click', () => {
    S.lang = b.dataset.firstlang; save(); applyLang(); renderList(); mark();
    hide();
  }));
  setTimeout(() => show('#sheet-firstlang'), 300);
}

/* The splash goes once the plot list has drawn — held for a moment at least,
   so a fast start does not flash it, and removed after its fade. */
const SPLASH_MIN_MS = 700;
function hideSplash(){
  const el = document.getElementById('splash');
  if(!el) return;
  setTimeout(() => {
    document.documentElement.classList.add('booted');
    setTimeout(() => el.remove(), 450);
  }, Math.max(0, SPLASH_MIN_MS - performance.now()));
}

(async function boot(){
  const saved = await store.get(KEY);
  const firstLaunch = !saved;
  if(saved && typeof saved === 'object') S = Object.assign(S, saved);
  sanitizeState();
  applyLang();
  renderList();
  initReorder();
  initLayoutReorder();
  initPullRefresh();
  loadAll();
  /* a subscription that failed in an earlier session repairs itself here */
  if(S.notify && S.notify.enabled) scheduleSync(4000);
  hideSplash();
  if(firstLaunch) askFirstLanguage();
  else maybeShowReleaseNotes();
  /* a page served from the offline copy may be older than the live build */
  setTimeout(checkForUpdate, 1500);
  resumeAfterUpdate();
  openFromNotice(new URLSearchParams(location.search).get('loc'));
  if(new URLSearchParams(location.search).get('notice')) openParkedNotice();
  /* the release-notes sheet says this and more, so no toast on top of it */
  try{ sessionStorage.removeItem('pw:updated'); }catch(e){}
  if('serviceWorker' in navigator && location.protocol !== 'file:'){
    /* updateViaCache 'none': the browser's own update checks go to the server
       for sw.js and what it imports, never to its HTTP cache */
    const reg = () => navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).catch(() => {});
    if(document.readyState === 'complete') reg();
    else window.addEventListener('load', reg);
  }
})();
