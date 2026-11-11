# 天气预测 · Predict Weather · Ramalan Cuaca

多模式天气对比 PWA。同一个位置，把 ECMWF、GFS、ICON、GEM、ARPEGE、JMA、UKMO 的预报画在一张图上比较，并按地块发定时提醒。

两部分：

- **App**（仓库根目录）：纯静态网页，放在 GitHub Pages 上。
- **提醒服务器**（`server/`）：Cloudflare Worker，存每台手机的提醒设定，每 15 分钟检查一次并发推送。

## 部署 App（GitHub Pages）

1. 把**整个仓库**推到 GitHub，Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main` / `/ (root)`。
2. 等一两分钟，打开 `https://<用户名>.github.io/<仓库名>/`。

App 运行需要这 17 个文件（都在根目录）。`sw.js` 里的 `SHELL_FILES` 就是这份清单；`tests/shell.test.js` 会检查清单里的文件都存在、`index.html` 加载的每个脚本都在清单里，所以清单不会和代码走样：

```
index.html  app.js  sw.js  manifest.webmanifest
swpolicy.js  daylogic.js  maplogic.js  listlogic.js  notifylogic.js  inbox.js  overlaylogic.js  summary.js  layout.js  reqlogic.js
icon-192.png  icon-512.png  icon-maskable-512.png
```

`server/`、`tests/`、`docs/` 不影响网页，放着也无妨。

必须用 **https**。GPS 定位、Service Worker 和推送在 http 或双击打开的本地文件下都不会运作。

装到手机主画面：iPhone Safari 分享 →「加入主画面」（iPhone 只有从主画面打开才收得到通知）；Android Chrome 右上角选单 →「安装应用程序」。

## 部署提醒服务器（Cloudflare Workers）

需要 Node.js 22 以上和一个 Cloudflare 账号（免费版即可，见下面的限制）。

```bash
cd server
npm ci
npx wrangler login
```

1. **KV 存储**：`npx wrangler kv namespace create comparecast`，把输出的 `id` 填进 `server/wrangler.toml` 的 `[[kv_namespaces]]`。
2. **VAPID 密钥**：`npx web-push generate-vapid-keys`。
   - 公钥填进 `server/wrangler.toml` 的 `VAPID_PUBLIC_KEY`，也填进 `app.js` 的 `VAPID_PUBLIC`（两边必须一样）。
   - 私钥**绝不写进文件**：`npx wrangler secret put VAPID_PRIVATE_KEY`，按提示贴上。
3. **其他设定**（`server/wrangler.toml` 的 `[vars]`）：
   - `ORIGIN`：App 的网址来源，例如 `https://<用户名>.github.io`。别的网站来的请求会被拒绝。
   - `VAPID_SUBJECT`：联系方式，`mailto:` 开头。推送服务在出问题时会用它联络你。
4. **部署**：`npx wrangler deploy`。定时任务（`*/15 * * * *`）写在 `wrangler.toml` 里，会一起生效。
5. 把 Worker 的网址填进 `app.js` 的 `PUSH_API`。

**免费版的限制**：每次定时运行最多 50 个外部请求、10 毫秒 CPU；KV 每天 10 万次读取、1000 次写入。服务器已经为此设计：同一时段的提醒合成一条通知，同一坐标同一模式只取一次预报，设备数量上限 50。家庭规模用免费版足够。

## 测试

```bash
cd server && npm ci && cd ..
node --test tests/*.test.js
```

要先在 `server/` 装好依赖，推送加密的测试才跑得起来。Node 22 上请用 `tests/*.test.js`，`node --test tests/` 会把目录当成模块而失败。

## 发新版

**`sw.js` 不用改。** 把新的文件推上去（GitHub Pages 自动部署）就算发版了：GitHub Pages 每次部署都会更新 `index.html` 的 `Last-Modified`，打开中的 App 拿它跟自己正在跑的那一版（`document.lastModified`）比，比较新就更新。`sw.js` 只有在 Service Worker 本身的逻辑要改的时候才需要动。

要让用户看到「这一版有什么变化」的话：

