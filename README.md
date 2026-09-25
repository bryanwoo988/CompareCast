# 天气预测 · Predict Weather · Ramalan Cuaca

多模式天气对比 PWA。同一个位置，把 ECMWF、GFS、ICON、GEM、ARPEGE、JMA、UKMO 的预报画在一张图上比较。

## 上传 GitHub Pages

1. 建一个新 repo（例如 `predict-weather`）。
2. 把这个文件夹里**全部 7 个文件**放进 repo 根目录：

   ```
   index.html
   app.js
   sw.js
   manifest.webmanifest
   icon-192.png
   icon-512.png
   icon-maskable-512.png
   ```

3. Settings → Pages → Source 选 `Deploy from a branch`，Branch 选 `main` / `/ (root)`，Save。
4. 等一两分钟，打开 `https://<你的用户名>.github.io/predict-weather/`。

必须用 **https**。GPS 定位和 Service Worker 在 http 或用双击打开的本地文件下都不会运作——App 会直接提示你换 https。

装到手机主画面：iPhone Safari 分享 →「加入主画面」；Android Chrome 右上角选单 →「安装应用程序」。

## 数据来源

| 用途 | 接口 | 说明 |
|---|---|---|
| 预报（8 个模式） | `api.open-meteo.com/v1/forecast` | 免费，无需 API key |
| 城市搜索 | `geocoding-api.open-meteo.com/v1/search` | 同上 |
| 准度核对基准 | `archive-api.open-meteo.com/v1/archive` | ECMWF ERA5 再分析 |
| 地图底图 · 卫星 | `server.arcgisonline.com` | Esri World Imagery，免 key |
| 地图底图 · 街道/暗色 | `basemaps.cartocdn.com` | OpenStreetMap / CARTO |
| Leaflet | `cdnjs.cloudflare.com` | 地图函式库 |

三个 Open-Meteo 端点都开放跨域（CORS），浏览器可以直接调用。

**为什么没有机场观测站图层**：NOAA aviationweather.gov 的 Data API 文件明写目前不允许跨域访问，从静态网页抓一定被浏览器挡掉。要做这个功能得自己架一个中转代理（Cloudflare Worker 之类）。

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

## Service Worker 的缓存策略

- **缓存**：index.html、app.js、图标、Leaflet 函式库 → 离线也能打开界面。
- **绝不缓存**：所有天气数据、地理编码、ERA5、地图瓦片 → 预报永远是新的，不会给你看到昨天的数据。

## 地图底图

地图页右上角可切换三种底图，选择会记住：

- **卫星**（预设）：Esri World Imagery，能看到园区地块、路和河，最适合定位地块。
- **街道**：CARTO Voyager，路名地名清楚。
- **暗色**：CARTO Dark，配 App 深色界面，但地形几乎看不见，只适合纯看地点标记。

改了程式后要让旧用户拿到新版：改 `sw.js` 第 4 行的 `VERSION`（例如 `pw-v2.0.1`），旧缓存会自动清掉。

## 准度那一页的方法

取过去第 7 天到第 4 天，各模式的逐小时气温，跟 ECMWF ERA5 再分析同一时刻的气温比，算平均绝对误差（MAE）。ERA5 同化了全球地面站、探空和卫星观测，是气象界通用的对照基准。

限制：ERA5 本身也是模式产品，不是你园区的实测值；样本只有几十小时，是参考不是排名。ERA5 读不到时会自动改成「与多模式共识的偏离」，界面上会写明那是一致度不是准确度。
