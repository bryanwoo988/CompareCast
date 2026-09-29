# 推送后端（子项目 B）

日期：2026-09-29
状态：待实现

## 1. 为什么做

子项目 A 做出了完整的提醒配置界面，但通知不会送达：应用是 GitHub Pages 上的静态站点，没有任何东西能在早上 7 点把手机叫醒。本项目补上那台服务器。

## 2. 已确认的决策

用户在 brainstorm 中拍板：

1. **Cloudflare Workers + KV**，Cron Trigger 每 15 分钟触发。免费额度足够。
2. **设备随机 ID 认人**，不做账号、不收邮箱。换设备需要重新配置。
3. **推送失败不重试**：返回 404/410 视为订阅失效并删除；其他错误记日志后放弃。天气提醒过了时间点再补发只会添乱。

## 3. 架构

```
手机                         Worker                      Open-Meteo
 │  POST /sub  ────────────▶  KV: dev:<id>
 │  DELETE /sub ───────────▶  （删除）
                              │
   Cron */15 ────────────────▶ 遍历设备 → 算当地时间 → 到点的时段
                              │    └── 取预报 ────────────▶
                              │    └── windowSlice + breaches
                              ▼
                        Web Push ──▶ 推送服务 ──▶ 手机
```

`windowSlice` 与 `breaches` 从仓库根目录的 `notifylogic.js` 引入，**与手机端同一份源码**。判定逻辑分叉会导致「应用说会提醒但没收到」，这类问题极难排查。

## 4. 接口

### 4.1 `POST /sub`

请求体：

```json
{
  "id": "<设备随机 ID>",
  "tz": "Asia/Kuala_Lumpur",
  "sub": {"endpoint":"…","keys":{"p256dh":"…","auth":"…"}},
  "notify": { /* S.notify 原样 */ },
  "blocks": [{"id":"l1","name":"…","lat":3.139,"lon":101.687,"windows":["morning"]}]
}
```

写入 KV 的 `dev:<id>`，整条覆盖。返回 `204`。

校验：`id` 为 8–64 位 `[A-Za-z0-9_-]`；`tz` 能被 `Intl.DateTimeFormat` 接受；`sub.endpoint` 是 https URL；`blocks` 不超过 50 条。任一不合返回 `400`。

### 4.2 `DELETE /sub`

请求体 `{"id":"…"}`，删除该 key，返回 `204`。

### 4.3 CORS

只允许来源 `https://bryanwoo988.github.io`。其他来源直接 `403`。

## 5. Cron 逻辑

每 15 分钟：

1. `KV.list({prefix:'dev:'})` 遍历所有设备
2. 用 `Intl.DateTimeFormat(tz)` 求出该设备当地的 `YYYY-MM-DD` 与分钟数 `nowMin`
3. 选出 `on` 且 `minutesOf(at)` 落在 `(nowMin - 15, nowMin]` 内的时段
4. 对该时段被勾选的每个地块：
   - 取预报（同一次 Cron 内按坐标缓存，避免重复请求）
   - `windowSlice(hourly.time, 当地日期, win)` 切出区间
   - 聚合：`rainProb` 取最大、`rainSum` 求和、`tMax`/`tMin` 取极值、`wind`/`gust` 取最大
   - `mode === 'digest'` 直接发；`mode === 'threshold'` 则 `breaches()` 非空才发
5. 发送前检查去重键 `sent:<id>:<blockId>:<winId>:<当地日期>`，存在就跳过；发送后写入，TTL 36 小时

### 5.1 为什么去重键是必须的

Cron 每 15 分钟一次，而时段的判定是一个 15 分钟的窗口。时钟漂移、Cron 重试、跨时区的边界都可能让同一个时段被判定两次。没有去重键，用户会在同一个早上收到两条一样的提醒。

## 6. 推送加密

Web Push 载荷按 RFC 8291（aes128gcm）加密，VAPID 按 RFC 8292 签名。

优先使用 Workers 运行时兼容的成熟库。若没有可靠的，则用 Web Crypto 自行实现，并**用 RFC 8291 §5 的官方测试向量做单元测试** —— 加密代码写错不会报错，只会静默失败，必须有已知答案的测试兜底。

## 7. 通知内容

标题为地块名。正文按模式：

- `digest`：`早上 · 降雨 70% · 24-33°`
- `threshold`：只列出超标项，如 `早上 · 降雨概率 85%（≥60%）`

单位按设备提交的 `notify` 里的设置渲染。多语言：设备提交时一并带上 `lang`，服务端按语言出文案。

## 8. 隐私与安全

| 项 | 处理 |
|---|---|
| 存储内容 | 设备随机 ID、推送凭证、时区、语言、提醒设置、地块坐标与名称 |
| **不存** | 姓名、邮箱、任何账号信息 |
| VAPID 私钥 | `wrangler secret`，不落盘、不进仓库 |
| 设备 ID | 客户端 `crypto.randomUUID()` 生成，服务端不做关联 |
| 删除 | 关闭主开关即 `DELETE /sub`，KV 中不留残余 |

地块坐标是用户的园区位置，属敏感数据。Worker 不记录请求体到日志。

## 9. 明确不做（YAGNI）

- 账号系统、跨设备同步
- 失败重试与补发
- 通知历史
- 管理后台
- 除 GitHub Pages 之外的来源

## 10. 测试

**纯逻辑**（`node --test`，无需 Cloudflare）：

- `dueWindows(notify, nowMin)` — 哪些时段的提醒时间落在本次窗口内；跨午夜、边界值
- `aggregate(hourly, slice)` — 聚合正确；全 null 返回 null 而不是 0
- `messageFor(...)` — 摘要与阈值两种模式的文案
- 推送加密对 RFC 8291 测试向量

**本地集成**：`wrangler dev` 起本地 Worker，用 curl 验 `POST /sub` 的校验与存储，用 `wrangler dev --test-scheduled` 触发 Cron。

**真实送达只能由用户在手机上验证。** 开发环境的浏览器无法注册 Service Worker，收不到推送。iPhone 还必须先「加到主屏幕」。这一条在本项目内无法自动化。

## 11. 风险

**最大的风险是推送加密写错而毫无征兆。** 加密失败时推送服务只会返回一个 4xx，没有任何提示说明是密钥协商还是填充出了问题。因此必须有 RFC 测试向量的单元测试，不能只靠「在我手机上试了一下」。

次要风险：KV 是最终一致的，写入后短时间内读可能拿到旧值。去重键因此设为写入即用、不依赖立即可读；同一次 Cron 内用内存 Set 兜底。