1. 改 `app.js` 的 `APP_VERSION`（「关于」里显示的版本号）。
2. 在 `app.js` 的 `RELEASES` 最前面加一条，三种语言都要（`tests/releases.test.js` 检查）。

改了 `server/` 的话另外 `cd server && npx wrangler deploy`。

**用户不用清缓存、也不用关掉重开**：App 打开时、回到前台时、使用中每 15 分钟，会问服务器 `index.html` 的最新版本。刚打开或刚回到 App 就直接更新，而且回到原来那一页；正在操作时只在底部提示「新版本已准备好」，不打断，下次回到 App 自动更新。有更新说明的话，更新后会弹出来。Service Worker 每次都向服务器确认文件（GitHub Pages 的 `max-age=600` 不会再让人拿到旧文件）。

**每个脚本都带着页面的版本**：`index.html` 用 `app.js?r=<index.html 的 Last-Modified>` 这种网址载入自己的脚本（`index.html` 底部的 `APP_SCRIPTS`）。新的 `index.html` 就会要全新的网址，浏览器的任何一层缓存都拿不出旧的程序，所以更新不会「一半新、一半旧」。加新的脚本文件时，加进 `APP_SCRIPTS` 和 `sw.js` 的 `SHELL_FILES`（`tests/shell.test.js` 会检查）。

`sw.js` 里有一行 `const VERSION = 'pw-v3.22.0'` 是固定的过渡标记，**不要改**：3.21.x 的旧页面靠读这一行发现新版，这个值让它们搬到新的检查方式。

## 数据来源

| 用途 | 接口 | 说明 |
|---|---|---|
| 预报（8 个模式） | `api.open-meteo.com/v1/forecast` | 免费，无需 API key |
| 城市搜索 | `geocoding-api.open-meteo.com/v1/search` | 同上 |
| 准度：各模式过去的预报 | `previous-runs-api.open-meteo.com/v1/forecast` | 提前 1 天 / 3 天 |
| 准度：对照基准 | `archive-api.open-meteo.com/v1/archive`（`models=era5`） | ECMWF ERA5 再分析 |
| 地图底图（三种） | `server.arcgisonline.com` | Esri，免 key |
| Leaflet 1.9.4 | `cdnjs.cloudflare.com` | 打开地图时才载入，带完整性校验（SRI） |
| 雷暴提醒：官方警告 | `api.data.gov.my/weather/warning/` | MetMalaysia 雷暴警告，服务器每 15 分钟读一次 |
| 雷达提醒 | `api.met.gov.my/static/images/radar-latest.gif` | MetMalaysia 12 雷达拼图，每 10 分钟一帧，服务器每 5 分钟检查一次 |
| 地图雷达图层 | 经推送服务器 `/radar` 转送 `api.met.gov.my/static/images/radar-latest.gif` | MetMalaysia 不允许其他网站直接读取，所以由服务器原样转送（Cloudflare 缓存 2 分钟）；手机解码，只留下雨区 |
| 地图卫星图层 | `www.jma.go.jp/bosai/himawari/data/satimg/...` | 日本气象厅 Himawari-9 图块，手机直接读取；JMA 网站内容按「公共数据利用规约 1.0」开放，注明「出典：気象庁ホームページ」 |
| 新版本通知 | `bryanwoo988.github.io/CompareCast/version.json` | 由 `tools/version-json.js` 从 `app.js` 的更新说明生成，服务器每 15 分钟读一次 |
| 河水提醒 | `publicinfobanjir.water.gov.my/.../latestreadingstrendabc.json` | JPS 全国水位站（JPS 地图本身用的数据），服务器每 15 分钟读一次 |
| 雷暴提醒：地块所在的区 | `nominatim.openstreetmap.org/reverse` | 由 App 查，每块地一次，用马来文（跟 MetMalaysia 的拼法一致） |

降雨机率和紫外线只有部分模式输出，所以统一来自 Best Match，界面上都有注明。

**为什么没有机场观测站图层**：NOAA aviationweather.gov 的 Data API 不允许跨域访问，从静态网页抓一定被浏览器挡掉。要做这个功能得另外架中转代理。

## 雷暴提醒怎么判断

代码在 `server/src/storm.js`，测试在 `tests/storm.test.js`。

