# 通知提醒设置界面 实现计划（子项目 A）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做出按时段、按地块配置天气提醒的完整设置界面与数据模型，并如实告知用户通知尚不会送达。

**Architecture:** 纯前端。判定逻辑抽到无 DOM 依赖的 `notifylogic.js`（子项目 B 的服务端将原样复用）；界面是一个与详情页同级的全屏页 `#notify`。不改 `sw.js` 的逻辑。

**Tech Stack:** 原生 JS（无框架、无构建）、原生 `<input type="time">`、Notification API、Service Worker（仅用于测试通知）。测试用 `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-29-notification-settings-design.md`

## Global Constraints

- 阈值一律以**公制存储**（°C、km/h、mm），仅显示时按 `S.units` 换算（spec §3）
- 最低温的运算符是 `≤`，其余五项是 `≥`，且**运算符必须显示在界面上**（spec §4.3）
- spec §4.5 那段「通知目前不会送达」的说明**不得弱化、不得折叠隐藏**（spec §9）
- 新增地块 `l.notify` 默认为 `[]`，不得默认开启通知（spec §6）
- 所有时间比较换算成分钟数，不比较字符串（spec §3）
- 三种语言 zh / en / ms 全部同步
- 每次改 `app.js` 后跑 `node --check app.js`
- 新增文件要进 `sw.js` 的 `SHELL_FILES`，`VERSION` 递增
- 本期不做推送服务端（spec §7）

## Review Focus

以下是 spec 隐含、但容易被漏掉的情况。每一条都已指派给下面某个任务的测试：

1. **跨午夜时段的判定** —— `00:00-06:00` 时 `23:30` 不在内、`03:00` 在内。写成 `from <= m && m < to` 会让凌晨时段永远为空，而这正是用户列出的四个时段之一。→ Task 1
2. **`<input type="time">` 返回空串或非法值** —— 用户清空输入框时控件给 `''`，直接存进去会让该时段之后永远算不出时间。→ Task 2
3. **切换 °C/°F 后阈值被重复换算** —— 每次重绘都换算一次而不是只在显示时换算，数值会一路漂移。→ Task 3
4. **关闭某个时段后，地块矩阵仍留着它那一列** —— 列消失了但 `l.notify` 里仍有该 id，再打开时状态要能恢复。→ Task 4
5. **浏览器不支持 Notification 或权限被永久拒绝** —— 页面其余部分必须照常可用，不能整页报错或卡住。→ Task 5

---

### Task 1: 判定逻辑

**Files:**
- Create: `notifylogic.js`
- Create: `tests/notifylogic.test.js`
- Modify: `index.html`（在 `app.js` 前引入）、`sw.js`（`SHELL_FILES`）

**Interfaces:**
- Produces:
  - `minutesOf(hhmm: string) -> number` — `'06:30'` → 390；非法或空 → `-1`
  - `inWindow(win: {from,to}, minutes: number) -> boolean` — `to < from` 表示跨午夜
  - `windowSlice(times: string[], dayISO: string, win) -> {start, n}` — 某日某时段的 hourly 索引区间，无匹配返回 `{start:-1, n:0}`
  - `breaches(rules, stats) -> string[]` — 超标的规则名，`tMin` 方向相反

`notifylogic.js` 末尾加 `if(typeof module !== 'undefined') module.exports = {...};`

- [ ] **Step 1: 写失败的测试**

