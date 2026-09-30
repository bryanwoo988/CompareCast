# 天气预测 · Predict Weather · Ramalan Cuaca

多模式天气对比 PWA。同一个位置，把 ECMWF、GFS、ICON、GEM、ARPEGE、JMA、UKMO 的预报画在一张图上比较，并按地块发定时提醒。

两部分：

- **App**（仓库根目录）：纯静态网页，放在 GitHub Pages 上。
- **提醒服务器**（`server/`）：Cloudflare Worker，存每台手机的提醒设定，每 15 分钟检查一次并发推送。

## 部署 App（GitHub Pages）

1. 把**整个仓库**推到 GitHub，Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main` / `/ (root)`。
2. 等一两分钟，打开 `https://<用户名>.github.io/<仓库名>/`。

App 运行需要这 15 个文件（都在根目录）。`sw.js` 里的 `SHELL_FILES` 就是这份清单；`tests/shell.test.js` 会检查清单里的文件都存在、`index.html` 加载的每个脚本都在清单里，所以清单不会和代码走样：

```
index.html  app.js  sw.js  manifest.webmanifest
swpolicy.js  daylogic.js  maplogic.js  listlogic.js  notifylogic.js  summary.js  layout.js  reqlogic.js
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

降雨机率和紫外线只有部分模式输出，所以统一来自 Best Match，界面上都有注明。

**为什么没有机场观测站图层**：NOAA aviationweather.gov 的 Data API 不允许跨域访问，从静态网页抓一定被浏览器挡掉。要做这个功能得另外架中转代理。

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

- **自己的文件**（上面 15 个）：先走网络，拿不到才用缓存。所以每次打开都拿到最新版，没网络也能打开界面。新版安装时这 15 个文件必须全部缓存成功，否则放弃安装、继续用旧版——弱信号下更新到一半，不会把离线版本弄坏。
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