- **官方警告**：MetMalaysia 的警告只用一句话写地名，例如「Pahang (Kuantan, Pekan dan Rompin) • Sarawak: Miri, Bintulu (Tatau)」。服务器把马来文原文拆成「州（区）」，再跟地块的州代码（ISO 3166-2）和区名对比：没有括号的州算整个州；冒号后面列的是省（Bahagian），没有括号的省算全省，有括号的只算括号里的县。连续降雨警告可能分好几段（「I) … II) …」），每段都会读。同一条雷暴警告（同一个发布时间加结束时间）每块地只发一次。
- **连续降雨警告**：等级从标题读（Waspada 注意、Buruk 恶劣天气、Bahaya 危险）。data.gov.my 会把一条警告按开始日期拆成几笔、又看不出哪段对应哪笔，所以同一发布时间和标题的几笔合并成一条，有效期取最早开始到最晚结束。每块地第一次被涵盖时通知一次，之后只在等级升高或结束时间延后时再通知，原样重发不通知。
- **模式提醒**：Open-Meteo 上只有 ICON（偶尔 UKMO）会给马来西亚输出雷暴天气代码 95，ECMWF、GEM、Météo-France、JMA 从来不给（2026 年 11 月实测），所以不能只数「预报雷暴」的模式。一个模式在未来 3 小时内出现雷暴代码，或某一小时雨量 ≥ 5 mm 而且 CAPE ≥ 1000 J/kg，就算一票；7 个里有 3 票才提醒。只看 CAPE 不行：马来西亚下午 CAPE 几乎天天超过 2000。这几个门槛是经验值，没有做过验证，所以通知里会写出几个模式同意，并标明不是官方警告。每小时检查一次，同一块地 3 小时内最多一次。已经有官方警告的地块不再另发模式提醒。

## 雷达提醒怎么判断

代码在 `server/src/radar.js`，测试在 `tests/radar.test.js` 和 `tests/alerts.test.js`。

- **数据**：MetMalaysia 的雷达拼图 GIF，6 帧，每帧相隔 10 分钟，发布约晚 11 分钟。GIF 里没有可读的时间，所以最新一帧的时间取文件写入时间往前推到上一个 10 分钟（07:51 写入 → 07:40 那帧，用真实数据核对过）。超过 40 分钟没更新就不发。
- **解码**：GIF 解码是自己写的，只取调色板索引、不转 RGBA，跟 omggif 逐像素比对过（0 差异）。颜色按图上的图例分成小雨（≥1 mm/h）和大雨（>20 mm/h，MetMalaysia 发雷暴警告的标准）；10 到 50 mm/h 之间那条没有标数字的分界当作 20。右边图例那一栏不读。
- **定位**：把图当成普通经纬度网格（实际是 Albers 等积投影），用槟城、关丹、新加坡、亚庇、古达等地标核对，误差约 2–7 km，所以「附近」定为 10 km。
- **移动**：在地块周围约 ±110 km 的范围比对前后两帧，找出让最多雨区重叠的位移（每 10 分钟最多 8 像素，约 110 km/h）。平手时取较小的位移，免得不动的杂波被算成在移动。
- **提醒**：10 km 内已有 3 个以上大雨像素 →「就在附近」；否则把大雨像素沿移动方向往前推，第 3 早进到 10 km 内的时间（避免单一像素决定）若在一小时内、且还没过 →「约几点到」。同一块地 2 小时内最多一次，发了雷达提醒的地块 3 小时内不再发模式提醒。
- **使用条款**：MetMalaysia 的 API 页面说明 Web API 免费开放给公众，但没有写雷达图的授权条款。通知里写明来源（MetMalaysia 雷达）。
- **运算量**：解码三帧约 25 毫秒，超过 Cloudflare 免费版每次 10 毫秒的上限，所以雷达要用 Workers Paid 方案。**目前没有排程**：`wrangler.toml` 里没有 `*/5 * * * *`，雷达程序在服务器里但不会执行。要启用的话，先升级到 Workers Paid，再把 `"*/5 * * * *"` 加回 `crons`。

## 河水提醒怎么判断