```js
const {test} = require('node:test');
const assert = require('node:assert');
const {minutesOf, inWindow, windowSlice, breaches} = require('../notifylogic.js');

test('minutesOf 正常值', () => {
  assert.strictEqual(minutesOf('00:00'), 0);
  assert.strictEqual(minutesOf('06:30'), 390);
  assert.strictEqual(minutesOf('23:59'), 1439);
});
test('minutesOf 非法值返回 -1', () => {
  ['', '6:30', 'abc', '25:00', '06:60', null, undefined].forEach(v =>
    assert.strictEqual(minutesOf(v), -1, String(v)));
});
test('普通时段', () => {
  const w = {from:'06:00', to:'12:00'};
  assert.strictEqual(inWindow(w, minutesOf('06:00')), true);
  assert.strictEqual(inWindow(w, minutesOf('09:00')), true);
  assert.strictEqual(inWindow(w, minutesOf('12:00')), false);
  assert.strictEqual(inWindow(w, minutesOf('05:59')), false);
});
test('跨午夜时段', () => {
  const w = {from:'00:00', to:'06:00'};
  assert.strictEqual(inWindow(w, minutesOf('03:00')), true);
  assert.strictEqual(inWindow(w, minutesOf('23:30')), false);
});
test('真正跨午夜：22:00-02:00', () => {
  const w = {from:'22:00', to:'02:00'};
  assert.strictEqual(inWindow(w, minutesOf('23:30')), true);
  assert.strictEqual(inWindow(w, minutesOf('01:00')), true);
  assert.strictEqual(inWindow(w, minutesOf('12:00')), false);
});
test('windowSlice 取出该时段的小时', () => {
  const times = Array.from({length:48}, (_,i) =>
    `2026-09-29T${String(i%24).padStart(2,'0')}:00`).map((s,i) =>
    i < 24 ? s : s.replace('09-29','09-30'));
  assert.deepStrictEqual(windowSlice(times, '2026-09-29', {from:'06:00', to:'12:00'}), {start:6, n:6});
});
test('windowSlice 找不到该日', () => {
  assert.deepStrictEqual(windowSlice([], '2026-09-29', {from:'06:00', to:'12:00'}), {start:-1, n:0});
});
test('breaches 没有开启的规则时为空', () => {
  assert.deepStrictEqual(breaches({rainProb:{on:false, v:60}}, {rainProb:90}), []);
});
test('breaches 大于等于方向', () => {
  const rules = {rainProb:{on:true, v:60}, wind:{on:true, v:20}};
  assert.deepStrictEqual(breaches(rules, {rainProb:60, wind:5}), ['rainProb']);
  assert.deepStrictEqual(breaches(rules, {rainProb:59, wind:25}), ['wind']);
});
test('breaches 最低温是小于等于', () => {
  const rules = {tMin:{on:true, v:22}};
  assert.deepStrictEqual(breaches(rules, {tMin:22}), ['tMin']);
  assert.deepStrictEqual(breaches(rules, {tMin:23}), []);
  assert.deepStrictEqual(breaches(rules, {tMin:18}), ['tMin']);
});
test('breaches 缺失的统计值不算超标', () => {
  assert.deepStrictEqual(breaches({tMax:{on:true, v:35}}, {}), []);
  assert.deepStrictEqual(breaches({tMax:{on:true, v:35}}, {tMax:null}), []);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/notifylogic.test.js`
Expected: FAIL — `Cannot find module '../notifylogic.js'`

- [ ] **Step 3: 实现**

`minutesOf` 用 `/^([01]\d|2[0-3]):([0-5]\d)$/` 严格匹配，因此 `'6:30'` 与 `'25:00'` 都返回 -1。

**Review Focus #1：** `inWindow` 在 `to <= from` 时必须走跨午夜分支（`m >= from || m < to`），普通分支是 `m >= from && m < to`。两端都以「含起、不含止」为准。

`windowSlice` 先用日期前缀定位该日的首索引，再按小时筛选落在时段内的连续区间。

`breaches` 只看 `on` 为真的规则；`tMin` 用 `<=`，其余用 `>=`；统计值不是有限数时跳过。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test tests/notifylogic.test.js`
Expected: 11 个测试全部 PASS

- [ ] **Step 5: 接进页面并提交**

`index.html` 在 `app.js` 之前加 `<script src="notifylogic.js"></script>`；`sw.js` 的 `SHELL_FILES` 加 `'./notifylogic.js'`。

```bash
git add notifylogic.js tests/notifylogic.test.js index.html sw.js
git commit -m "feat: 通知时段与阈值的判定逻辑"
```

---

### Task 2: 数据模型、默认值与设置页入口

**Files:**
- Modify: `app.js` — 新增 `NOTIFY_DEFAULTS` / `normalizeNotify()`，改 `boot()`、`addLocation()`、`drawSettings()`
- Modify: `index.html` — 设置页新增入口行的样式

**Interfaces:**
- Consumes: `minutesOf`（Task 1）
- Produces:
  - `NOTIFY_DEFAULTS` — spec §3 的默认对象
  - `normalizeNotify()` — 就地校正 `S.notify` 与各地块的 `l.notify`
  - `notifySummary() -> string` — 设置页入口右侧的摘要文案

- [ ] **Step 1: 实现默认值与校正**

`normalizeNotify()`：`S.notify` 缺失时深拷贝默认值；逐个时段校验 `from`/`to`/`at`（`minutesOf` 返回 -1 就回落到该时段默认值）、`mode` 只能是 `'digest'` 或 `'threshold'`；`rules` 缺项补默认、`v` 非有限数回落默认。

**Review Focus #2：** 时间字段的校验必须在这里做，不能信任 `<input type="time">` 交回来的值。

每个地块：`l.notify` 不是数组则设为 `[]`；过滤掉不存在的时段 id（spec §6）。

- [ ] **Step 2: 挂进启动与新增地块**

`boot()` 在 `applyLang()` 之前调用 `normalizeNotify()`。`addLocation()` 创建地点时带上 `notify:[]`。

- [ ] **Step 3: 设置页入口**

`drawSettings()` 新增一个 group，一行「通知提醒」+ 右侧 `notifySummary()` + 右箭头，点击打开通知页。

`notifySummary()`：`S.notify.enabled` 为假时返回「未开启」；否则返回「N 个地块 · M 个时段」，N 是 `l.notify` 非空的地块数，M 是 `on` 的时段数。

- [ ] **Step 4: 浏览器验证**

- 首次启动后 `S.notify` 结构完整且落盘
- 手动把某个时段的 `from` 改成 `'abc'` 再刷新，该字段回落默认而不是留着坏值
- 新加一个地点，其 `notify` 为 `[]`
- 设置页入口摘要在「未开启」与「N 个地块 · M 个时段」之间正确切换

- [ ] **Step 5: 提交**

```bash
git add app.js index.html
git commit -m "feat: 通知设置的数据模型、校正与设置页入口"
```

---

### Task 3: 通知页骨架、时段编辑器与阈值

**Files:**
- Modify: `index.html` — 新增 `#notify` 页面标记与样式
- Modify: `app.js` — 新增 `openNotify()` / `paintNotify()` / `renderWindows()` / `renderRules()`

