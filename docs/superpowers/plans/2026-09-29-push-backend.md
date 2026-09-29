# 推送后端 实现计划（子项目 B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让子项目 A 配好的提醒真的送到手机上。

**Architecture:** Cloudflare Worker + KV，Cron 每 15 分钟触发。判定逻辑继续放在仓库根的 `notifylogic.js`，手机端与服务端引用同一份。推送加密用 `@block65/webcrypto-web-push`，不手写。

**Tech Stack:** Cloudflare Workers（ES modules）、Workers KV、wrangler 4、`@block65/webcrypto-web-push`。测试用 `node --test`。

**Spec:** `docs/superpowers/specs/2026-09-29-push-backend-design.md`

## Global Constraints

- `windowSlice` / `breaches` 只有一份，在仓库根的 `notifylogic.js`，服务端 import 它，**不得复制一份到 server/**（spec §3）
- VAPID 私钥只经 `wrangler secret put` 进入 Cloudflare，**不得写入任何文件或提交**（spec §8）
- Worker 不把请求体写进日志 —— 里面有园区坐标（spec §8）
- CORS 只允许 `https://bryanwoo988.github.io`（spec §4.3）
- 推送失败不重试；404/410 删除订阅（spec §2）
- 每次改 `app.js` 后跑 `node --check app.js`
- 已有的 52 条测试必须保持通过

## 已就位（无需重做）

- Cloudflare 已登录，Account ID `fcf27a3912d4f1108e88993fa553b3a5`
- KV namespace `comparecast`，ID `5bb11669556f4f9399cf8313db72e82d`
- VAPID 公钥 `BBjBjJlP2b9oTWJFPK1CvEXXrrafJC0xmhlbOurC6GssgQQegLTVxAtfSk-iFVYmFPtkZqGIVTJhX3uRHP9TO1M`，私钥在会话临时目录的 `vapid.json`

## Review Focus

1. **跨午夜时段只取到半截** —— `windowSlice(times, dayISO, win)` 对 `22:00-02:00` 只会返回当日的 22、23 点，次日的 00、01 点被漏掉，聚合值因此偏低、阈值判定失真。→ Task 2
2. **Cron 窗口的边界** —— 提醒时间正好等于本次窗口的起点或终点时，必须恰好触发一次，不能漏也不能连着两次都触发。→ Task 2
3. **KV 最终一致导致重复推送** —— 去重键刚写入就读可能读不到。同一次 Cron 内必须另有内存级去重兜底。→ Task 4
4. **推送加密静默失败** —— 写错了只会收到一个 4xx，没有任何线索。必须有已知答案的测试，而不是「在手机上试了一下」。→ Task 4
5. **设备提交的数据自相矛盾** —— `blocks[].windows` 里含有 `notify.windows` 中不存在或已关闭的时段 id。服务端不能信任客户端，要自行过滤。→ Task 1

---

### Task 1: Worker 骨架、订阅接口与校验

**Files:**
- Create: `server/wrangler.toml`、`server/package.json`、`server/src/index.js`、`server/src/validate.js`
- Create: `tests/validate.test.js`

**Interfaces:**
- Produces:
  - `validateSub(body) -> {ok:true, value} | {ok:false, error}` — 校验并**规范化**订阅请求体
  - Worker 的 `fetch` 处理 `POST /sub`、`DELETE /sub`、`OPTIONS`

- [ ] **Step 1: 写失败的测试**

覆盖：合法请求通过；`id` 太短/含非法字符被拒；`tz` 非法被拒；`endpoint` 非 https 被拒；`blocks` 超过 50 条被拒；**`blocks[].windows` 中不存在于 `notify.windows` 或该时段 `on` 为假的 id 被过滤掉**（Review Focus #5）；过滤后 `windows` 为空的地块整条剔除。

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test tests/validate.test.js`
Expected: FAIL — 找不到模块

- [ ] **Step 3: 实现 `validate.js` 与 Worker 骨架**

`wrangler.toml` 绑定 KV（binding 名 `KV`，id 见上）、`compatibility_date` 设为今天、cron `*/15 * * * *`。

`index.js` 的 `fetch`：CORS 仅放行 `https://bryanwoo988.github.io`；`POST /sub` 校验后 `KV.put('dev:'+id, JSON.stringify(value))` 返回 204；`DELETE /sub` 删除返回 204；其余 404。**不记录请求体**。

