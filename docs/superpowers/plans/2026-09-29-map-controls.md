# 地图页右侧控件、地名搜索与手势修复 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把地图从「只能看」变成能直接作业的界面——定位、搜地名、准星钉点三件事都在地图表面完成，同时修掉误触加点与页面滚动打架。

**Architecture:** 纯前端，不新增网络接口（`geoSearch` 与 `getCurrentPosition` 都已存在）。把唯一的纯逻辑 `findNearby` 抽到新文件 `maplogic.js`（无 DOM 依赖，可用 node 跑断言）；地图页的顶栏压扁全部挂在 `body.map-mode` 下，地点页不受影响。

**Tech Stack:** 原生 JS（无框架、无构建）、Leaflet 1.9.4、Service Worker。测试用 `node --test`（Node 内置）。

**Spec:** `docs/superpowers/specs/2026-09-29-map-controls-design.md`

## Global Constraints

- **地点页不得有任何视觉变化**——所有顶栏压扁规则必须写在 `body.map-mode` 选择器下（spec §9）
- 普通点击地图**不得产生任何副作用**：不新增标记、不改 `S.locations`（spec §4.8）
- 不加缩放按钮（spec §4.8 明确不做）
- 放置状态 `P` 不进 `S`、不落盘（spec §4.5）
- 三种语言 zh / en / ms 全部同步，缺一不可
- 每次改 `app.js` 后跑 `node --check app.js`
- 改动 `index.html` / `app.js` / 新增文件后，`sw.js` 的 `VERSION` 必须递增，新文件要进 `SHELL_FILES`
- 定位只导航、不保存（spec §4.6）

## Review Focus

以下是 spec 隐含、但容易被漏掉的情况。每一条都已指派给下面某个任务的测试：

1. **顶栏压扁规则漏写 `body.map-mode` 前缀** —— 地点页会跟着变矮，而用户明确要求它不动。这是 spec §9 点名的最大风险。→ Task 2
2. **`touch-action:none` 连带禁掉 Leaflet 的双指缩放** —— 修掉滚动打架的同时把缩放也修没了，比原问题更糟。→ Task 2
3. **放置模式进行中切走标签页再切回** —— 准星或确认条残留，或 `P.on` 仍为真导致下一次进入地图就处在半个放置态。→ Task 5
4. **放置模式进行中按定位或点搜索结果** —— 地图飞走，准星落到新位置，确认条的坐标必须跟着变，不能停在旧值。→ Task 5
5. **`findNearby` 在经度 180 度附近与高纬度** —— 直接比较经纬度差值，在换日线两侧会把相邻的两点判成相隔半个地球，在高纬度会把 11 米的阈值放大成几百米。→ Task 1

---

### Task 1: 就近查找的纯逻辑 + `addLocation` 留在原页

**Files:**
- Create: `maplogic.js`
- Create: `tests/maplogic.test.js`
- Modify: `app.js` — `addLocation()`
- Modify: `index.html` — 在 `app.js` 之前引入 `maplogic.js`
- Modify: `sw.js` — `SHELL_FILES` 加 `'./maplogic.js'`

**Interfaces:**
- Produces:
  - `findNearby(locations: Array<{lat,lon}>, lat: number, lon: number, metres?: number) -> object|null` —— 返回距给定坐标 `metres`（默认 11）以内的第一个地点，没有则 `null`
  - `addLocation(o, opts?: {stay?: boolean}) -> object|null` —— `opts.stay` 为真时跳过 `hide()` 与 `setTab('saved')`；返回新建的地点，重复时返回 `null`

`maplogic.js` 末尾加 `if(typeof module !== 'undefined') module.exports = {findNearby};`，浏览器里这行是死代码，node 里用它导入。

- [ ] **Step 1: 写失败的测试**

