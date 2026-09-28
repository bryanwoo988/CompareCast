# 详情页按日期重构 + 可交互图表 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把详情页从「预报/对比/准度」三页签改成按日期组织的线性页面，顶部横向日期条根治 10 天列表的星期几歧义，图表支持触摸查值。

**Architecture:** 纯前端重绘，不新增任何网络请求——所需数据 `getMain`/`getCompare`/`getExtras` 已全部取到。把按日切片的纯逻辑抽到新文件 `daylogic.js`（无 DOM 依赖，可用 node 跑断言），`app.js` 里把近 100 行的 `paintForecast()` 拆成 6 个渲染函数。

**Tech Stack:** 原生 JS（无框架、无构建）、SVG 图表、Leaflet（地图，本次不动）、Service Worker。测试用 `node --test`（Node 内置，无需装包）。

**Spec:** `docs/superpowers/specs/2026-09-28-daily-detail-redesign-design.md`

## Global Constraints

- 切日期、切模式必须是纯前端重绘，**不得产生任何网络请求**（spec §5）
- 准度卡片标题固定含「过去 7 天」，与日期条视觉隔开（spec §3）
- 降雨概率的 `probSrc` 来源标注（「来自 Best Match 混合模式」）不得删除（spec §4.6）
- 三种语言 zh / en / ms 全部同步，缺一不可
- `S.compare` 至少保留一条模式，只剩一条时点击不生效
- 每次改 `app.js` 后跑 `node --check app.js`
- 改动 `index.html` / `app.js` / 新增文件后，`sw.js` 的 `VERSION` 必须递增，新文件要进 `SHELL_FILES`

## Review Focus

以下是 spec 隐含、但容易被漏掉的输入情况。每一条都已指派给下面某个任务的测试：

1. **夏令时切换日只有 23 或 25 个小时点** — 硬编码 24 会切错。欧洲/北美用户会在每年两天遇到。→ Task 1
2. **第 10 天的 hourly 数据不足 24 小时** — 部分模式尾部截断，应按实际长度渲染而非补空。→ Task 1
3. **选中日全部勾选模式都无数据** — 图表区应显示 `—` 而非抛错或白屏。→ Task 3
4. **切换单位后选中的日期索引** — 应保留用户选中的那天，不该悄悄跳回今天。→ Task 6
5. **选中非今天时数据格子仍显示实况值** — 选 10/3 却显示今天的实时气压是新的误导。→ Task 6

---

### Task 1: 按日切片的纯逻辑

**Files:**
- Create: `daylogic.js`
- Create: `tests/daylogic.test.js`

**Interfaces:**
- Produces:
  - `sliceDay(times: string[], dayISO: string) -> {start: number, n: number}` — 在 hourly 的 time 数组里定位某一天的首索引和长度；找不到返回 `{start: -1, n: 0}`
  - `extremaOf(values: (number|null)[]) -> {hiIdx: number, loIdx: number}` — 极值点索引，全 null 时返回 `{hiIdx: -1, loIdx: -1}`
  - `nowIndex(times: string[], nowISO: string) -> number` — 当前小时在切片中的位置，不在该日返回 `-1`

`daylogic.js` 末尾加 `if(typeof module !== 'undefined') module.exports = {sliceDay, extremaOf, nowIndex};`，浏览器里这行是死代码，node 里用它导入。

- [ ] **Step 1: 写失败的测试**