- [ ] **Step 4: 跑测试确认通过；`node --check` 全绿**

- [ ] **Step 5: 本地起 Worker 验证**

```bash
cd server && npx wrangler dev --local
```
用 curl 验：合法请求 204 且 KV 里能读到；非法 tz 返回 400；来源不对返回 403。

- [ ] **Step 6: 提交**

```bash
git add server tests/validate.test.js
git commit -m "feat: 推送 Worker 骨架与订阅接口"
```

---

### Task 2: 到点判定与预报聚合

**Files:**
- Modify: `notifylogic.js` — 新增 `dueWindows`、`aggregate`、`spanDays`
- Modify: `tests/notifylogic.test.js`

**Interfaces:**
- Consumes: `minutesOf`、`windowSlice`
- Produces:
  - `dueWindows(windows, nowMin, spanMin) -> window[]` — 提醒时间落在 `(nowMin - spanMin, nowMin]` 内且 `on` 的时段
  - `spanDays(win, dayISO) -> string[]` — 该时段覆盖的日期；跨午夜时返回两天
  - `aggregate(hourly, idx) -> {rainProb,rainSum,tMax,tMin,wind,gust}` — 给定索引集合的聚合值，无数据的项为 `null`

- [ ] **Step 1: 写失败的测试**

**Review Focus #2：** `dueWindows` 的边界 —— `at` 等于 `nowMin` 时触发；等于 `nowMin - spanMin` 时**不**触发（属于上一个窗口，否则会连发两次）；`on` 为假的时段永不触发；跨越 0 点时（`nowMin=5`，`spanMin=15`）能取到 `at='23:55'` 的时段。

**Review Focus #1：** `spanDays({from:'22:00',to:'02:00'}, '2026-09-29')` 返回 `['2026-09-29','2026-09-30']`；不跨午夜时只返回一天。

`aggregate`：最大/求和/极值正确；全 null 时每项为 `null` 而不是 0 或 Infinity；空索引集合返回全 null。

- [ ] **Step 2–4: 确认失败 → 实现 → 确认通过**

`aggregate` 接收的是索引数组，由调用方用 `spanDays` + `windowSlice` 拼出来 —— 这样跨午夜的两段能合并成一个集合再聚合。

- [ ] **Step 5: 提交**

```bash
git add notifylogic.js tests/notifylogic.test.js
git commit -m "feat: 到点判定、跨午夜日期跨度与预报聚合"
```

---

### Task 3: 通知文案

**Files:**
- Create: `server/src/message.js`、`tests/message.test.js`

**Interfaces:**
- Produces: `messageFor(lang, win, stats, hits, units) -> {title, body}`

- [ ] **Step 1: 写失败的测试**

`digest` 模式给出摘要；`threshold` 模式只列 `hits` 里的项且带上阈值；三种语言都有输出；单位按 `units` 渲染（°F、mph 等）；`stats` 某项为 null 时该项不出现在文案里而不是显示 `null`。

- [ ] **Step 2–4: 确认失败 → 实现 → 确认通过**

服务端自带一份小的三语字符串表。**不尝试复用 app.js 里的 `T`** —— 那不是模块，强行引入会把整个前端拖进 Worker。

- [ ] **Step 5: 提交**

---

### Task 4: 推送发送、去重与死订阅清理

**Files:**
- Create: `server/src/send.js`
- Modify: `server/package.json` — 加 `@block65/webcrypto-web-push`
- Create: `tests/send.test.js`

**Interfaces:**
- Produces:
  - `sentKey(id, blockId, winId, dayISO) -> string`
  - `sendOne(env, dev, payload, seen) -> 'sent'|'skipped'|'expired'|'failed'`

- [ ] **Step 1: 写失败的测试**