```js
// tests/maplogic.test.js
const {test} = require('node:test');
const assert = require('node:assert');
const {findNearby} = require('../maplogic.js');

const L = (lat, lon) => ({id:`${lat},${lon}`, lat, lon});

test('同一点命中', () => {
  assert.strictEqual(findNearby([L(3.139, 101.6869)], 3.139, 101.6869).id, '3.139,101.6869');
});

test('10 米内命中', () => {
  // 纬度方向 1e-4 度约 11.1 米，取 8e-5 约 8.9 米
  assert.ok(findNearby([L(3.139, 101.6869)], 3.139 + 8e-5, 101.6869));
});

test('50 米外不命中', () => {
  assert.strictEqual(findNearby([L(3.139, 101.6869)], 3.139 + 5e-4, 101.6869), null);
});

test('空列表返回 null', () => {
  assert.strictEqual(findNearby([], 3.139, 101.6869), null);
});

test('换日线两侧 5 米内命中', () => {
  assert.ok(findNearby([L(0, 179.99995)], 0, -179.99995));
});

test('高纬度：经度同样的差值对应更短的距离', () => {
  // 北纬 80 度，经度差 4e-4 度约 7.7 米，应当命中
  assert.ok(findNearby([L(80, 20)], 80, 20 + 4e-4));
  // 赤道上同样的经度差约 44 米，不应命中
  assert.strictEqual(findNearby([L(0, 20)], 0, 20 + 4e-4), null);
});

test('多个点时返回命中的那个', () => {
  const list = [L(1, 1), L(3.139, 101.6869), L(2, 2)];
  assert.strictEqual(findNearby(list, 3.139, 101.6869).id, '3.139,101.6869');
});

test('阈值可调', () => {
  assert.strictEqual(findNearby([L(3.139, 101.6869)], 3.139 + 8e-5, 101.6869, 5), null);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/maplogic.test.js`
Expected: FAIL — `Cannot find module '../maplogic.js'`

- [ ] **Step 3: 实现 `findNearby`**

用 haversine 或等距圆柱近似都行，但**必须按纬度缩放经度差**（`Δlon × cos(lat)`），并把经度差归一化到 ±180 —— 现有代码直接比较 `Math.abs(x.lon - o.lon) < 1e-4`，这两种情况都会错。地球半径取 6371000 米。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/maplogic.test.js`
Expected: 8 个测试全部 PASS

- [ ] **Step 5: 改 `addLocation`**

签名改为 `addLocation(o, opts)`。开头的重复判断改成调用 `findNearby(S.locations, +o.lat, +o.lon)`。末尾的 `hide(); setTab('saved');` 包在 `if(!(opts && opts.stay))` 里。成功返回新建的 `l`，重复分支返回 `null`。

重复分支里那两行清空 `#m-*` 输入框的代码也要跳过——`opts.stay` 时没有弹窗需要清。

- [ ] **Step 6: 接进页面并确认弹窗流程没变**

`index.html` 在 `<script src="app.js">` 之前加 `<script src="maplogic.js"></script>`；`sw.js` 的 `SHELL_FILES` 加 `'./maplogic.js'`。

Run: `node --check app.js`
Expected: 无输出

浏览器验证：从「添加地点」弹窗用经纬度加一个点，仍然跳回地点页；再加同一个点，仍然出 `dupLoc` toast。

- [ ] **Step 7: 提交**

```bash
git add maplogic.js tests/maplogic.test.js app.js index.html sw.js
git commit -m "feat: 就近查找的纯逻辑，addLocation 支持留在当前页"
```

---

### Task 2: 地图页顶栏、滚动与手势

**Files:**
- Modify: `index.html` — `.hdr` / `.pane` / `.map-wrap` / `#map` 的 CSS，新增 `body.map-mode` 规则
- Modify: `app.js` — `setTab()`、`initMap()`、删除 `map.on('click')` 加点逻辑

**Interfaces:**
- Consumes: 无
- Produces: `body.map-mode` —— 切到地图页时加、切走时移除

- [ ] **Step 1: 记录改动前的地点页顶栏高度**

浏览器里量出地点页 `.hdr` 的 `getBoundingClientRect().height` 并记下来。Task 结束时必须逐像素相同（Global Constraint）。