```js
// tests/daylogic.test.js
const {test} = require('node:test');
const assert = require('node:assert');
const {sliceDay, extremaOf, nowIndex} = require('../daylogic.js');

const mk = (day, hours) => Array.from({length: hours}, (_, h) =>
  `${day}T${String(h).padStart(2,'0')}:00`);

test('普通一天切出 24 点', () => {
  const times = [...mk('2026-09-28',24), ...mk('2026-09-29',24)];
  assert.deepStrictEqual(sliceDay(times, '2026-09-29'), {start:24, n:24});
});

test('夏令时短日只有 23 点', () => {
  const times = [...mk('2026-03-28',24), ...mk('2026-03-29',23), ...mk('2026-03-30',24)];
  assert.deepStrictEqual(sliceDay(times, '2026-03-29'), {start:24, n:23});
});

test('夏令时长日有 25 点', () => {
  const times = [...mk('2026-10-24',24), ...mk('2026-10-25',25)];
  assert.deepStrictEqual(sliceDay(times, '2026-10-25'), {start:24, n:25});
});

test('末日数据被截断时按实际长度返回', () => {
  const times = [...mk('2026-09-28',24), ...mk('2026-09-29',7)];
  assert.deepStrictEqual(sliceDay(times, '2026-09-29'), {start:24, n:7});
});

test('找不到该日返回 start -1', () => {
  assert.deepStrictEqual(sliceDay(mk('2026-09-28',24), '2026-12-01'), {start:-1, n:0});
});

test('空数组不抛错', () => {
  assert.deepStrictEqual(sliceDay([], '2026-09-28'), {start:-1, n:0});
});

test('极值点索引', () => {
  assert.deepStrictEqual(extremaOf([22,25,31,28,24]), {hiIdx:2, loIdx:0});
});

test('极值跳过 null', () => {
  assert.deepStrictEqual(extremaOf([null,25,null,31,24]), {hiIdx:3, loIdx:4});
});

test('全 null 返回 -1', () => {
  assert.deepStrictEqual(extremaOf([null,null]), {hiIdx:-1, loIdx:-1});
});

test('当前小时定位', () => {
  assert.strictEqual(nowIndex(mk('2026-09-28',24), '2026-09-28T14:30'), 14);
});

test('当前时刻不在该日返回 -1', () => {
  assert.strictEqual(nowIndex(mk('2026-09-28',24), '2026-09-29T03:00'), -1);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/`
Expected: FAIL — `Cannot find module '../daylogic.js'`

- [ ] **Step 3: 实现 `daylogic.js`**