**Review Focus #3：** `seen` 是同一次 Cron 内的内存 Set；同一个 `sentKey` 第二次调用返回 `'skipped'`，**即使 KV 还没读到那条记录**。

推送返回 404 或 410 → `'expired'` 且该设备被删除；返回 500 → `'failed'` 且**不**删除、**不**重试。

用假的 KV 与假的 fetch 做这些断言，不联网。

- [ ] **Step 2–4: 确认失败 → 实现 → 确认通过**

**Review Focus #4：** 加密不自己写，用 `@block65/webcrypto-web-push`。另加一条测试：用该库对一组固定输入加密，断言输出的 `Content-Encoding` 为 `aes128gcm` 且密文长度符合预期 —— 这是对「库确实在干活」的最低限度校验。

- [ ] **Step 5: 提交**

---

### Task 5: Cron 装配与本地集成

**Files:**
- Modify: `server/src/index.js` — 加 `scheduled` 处理

**Interfaces:**
- Consumes: Task 1–4 的全部

- [ ] **Step 1: 实现 `scheduled`**

遍历 `KV.list({prefix:'dev:'})` → 每设备用 `Intl.DateTimeFormat` 求当地日期与分钟 → `dueWindows` → 对每个勾选地块取预报（**同一次 Cron 内按 `lat,lon` 缓存**）→ `spanDays` + `windowSlice` 拼索引 → `aggregate` → `digest` 直接发 / `threshold` 跑 `breaches` → `sendOne`。

- [ ] **Step 2: 本地触发验证**

```bash
cd server && npx wrangler dev --local --test-scheduled
curl "http://localhost:8787/__scheduled?cron=*/15+*+*+*+*"
```

先 `POST /sub` 塞一条测试设备（提醒时间设成当前分钟），确认日志里走到了发送分支。真实推送会失败（假 endpoint），这一步只验流程走通。

- [ ] **Step 3: 提交**

---

### Task 6: 前端接入

**Files:**
- Modify: `app.js` — 订阅、同步、状态显示
- Modify: `sw.js` — `push` 与 `notificationclick` 事件，`VERSION` 递增

**Interfaces:**
- Consumes: Worker 的 `/sub`

- [ ] **Step 1: 订阅与同步**

主开关打开且已授权时：`pushManager.subscribe({userVisibleOnly:true, applicationServerKey:<VAPID 公钥>})` → 连同 `S.notify`、地块、时区、语言 POST 给 Worker。设备 ID 用 `crypto.randomUUID()` 生成一次存 `S.deviceId`。

设置改动后 debounce 3 秒重新同步。主开关关闭时 `DELETE /sub` 并 `unsubscribe()`。

- [ ] **Step 2: SW 收推送**

`sw.js` 加 `push` 事件：解析 JSON 载荷，`showNotification(title, {body, icon, badge, tag})`。`notificationclick` 打开应用。

- [ ] **Step 3: 换掉那段琥珀色说明**

spec A §4.5 的「通知不会送达」说明替换为真实状态：未订阅 / 已订阅 / 同步失败。**iPhone 必须加到主屏幕**这一条保留 —— 它依然成立。

- [ ] **Step 4: 浏览器验证**

订阅请求确实发出且 Worker 收到；关闭主开关后 KV 中该条消失。**真实送达无法在此环境验证**（见 spec §10）。

- [ ] **Step 5: 提交**

---

### Task 7: 部署与交接

- [ ] **Step 1: 写入 VAPID 私钥**

```bash
cd server && npx wrangler secret put VAPID_PRIVATE_KEY
```
从 `vapid.json` 粘贴。**不要把它写进任何文件。**

- [ ] **Step 2: 部署**

```bash
cd server && npx wrangler deploy
```

- [ ] **Step 3: 跑全部单元测试并合并前端改动，SW 版本递增**

- [ ] **Step 4: 交接说明**

给用户一份清单：手机打开站点 → 加到主屏幕（iPhone 必需）→ 开启提醒并授权 → 把某个时段的提醒时间设成 5 分钟后 → 等待。并说明这一步只能由用户完成。