- [ ] **Step 2: `setTab` 切换 `body.map-mode`**

`setTab(which)` 里，`which === 'map'` 时 `document.body.classList.add('map-mode')`，否则移除。

- [ ] **Step 3: 顶栏压扁的 CSS**

全部写在 `body.map-mode` 前缀下：副标题并进标题那一行、标题字号降到 18px、`.seg` 变矮。地图页顶栏目标 130px 以内。

**Review Focus #1：** 每一条规则都必须带 `body.map-mode` 前缀。写完跑
`grep -n "^\.hdr\|^\.seg\|^\.brand" index.html` 对照，确认新增的每一条都在 `body.map-mode` 下。

- [ ] **Step 4: 页面不再滚动**

`body.map-mode #pane-map` 的 padding 归零、高度写死为视口减顶栏；`.map-wrap` 改 `height:100%`。`#map` 加 `touch-action:none` 与 `overscroll-behavior:contain`。

- [ ] **Step 5: 手势与删除点击加点**

`L.map('map', ...)` 的选项加 `zoomSnap:0`。

`initMap()` 里 `map.on('click', ...)` 那一整段（丢 `tapMarker`、改 `#map-foot`、绑 `#map-add`）**整段删除**。`tapMarker` 这个变量若再无引用，一并删掉。

跑 `grep -n "tapMarker\|map-add" app.js` 确认没有残留。

- [ ] **Step 6: 浏览器验证**

手机尺寸（375×812）：

- 切到地图页：`document.querySelector('#pane-map').scrollHeight === clientHeight`，整页不可滚
- 点地图任意位置：地图上不出现任何标记，`S.locations.length` 不变
- **Review Focus #2：** 双指缩放仍然可用——用 `touch2_path` 或真机确认捏合能改变 `map.getZoom()`；单指平移能改变 `map.getCenter()`
- **Review Focus #1：** 切回地点页，`.hdr` 高度与 Step 1 记下的值**逐像素相同**；地图页的值在 130px 以内

- [ ] **Step 7: 提交**

```bash
git add app.js index.html
git commit -m "feat: 地图页收窄顶栏、锁住滚动、删掉点击加点"
```

---

### Task 3: 右侧竖排（定位 / 加点 / 底图）

**Files:**
- Modify: `index.html` — `.map-top` 改造、新增 `.map-rail` 系列 CSS
- Modify: `app.js` — 新增 `renderRail()` / `bindRail()` / `locateMe()`，改 `drawBasemapSwitch()`

**Interfaces:**
- Consumes: Task 2 的 `body.map-mode`
- Produces:
  - `renderRail() -> string` —— 竖排的 HTML，三个 44px 圆钮
  - `bindRail()` —— 绑定三个按钮
  - `locateMe()` —— 取当前位置、`map.flyTo(coords, 14)`、画蓝点；**不保存**

- [ ] **Step 1: 撤掉地点数 chip，搬进顶栏副标题**

删除 `.map-top` 里的 `.map-chip`（含 `#map-count`）。`refreshPins()` 里写 `#map-count` 的那两行改为写到顶栏副标题元素：地图页显示「天气地图 · N 个地点」。

- [ ] **Step 2: 底图切换收成图标钮**

`drawBasemapSwitch()` 渲染的三个按钮移进一个默认隐藏的浮层，浮层挂在竖排左侧。竖排上的底图钮点击时切换浮层的显隐；选中某个底图后浮层收起。`setBasemap()` 的逻辑与 `S.basemap` 的落盘一字不动。

- [ ] **Step 3: 实现 `renderRail()` / `bindRail()` / `locateMe()`**

`.map-rail` 绝对定位 `right:12px`，`top:50%`，`transform:translateY(-35%)`（垂直居中略下偏，避开右上角够不到的问题）。三个 44px 圆钮自上而下：定位、加点、底图。加点钮这一任务里**不绑任何处理函数**（Task 5 绑上 `enterPlace`）——绑一个占位行为等于要在 Task 5 再拆一次。