三个函数都只做字符串前缀比较（`time.slice(0,10)` 取日期、`slice(0,13)` 取到小时），**不要用 `new Date()` 解析**——hourly 的时间戳是 Open-Meteo 按 `timezone=auto` 返回的本地时间且不带时区后缀，交给 `Date` 会按运行环境时区重新解释，夏令时那两天必然错位。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/`
Expected: 11 个测试全部 PASS

- [ ] **Step 5: 接进页面**

`index.html` 在 `<script src="app.js">` **之前**加 `<script src="daylogic.js"></script>`；`sw.js` 的 `SHELL_FILES` 加 `'./daylogic.js'`。

- [ ] **Step 6: 提交**

```bash
git add daylogic.js tests/daylogic.test.js index.html sw.js
git commit -m "feat: 按日切片的纯逻辑 + node 断言测试"
```

---

### Task 2: 横向日期条

**Files:**
- Modify: `app.js` — `D` 状态对象 (`app.js:709`)、`openDetail()` (`app.js:712`)
- Modify: `index.html` — 新增 `.d-days` 系列 CSS

**Interfaces:**
- Consumes: Task 1 无
- Produces:
  - `renderDayStrip() -> string` — 返回日期条的 HTML，数据取自 `D.main.daily.time`
  - `bindDayStrip()` — 绑定点击，改 `D.day` 后调用 `paintDetail()`
  - `D.day: number` — 选中日索引，默认 `0`

- [ ] **Step 1: 加状态**

`D` 对象加 `day:0`；`openDetail()` 重建 `D` 时同样带 `day:0`（切换地点必须回到今天）。

- [ ] **Step 2: 实现 `renderDayStrip()`**

每格两行：`toLocaleDateString(locale(), {weekday:'narrow'})` + 日期数字（`time.slice(8,10)` 去掉前导零）。今天那格数字用 `var(--accent)` 蓝；选中格白色实心圆底 + 深色数字。整条横向滚动。

格子下方一行完整日期，用 `toLocaleDateString(locale(), {year:'numeric', month:'long', day:'numeric', weekday:'long'})`。

- [ ] **Step 3: 实现 `bindDayStrip()`**

点击改 `D.day` → `paintDetail()` → 选中格 `scrollIntoView({inline:'center', block:'nearest'})`。

- [ ] **Step 4: CSS**

`.d-days` sticky，`top` 必须等于 `.d-bar` 的实际高度：`calc(var(--safe-t) + 70px)`。`.d-tabs` 现有的 sticky top 是 `calc(var(--safe-t) + 66px)`，Task 7 会删掉它，届时不会冲突。

- [ ] **Step 5: 浏览器验证**

本地起 `python3 -m http.server`，手机尺寸（375×812）打开详情页。检查：
- 10 格日期数字互不相同（这是本次重构要解决的核心问题）
- 点任一格，下方完整日期跟着变
- 今天那格是蓝色，选中格是白底
- 往下滚，日期条贴在返回键那一条下面不跑掉

- [ ] **Step 6: 提交**

```bash
git add app.js index.html
git commit -m "feat: 详情页横向日期条，消除星期几重复的歧义"
```

---

### Task 3: 图表改造——按日切片 + 视觉升级

**Files:**
- Modify: `app.js` — `seriesFor()` (`app.js:942`)、`buildChart()` (`app.js:968`)

**Interfaces:**
- Consumes: `sliceDay`、`extremaOf`、`nowIndex`（Task 1）；`D.day`（Task 2）
- Produces:
  - `seriesForDay(vari: 'temp'|'rain'|'wind'|'prob') -> {labels: string[], series: Array<{id,name,color,values}>, nowAt: number}` — 取代 `seriesFor()`，按 `D.day` 切片。`'temp'|'rain'|'wind'` 从 `D.cmp` 取多模式；`'prob'` 从 `D.ext.hourly.precipitation_probability` 取，只有 best_match 一条线，`series` 长度恒为 1
  - `buildChart(host: string, opts: {vari, fill: boolean, marks: boolean, yRange?: [number,number]}) -> void` — `host` 是容器选择器，一份交互代码给两张图用；`yRange` 用于把降雨概率固定在 0–100

- [ ] **Step 1: 实现 `seriesForDay()`**

用 `D.main.daily.time[D.day]` 拿到日期字符串，对 `D.cmp.hourly.time` 调 `sliceDay` 得到 `{start, n}`，各模式的值用同一对 `start/n` 切。`labels` 取 `time.slice(11,16)`。`nowAt` 由 `nowIndex` 给出，非今天时为 `-1`。

`D.cmp` 为 `'fail'` 或 `null` 时，退回只用 `D.main.hourly` 画当前模式单线。

**Review Focus #3：** 切出来的 series 为空（全部模式该日无数据）时返回空数组，`buildChart` 渲染 `—` 而不抛错。

- [ ] **Step 2: 改 `buildChart()` 的视觉**

在现有实现上加三样，**不重写坐标换算和 pointer 绑定**（那部分现在是对的）：

- 渐变填充：`series.length === 1 && opts.fill` 时，在折线 path 基础上补 `L` 回底边闭合，填 `linearGradient` 从线色 `opacity .38` 到 `0`
- H / L 标注：`series.length === 1 && opts.marks` 时，用 `extremaOf` 拿极值索引，画小圆点 + 文字
- 当前时刻竖线：`nowAt >= 0` 时画一条 `rgba(255,255,255,.35)` 虚线

多条线时 `fill` 和 `marks` 一律关闭（七层半透明叠加会糊成一片）。

- [ ] **Step 3: 改交互**

- 浮动数值标签移到图表**正上方**，格式 `14:00  ☁ 29°`，跟随游标；多条线时显示当前模式的值，其余模式的值仍在下方列表更新
- `release()` 改成**不清除游标**：删掉 `cur.setAttribute('opacity', 0)` 和 `at(0)`，手指松开后游标停在原地

- [ ] **Step 4: 浏览器验证**

- 单模式：曲线下有渐变，H/L 两点有标注
- 勾多个模式：渐变和 H/L 自动消失，多条线清晰可辨
- 手指按住横向拖动，上方数值实时变；**松手后游标留在原地**
- 选今天时图上有当前时刻竖线，选其他日期没有
- 打开 DevTools Network 面板，连点 10 个日期：**网络面板无新请求**（Global Constraint）

- [ ] **Step 5: 提交**

```bash
git add app.js
git commit -m "feat: 图表按日切片，加渐变填充、H/L 标注、游标保留"
```

---

### Task 4: 模式勾选 chip 排

**Files:**
- Modify: `app.js` — 新增 `renderModelChips()` / `bindModelChips()`

**Interfaces:**
- Consumes: `S.compare`、`MODELS`、`buildChart()`（Task 3）
- Produces: `renderModelChips() -> string`、`bindModelChips()`

- [ ] **Step 1: 实现两个函数**

横向滚动的 chip 排，每个带模式色圆点。勾选态白底深字，未选态 `rgba(255,255,255,.08)`。读写的就是 `S.compare`，与设置页共用状态。

点击后：改 `S.compare` → `save()` → 只重画图表（`buildChart`），**不重新请求**（`D.cmp` 已有全部模式数据）。

至少保留一条：`S.compare.length === 1` 时点那一条不生效——沿用 `drawSettings()` 里 `[data-cmp]` 的既有规则，不要另写一套。

- [ ] **Step 2: 浏览器验证**

- 点 chip 线立刻出现/消失，无网络请求
- 取消到只剩一条时，再点它没反应
- 图表自动在单线（有渐变/HL）和多线（无渐变）之间切换
- 去设置页看「对比模式」，勾选状态与 chip 排一致

- [ ] **Step 3: 提交**

```bash
git add app.js
git commit -m "feat: 图表旁的模式勾选 chip，替代设置页深处的入口"
```

---

### Task 5: 降雨概率图

**Files:**
- Modify: `app.js` — 新增 `renderProbChart()`

**Interfaces:**
- Consumes: `buildChart()`（Task 3）、`D.ext`、`D.day`
- Produces: `renderProbChart() -> string`

- [ ] **Step 1: 实现**

复用 `buildChart()`，传 `{vari:'prob', fill:true, marks:false, yRange:[0,100]}`。取数逻辑在 Task 3 的 `seriesForDay('prob')` 里已实现（从 `D.ext` 取，单线），这里不重复写切片。

`D.ext === 'fail'` 或为 null 时**整块不渲染**，不显示空图。

保留 `probSrc` 文案（Global Constraint）。

- [ ] **Step 2: 浏览器验证**

- 降雨概率图可触摸，显示 `17:00  25%`
- 底下有「来自 Best Match 混合模式」的说明
- 断网重进详情页，这一块整个消失而不是显示空图

- [ ] **Step 3: 提交**

```bash
git add app.js
git commit -m "feat: 可交互的降雨概率图"
```

---

### Task 6: 逐小时列表与数据格子改为按日

**Files:**
- Modify: `app.js` — `paintForecast()` 里的 strip 与 cells 两段 (`app.js:830-875` 附近)
- Modify: `app.js` — `drawSettings()` 单位切换处 (`app.js:1277` 附近)

**Interfaces:**
- Consumes: `sliceDay`、`nowIndex`、`D.day`
- Produces: `renderHourStrip() -> string`、`renderCells() -> string`

- [ ] **Step 1: 改逐小时列表**

改为显示**选中日**的全部小时（而非「从现在起 24 小时」）。标题从「未来 24 小时」改为该日日期。选中今天时当前小时那格标「现在」，选其他日期时不标。

- [ ] **Step 2: 改数据格子**

**Review Focus #5：** 选中今天时显示 `current` 的实况值；**选中其他日期时必须改为显示该日的 daily 聚合值**（最高/最低/降雨总量/日出日落/UV），小标题从「当前实况」改为该日日期。选 10/3 却显示今天的实时气压是新的误导。

非今天时无对应值的格子（如实时气压、风向）不渲染该格，而不是显示 `—` 撑位。

- [ ] **Step 3: 保住单位切换时的选中日**

**Review Focus #4：** `drawSettings()` 里单位切换调用 `loadDetail()` 会重建数据。确认 `D.day` 在这条路径上**不被重置**（`loadDetail` 本身不碰 `D.day`，只有 `openDetail` 重置）。若发现被重置，在 `loadDetail` 前后保存并恢复。

- [ ] **Step 4: 浏览器验证**

- 选今天：格子显示实况，逐小时有「现在」标记
- 选 3 天后：格子标题变成那天的日期，显示的是该日聚合值，没有实时气压那格
- 在设置里把 °C 切成 °F：回到详情页，**选中的还是原来那天**，数值变成华氏

- [ ] **Step 5: 提交**

```bash
git add app.js
git commit -m "feat: 逐小时与数据格子跟随选中日期"
```

---

### Task 7: 拆掉页签，线性装配

**Files:**
- Modify: `index.html` — 删除 `.d-tabs` 标记 (`index.html:353-360`) 与其 CSS (`index.html:145-149`)
- Modify: `app.js` — `paintBody()` (`app.js:797`)、`paintForecast()` (`app.js:804`)、`paintCompare()` (`app.js:896`)、`paintAccuracy()` (`app.js:1077`)

**Interfaces:**
- Consumes: Task 2–6 的全部 render 函数
- Produces: `paintDetail()` — 总装函数，取代 `paintBody()` / `paintForecast()` / `paintCompare()`

- [ ] **Step 1: 写 `paintDetail()` 总装**

按 spec §4.1 的顺序拼接：

```
renderDayStrip() → renderTempChart() + renderModelChips() → renderProbChart()
→ renderHourStrip() → renderCells() → renderAccuracyCard() → 重命名/删除
```

写完后各自绑事件。**`paintForecast()` / `paintCompare()` / `paintBody()` 三个函数删除**——它们的内容已分散到各 render 函数里，留着就是死代码。

- [ ] **Step 2: 准度降级为卡片**

把 `paintAccuracy()` 的渲染部分抽成 `renderAccuracyCard()`，放在页面底部。

**Global Constraint：** 标题固定写「模式准度核对（过去 7 天）」（三语同步），保留现有的 `accWindow` 区间文案，整块上方加一条分隔线、用不同的背景层级，与按日期组织的内容明确隔开。`runAccuracy()` 的取数逻辑完全不动。

- [ ] **Step 3: 删除页签残留**

删 `index.html` 的 `.d-tabs` 标记和 CSS；删 `app.js` 里 `$$('.d-tabs button')` 的事件绑定（`app.js:735` 附近）和 `D.tab` 的所有读写。`D.span` / `D.vari` 若只被已删的对比页签使用，一并清理。

跑 `grep -n "d-tabs\|D\.tab\b" app.js index.html` 确认没有残留。

- [ ] **Step 4: 浏览器验证**

- 详情页从上到下一条线读完，没有页签
- 准度卡片在最底部，标题含「过去 7 天」，与上方内容视觉上分得开
- `node --check app.js` 通过
- Console 无报错

- [ ] **Step 5: 提交**

```bash
git add app.js index.html
git commit -m "refactor: 详情页改为线性布局，去掉三页签"
```

---

### Task 8: 三语文案、SW 版本与端到端验证

**Files:**
- Modify: `app.js` — `T` 表三个语言块 (`app.js:61-203`)
- Modify: `sw.js` — `VERSION`

**Interfaces:**
- Consumes: 全部前序任务

- [ ] **Step 1: 补全三语文案**

前面各任务新增的 key（日期条标题、准度卡片新标题、逐小时新标题等）在 zh / en / ms 三块里全部补齐。

跑一个检查，确认三种语言的 key 集合完全一致：

```bash
node -e "
const s=require('fs').readFileSync('app.js','utf8');
const keys=l=>[...s.split('  '+l+':{')[1].split('\n  },')[0].matchAll(/^  ([a-zA-Z0-9]+):/gm)].map(m=>m[1]);
const [z,e,m]=['zh','en','ms'].map(keys);
const d=(a,b,an,bn)=>a.filter(k=>!b.includes(k)).forEach(k=>console.log(an+' 有但 '+bn+' 缺:',k));
d(z,e,'zh','en'); d(z,m,'zh','ms'); d(e,z,'en','zh'); d(m,z,'ms','zh');
console.log('key 数:',z.length,e.length,m.length);
"
```

Expected: 无「缺」输出，三个数字相等。

- [ ] **Step 2: 递增 SW 版本**

`sw.js` 的 `VERSION` 改为 `'pw-v3.0.0'`（这是结构性改版）。确认 `SHELL_FILES` 含 `'./daylogic.js'`。

- [ ] **Step 3: 跑全部单元测试**

Run: `node --test tests/`
Expected: 全部 PASS

- [ ] **Step 4: 端到端验证（spec §8 的 9 条）**

手机尺寸逐条走：

1. 日期条每格数字唯一，完整日期行与所选格一致
2. 连点 10 个日期，Network 面板无新请求
3. 连点所有模式 chip，无新请求
4. 选今天：图上有当前时刻竖线，格子显示实况
5. 选非今天：格子标题为该日日期，显示聚合值
6. 手指松开后游标停在原地
7. 断网重进：各块按 spec §6 降级，不白屏
8. 中/英/马来文下日期格式与星期缩写正确
9. 准度卡片标题含「过去 7 天」，与日期条视觉隔开

- [ ] **Step 5: iPhone Safari 真机或模拟器验证**

**spec §9 的次要风险：** `.d-bar` 与 `.d-days` 两层 sticky 的 `top` 在有 `safe-area-inset` 的刘海屏上最容易错位。必须在真机或 iOS 模拟器上确认：滚动时日期条紧贴返回键那一条下方，既不重叠也不留缝。

- [ ] **Step 6: 提交**

```bash
git add app.js sw.js
git commit -m "feat: 三语文案同步，SW 升到 v3.0.0"
```