**Interfaces:**
- Consumes: `NOTIFY_DEFAULTS`、`normalizeNotify()`（Task 2）
- Produces:
  - `openNotify()` / `closeNotify()` — 与 `openDetail()` 同样的 history 处理
  - `renderWindows() -> string`、`renderRules() -> string`

- [ ] **Step 1: 页面骨架**

`#notify` 用 `.page`，顶部一条返回栏 + 标题 + 主开关。返回走与详情页相同的 `history.pushState` / `popstate` 路径，避免返回键把整个应用退掉。

- [ ] **Step 2: 时段编辑器**

四张卡片，内容见 spec §4.2。关闭的时段只渲染名称与开关。

`to < from` 时在卡片上加一行「此时段跨天」的标注。

- [ ] **Step 3: 阈值**

六行，每行显示运算符（`≥` 或 `≤`）、数值输入、单位。

**Review Focus #3：** 换算只在渲染时做一次，回写时换算回公制。绝不能对已经是显示单位的值再换算一次。写完后手动切 °C→°F→°C，确认 `S.notify.rules.tMax.v` 回到原值。

- [ ] **Step 4: 浏览器验证**

- 关闭某时段后该卡片收成一行
- 凌晨时段显示跨天标注
- 改起止时间后落盘，刷新后保留
- 阈值在 °C/°F 之间来回切换，**存储值不变**，显示值正确
- 最低温那行显示的是 `≤`

- [ ] **Step 5: 提交**

```bash
git add app.js index.html
git commit -m "feat: 通知页时段编辑器与阈值设置"
```

---

### Task 4: 地块矩阵

**Files:**
- Modify: `app.js` — 新增 `renderMatrix()` / `bindMatrix()`
- Modify: `index.html` — 矩阵样式

**Interfaces:**
- Consumes: `S.notify.windows`、`l.notify`
- Produces: `renderMatrix() -> string`、`bindMatrix()`

- [ ] **Step 1: 实现**

表头为 `on` 的时段短名，每个地块一行。点单元格切换该地块该时段；点表头切换整列。

**Review Focus #4：** 列只按 `on` 的时段渲染，但切换时段开关**不得清空** `l.notify` 里对应的 id —— 重新打开该时段时，之前的勾选要原样回来。

没有地块时显示引导文案；全部时段关闭时显示提示而不是空表头。

- [ ] **Step 2: 浏览器验证**

- 勾选若干地块的若干时段，刷新后保留
- 关掉一个时段：该列消失；重新打开：原先的勾选回来
- 点表头整列开、再点整列关
- 删除一个地块后矩阵少一行
- 全部时段关闭时显示提示

- [ ] **Step 3: 提交**

```bash
git add app.js index.html
git commit -m "feat: 通知页的地块 × 时段矩阵"
```

---

### Task 5: 权限、测试通知与三语

**Files:**
- Modify: `app.js` — 新增 `renderPermission()` / `askPermission()` / `sendTestNotification()`，补三语文案
- Modify: `sw.js` — `VERSION` 递增

**Interfaces:**
- Consumes: 前序全部

- [ ] **Step 1: 权限区**

显示当前权限状态。未授权时给「允许通知」按钮调用 `Notification.requestPermission()`。

spec §4.5 那段「设置会保存但通知不会送达 / 还需要服务端 / iPhone 必须加到主屏幕」的说明**固定显示**，不可折叠。

**Review Focus #5：** `'Notification' in window` 为假，或权限为 `'denied'` 时，隐藏权限按钮与测试按钮，**页面其余部分照常可用**。

- [ ] **Step 2: 测试通知**

`sendTestNotification()` 取 `navigator.serviceWorker.getRegistration()` 后调 `reg.showNotification(...)`；取不到注册则回落到 `new Notification(...)`；两者都不可用时 toast 说明。

- [ ] **Step 3: 补全三语**

新增 key 在 zh / en / ms 三块补齐，跑 parity 检查确认三者一致且每个 `t()` 都解析得到。

- [ ] **Step 4: 递增 SW 版本**

`sw.js` 的 `VERSION` 改为 `'pw-v3.5.0'`，确认 `SHELL_FILES` 含 `'./notifylogic.js'`。

- [ ] **Step 5: 端到端验证（spec §8 的 11 条）**

逐条走并量出具体数值。

- [ ] **Step 6: 提交**

```bash
git add app.js sw.js
git commit -m "feat: 通知权限、测试通知与三语文案"
```