`locateMe()` 失败时按 spec §6 分三种情况走 `toast()`：`gpsDenied`（`err.code === 1`）、`gpsInsecure`（非安全上下文）、`gpsFail`（其余）。

- [ ] **Step 4: 浏览器验证**

- 三个圆钮竖排在右侧，不遮挡地图中心
- 点底图钮展开三个选项，选一个后收起，`S.basemap` 落盘且底图真的换了
- 点定位：地图中心移动到返回的坐标，出现蓝点，`S.locations.length` **不变**
- 顶栏副标题显示正确的地点数

- [ ] **Step 5: 提交**

```bash
git add app.js index.html
git commit -m "feat: 地图右侧竖排，定位与底图收进图标钮"
```

---

### Task 4: 顶部地名搜索

**Files:**
- Modify: `index.html` — 新增 `.map-search` 系列 CSS 与容器
- Modify: `app.js` — 新增 `bindMapSearch()`

**Interfaces:**
- Consumes: 现有的 `geoSearch()`
- Produces: `bindMapSearch()` —— 绑定输入与结果点击；结果点击时调用 Task 5 的 `enterPlace()`

- [ ] **Step 1: 实现**

地图顶部一条细胶囊，放大镜图标 + `<input>`，左右各留 12px。

取数与竞态**完全复用 `#q` 那套**（`app.js` 里 `qTimer`/`qSeq` 的写法）：少于 2 个字符不搜、350ms 防抖、自增序号丢弃过期响应。不要另写一套。结果列在胶囊下方，每条显示地名、`admin1, country` 与坐标。

点结果 → `map.flyTo([lat, lon], 13)` → 调 `enterPlace({name, region})`（Task 5），并清空输入与结果列表。

Task 5 尚未实现时，这一步先只做 `flyTo` 与清空；Task 5 会把 `enterPlace` 接上。

- [ ] **Step 2: 浏览器验证**

- 输入 1 个字符不发请求；输入「Penang」出结果列表
- 点第一条：地图中心≈该结果坐标，输入框与结果清空
- 断网时搜索显示 `noNet`/`failLoad`，不白屏
- 搜一个不存在的地名显示 `noResult`

- [ ] **Step 3: 提交**

```bash
git add app.js index.html
git commit -m "feat: 地图顶部地名搜索"
```

---

### Task 5: 准星放置模式

**Files:**
- Modify: `index.html` — 新增 `.map-cross` 与确认条的 CSS
- Modify: `app.js` — 新增 `enterPlace()` / `exitPlace()` / `renderPlaceBar()`，接上 Task 3 的加点钮与 Task 4 的搜索结果

**Interfaces:**
- Consumes: `addLocation(o, {stay:true})`（Task 1）、加点钮（Task 3）、搜索结果（Task 4）
- Produces:
  - `P = {on: boolean, name: string, region: string}` —— 模块级状态，不进 `S`、不落盘
  - `enterPlace(seed: {name, region}|null)` / `exitPlace()`

- [ ] **Step 1: 实现进入与退出**

`enterPlace(seed)` 置 `P.on = true`、填入 `seed` 的名称与地区，显示准星与确认条。`exitPlace()` 复位 `P`、隐藏两者。

准星是一个绝对定位在地图正中的元素，`pointer-events:none`，不能拦手势。

- [ ] **Step 2: 确认条**

`.map-foot` 在放置模式下变成确认条：实时经纬度、名称输入框（预填 `P.name`）、确认与取消。

坐标随 `map.on('moveend')` 更新，取 `map.getCenter()`。

**Review Focus #4：** 定位与搜索都会 `flyTo`，`moveend` 在飞行结束时触发，因此坐标会自动跟上。验证时必须实际走一遍「先进放置模式，再按定位」，确认条坐标要变成新位置而不是停在旧值。

- [ ] **Step 3: 确认与取消**