代码在 `server/src/flood.js`，测试在 `tests/flood.test.js`。

- **数据**：JPS Public Infobanjir 地图用的 JSON，每个站有经纬度、水位、JPS 自己判定的等级（Normal / Alert / Warning / Danger）、超过的警戒线和读数时间。data.gov.my 的 flood-warning 接口从 2024 年 2 月起停更，不能用。
- **过滤**：只看 Warning 和 Danger；警戒线是 0 的站当作没设定（沙巴有一批这样的站被标成 Danger）；读数超过 2 小时的站不算。
- **提醒**：地块 10 km 内的站。同一个站同一级一天只发一次，从警告升到危险会再发。

## 模式代号

| 显示 | Open-Meteo model id | 机构 |
|---|---|---|
| Best Match | `best_match` | Open-Meteo 混合 |
| ECMWF | `ecmwf_ifs025` | 欧洲中期天气预报中心 |
| GFS | `gfs_seamless` | NOAA 美国 |
| ICON | `icon_seamless` | DWD 德国 |
| GEM | `gem_seamless` | ECCC 加拿大 |
| ARPEGE | `meteofrance_seamless` | Météo-France 法国 |
| JMA | `jma_seamless` | 日本气象厅 |
| UKMO | `ukmo_seamless` | 英国气象局 |

`server/src/models.js` 有同一份清单，`tests/models.test.js` 检查两边一致。

## Service Worker 的缓存策略

- **自己的文件**（上面 17 个）：先走网络，拿不到才用缓存。所以每次打开都拿到最新版，没网络也能打开界面。新版安装时这 17 个文件必须全部缓存成功，否则放弃安装、继续用旧版——弱信号下更新到一半，不会把离线版本弄坏。
- **Leaflet**：固定版本，缓存优先，只有成功的回应才会覆盖缓存。
- **绝不缓存**：所有天气数据、地理编码、ERA5、地图瓦片。
- **离线时**：App 开着的时候断网，会继续显示已读到的内容，并写明是几点更新的；没网络时重新打开，就没有预报可看。App 回到前台时，超过半小时的数据会自动重新读取；超过三小时的会变灰并写明多久以前。

## 地图底图

地图页右上角可切换三种底图，选择会记住。全部来自 Esri：

- **卫星**（预设）：World Imagery，加上 World Boundaries and Places 的地名层。能看到园区地块、路和河，最适合定位地块。
- **街道**：World Street Map，路名地名清楚。
- **暗色**：World Dark Gray Canvas，配 App 深色界面，只适合看地点标记。

## 准度那一页的方法

对核对区间里的每个整点，取各模式**提前 1 天**和**提前 3 天**对这一刻做的预报（Previous Runs API），跟 ECMWF ERA5 再分析同一时刻的气温比，算平均绝对误差（MAE）。所有模式用同一组整点，按提前 1 天的误差排序。ERA5 大约晚一周发布，所以区间是两周前到六天前，页面上的日期是实际拿到数据的那几天。

以前的做法（用预报接口的 `past_days`）量到的是各模式的起始分析，不是预报能力：同一段时间在吉隆坡，旧方法把 ECMWF 排第一，真正的提前 1 天预报是 GFS 第一、ECMWF 第三。

限制：ERA5 是再分析，不是园区实测，也由 ECMWF 制作、可能对 ECMWF 略有利；样本只有一周多，是参考不是排名。数据读不到时会改成「与多模式共识的偏离」，界面上写明那是一致度不是准确度。

## 启动画面与二维码

- **启动画面**：`index.html` 最前面的 `#splash`（深蓝底、图标置中、下面是 App 名字），列表画好后淡出。iPhone 另外用 `splash/` 里 13 张启动图（同样的深蓝底和置中图标，每种 iPhone 屏幕一张），让手机自己的第一帧和网页接得上。Android 用 manifest 的 `background_color` 和图标自己生成。
- **二维码**：`qr.svg` 编码的是 `app.js` 里的 `APP_URL`。网址改了要重新生成：

  ```bash
  npx qrcode -t svg -e M -q 2 -o qr.svg "https://<用户名>.github.io/<仓库名>/"
  ```