确认 → 组装 `{name, region, lat, lon}`（名称为空时回退成 `lat.toFixed(3), lon.toFixed(3)`，与现状一致）→ `addLocation(o, {stay:true})` → 返回 `null`（重复）时出 `dupLoc` toast；无论哪种结果都 `exitPlace()`，并留在地图页。

取消 → `exitPlace()`，`S.locations` 不变。

- [ ] **Step 4: 切走标签页时退出**

**Review Focus #3：** `setTab()` 切离地图时调用 `exitPlace()`。否则准星与确认条会残留，或 `P.on` 仍为真使下一次进地图处在半个放置态。

- [ ] **Step 5: 接上 Task 3 与 Task 4**

加点钮改为 `enterPlace(null)`；搜索结果点击改为 `flyTo` 之后 `enterPlace({name, region})`。

- [ ] **Step 6: 浏览器验证**

- 按 +：准星出现在屏幕正中，确认条出现
- 拖地图：确认条坐标跟着变
- 确认：`S.locations` +1、地图多一个图钉、**仍在地图页**（`#pane-map` 仍是 `.on`）
- 在已有点 11 米内确认：不新增，出 `dupLoc` toast，退出放置模式
- 取消：准星与确认条消失，`S.locations` 不变
- 搜「Penang」点第一条：飞过去并自动进入放置模式，名称预填为该地名；确认后存下来的是地名不是坐标
- **Review Focus #4：** 放置模式中按定位，确认条坐标变成当前位置
- **Review Focus #3：** 放置模式中切到地点页再切回地图，准星与确认条都不在，`P.on` 为假

- [ ] **Step 7: 提交**

```bash
git add app.js index.html
git commit -m "feat: 准星放置模式，搜索与定位接入"
```

---

### Task 6: 三语文案、SW 版本与端到端验证

**Files:**
- Modify: `app.js` — `T` 表三个语言块
- Modify: `sw.js` — `VERSION`

**Interfaces:**
- Consumes: 全部前序任务

- [ ] **Step 1: 补全三语文案**

前面各任务新增的 key（搜索占位符、定位、加点、底图、确认、取消、准星提示、地图页副标题等）在 zh / en / ms 三块里全部补齐。

跑这个检查，确认三种语言的 key 集合完全一致：

```bash
node -e "
const s=require('fs').readFileSync('app.js','utf8');
const keys=l=>[...s.split('\n'+l+':{')[1].split('\n}')[0].matchAll(/(?:^|[,{]\s*\n?\s*)([a-zA-Z0-9]+):/gm)].map(m=>m[1]);
const [z,e,m]=['zh','en','ms'].map(keys);
const d=(a,b,an,bn)=>a.filter(k=>!b.includes(k)).forEach(k=>console.log(an+' 有但 '+bn+' 缺:',k));
d(z,e,'zh','en'); d(z,m,'zh','ms'); d(e,z,'en','zh'); d(m,z,'ms','zh');
const used=[...new Set([...s.matchAll(/\bt\('([a-zA-Z0-9]+)'\)/g)].map(x=>x[1]))];
console.log('key 数:',z.length,e.length,m.length,'| 未解析:',used.filter(k=>!(z.includes(k)&&e.includes(k)&&m.includes(k))));
"
```

Expected: 无「缺」输出，三个数字相等，未解析列表只可能含 `app`（正则边界所致，该 key 三语都有）。

- [ ] **Step 2: 递增 SW 版本**

`sw.js` 的 `VERSION` 改为 `'pw-v3.1.0'`。确认 `SHELL_FILES` 含 `'./maplogic.js'`。

- [ ] **Step 3: 跑全部单元测试**

Run: `node --test tests/*.test.js`
Expected: 全部 PASS（daylogic 11 条 + maplogic 8 条）

- [ ] **Step 4: 端到端验证（spec §8 的 12 条）**

手机尺寸逐条走，每条量出具体数值。

- [ ] **Step 5: 提交**

```bash
git add app.js sw.js
git commit -m "feat: 三语文案同步，SW 升到 v3.1.0"
```
