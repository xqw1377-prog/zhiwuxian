# WUXIAN API 参考（用户向）

**产品版本 `3.5.0`** · 主能力命名空间 **`/api/v3.5/zhi/*`** · 目标引擎 **`/api/v1/goal/*`**。

说明：v3.5 与多数扩展接口成功响应使用统一 envelope：`{ code: 200, status: "SUCCESS", data: ... }`。v1 目标接口（deconstruct / reroute / task/update）返回 `{ code, status, data }` 桥接结构。失败场景可能返回 `402/403/404/500` 等。

`GET /api/health` 返回 `version`、`api.core`、`api.zhi`、`entry`。

## 1) Auth / Wallet

### POST /api/v1/auth/bootstrap

用途：创建/恢复会话，返回 token 与钱包。

请求体：

- token?: string
- userId?: string
- displayName?: string

响应 data：

- token: string
- userId: string
- displayName: string | null
- wallet: WalletSummary

### GET /api/v1/wallet/:userId

用途：获取钱包摘要。

响应 data（摘要）：

- credits: number
- dailyFreeCredits: number
- tier: "free" | "growth" | "pro"
- availableWarpMinutes: number
- unlimitedUntil: string | null
- wormholeEnabled: boolean

## 2) Quantum

### POST /api/v1/quantum/intent

用途：意图解析，输出结构化 intent。

请求体：

- rawInput: string

响应 data：

- actionType: "ASSIMILATE_VIDEO" | "CORE_REROUTE" | "COMPANION_TALK"
- payload: { targetUrl?: string | null; coreGoal?: string | null; userPainPoint?: string | null; fatigueLevel: number }
- weaverResponse: string

### POST /api/v1/quantum/assimilate

用途：按意图执行折叠/重算，输出下一行动节点与路线。

请求体：

- rawInput: string
- userId: string
- sessionId?: string

常见响应 data：

- sessionId?: string
- companionSpeech?: string
- nextActionNode?: { id: string; title: string; duration: string; minutes?: number }
- roadmapNodes?: Array<{ title: string; phase: string }>
- folded?: boolean

### GET|POST /api/v1/quantum/pulse

用途：心跳更新，返回当前航线状态与下一步建议。

参数：

- userId: string
- sessionId?: string

### POST /api/v1/quantum/complete

用途：完成节点推进。

请求体：

- userId: string
- sessionId: string
- nodeId?: string

### POST /api/v1/quantum/starcard

用途：生成星卡数据（前端展示/后续可渲染海报）。

请求体：

- userId: string
- sessionId?: string

### POST /api/v1/quantum/reverse-plan

用途：路径 A（以终为始）逆向推演，把目标切割为“认知包”，并焊入本地进度账本。

请求体：

- userId: string
- targetDestination: string
- currentStatus: string
- daysToDeadline: number

响应 data：

- success: boolean
- whisper: string
- metrics: { targetDestination, daysLeft, progressPercentage, totalUnits, completedUnits }

### GET /api/v1/quantum/reversing-metrics?userId=...

用途：读取逆向目标矩阵账本（用于冷启动恢复进度条）。

响应 data：

- success: boolean
- metrics: { targetDestination, daysLeft, progressPercentage, totalUnits, completedUnits } | null

### POST /api/v1/quantum/reversing-advance

用途：路径 B 成功后推进路径 A 分子（跨路径联动）。

请求体：

- userId: string
- delta?: number（默认 1）

响应 data：

- success: boolean
- metrics: { targetDestination, daysLeft, progressPercentage, totalUnits, completedUnits } | null

## 3) Goal OS（Dashboard 使用）

### POST /api/v1/goal/deconstruct

用途：目标拆解，返回 sessionId 与今日任务。

请求体：

- goal: string
- totalDays: number
- currentStatus?: string
- isDeadlineFixed?: boolean
- driveSource?: { why?: string; intensity?: number }
- personaType?: string

### POST /api/v1/goal/reroute

用途：重算明日任务与斜率。

请求体：

- sessionId: string
- todayCompleted?: boolean
- userSignal?: string

## 4) ZHI Platform API (v3.5)

主学业能力层。生产环境需 `Authorization: Bearer <token>`（先 `POST /api/v1/auth/bootstrap`）。`userId` 须与会话一致。

### 目录与作战区

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/v3.5/zhi/directories/:userId` | 固定 + 自定义目录，含 goalCount / todayTaskCount / anchorProfile |
| POST | `/api/v3.5/zhi/directories` | 新建自定义目录（body: userId, title） |
| DELETE | `/api/v3.5/zhi/directories/:directoryId?userId=` | 删除自定义目录 |
| GET | `/api/v3.5/zhi/directory-workspace/:userId/:directoryId` | 目录下目标 + 今日任务 |
| POST | `/api/v3.5/zhi/directory-workspace/goal` | 解构目标并绑定目录（body: userId, directoryId, title, days?, templateId?） |

### 梦校、主动导师、日报

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/v3.5/zhi/anchor-brief/:userId` | 梦校倒计时与里程碑摘要 |
| GET / POST | `/api/v3.5/zhi/proactive` | 主动导师 brief（scene 查询参数） |
| GET / POST | `/api/v3.5/zhi/intrusion` | 零入侵打扰策略 |
| GET | `/api/v3.5/zhi/daily-review/:userId` | 每日复盘（?force=1 强制生成） |
| POST | `/api/v3.5/zhi/daily-review/run` | 触发复盘 |
| GET | `/api/v3.5/zhi/progress-dashboard/:userId` | 学习进度大盘（含 momentum 曲线） |
| GET | `/api/v3.5/zhi/evolution-ledger/:userId` | 进化账本 |
| POST | `/api/v3.5/zhi/causal-report` | 因果汇报 |
| POST | `/api/v3.5/zhi/baseline/evidence` | 基线证据入账 |

### 视觉 / 教材

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/v3.5/zhi/vision/analyze` | 试卷/教材图像分析 |
| POST | `/api/v3.5/zhi/vision/resolve-textbook` | 按元数据解析教材 |
| POST | `/api/v3.5/zhi/vision/confirm` | 确认建档并入目录 |
| GET | `/api/v3.5/zhi/vision/textbooks/:userId` | 用户教材列表 |

### 语言陪练

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/v3.5/zhi/language/mission/:userId` | 今日口语战役 |
| POST | `/api/v3.5/zhi/language-eval` | 提交口语/写作评估 |
| POST | `/api/v3.5/zhi/language-shadow` | 影子关挑战 |

### 视频与课件

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/v3.5/zhi/video/context/:userId` | 视频学习上下文 |
| POST | `/api/v3.5/zhi/video/checkpoint/ask` | 卡点提问 |
| POST | `/api/v3.5/zhi/video/checkpoint/eval` | 卡点评估 |
| GET | `/api/v3.5/zhi/courseware/match/:userId` | 按用户缺口匹配课件 |
| GET | `/api/v3.5/zhi/courseware/textbook/:userId/:catalogId` | 教材章节对齐课件 |
| POST | `/api/v3.5/zhi/courseware/ingest` | 课件入库 |
| GET | `/api/v3.5/zhi/courseware/catalog/list` | 课件目录 |
| GET | `/api/v3.5/zhi/courseware/:coursewareId` | 课件详情 |
| GET | `/api/v3.5/zhi/courseware/admin/list` | 审核列表 |
| POST | `/api/v3.5/zhi/courseware/admin/review` | 审核操作（promote_a / promote_s / demote_b / archive） |

### 模考与学习评估

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/v3.5/zhi/mock-reckon` | 托福/雅思模考清算 |
| POST | `/api/v3.5/zhi/mock-shadow-complete` | 模考影子关完成 |
| GET | `/api/v3.5/zhi/assessment/hub/:userId` | 评估 hub |
| POST | `/api/v3.5/zhi/assessment/paper/generate` | 出卷（subjectId / daily） |
| GET | `/api/v3.5/zhi/assessment/paper/:paperId` | 试卷详情 |
| POST | `/api/v3.5/zhi/assessment/submit` | 交卷评分 |

### 拓扑 / 影子 / Token

| 方法 | 路径 | 用途 |
|------|------|------|
| POST | `/api/v3.5/zhi/topology` | 认知拓扑折叠 |
| POST | `/api/v3.5/zhi/shadow-spar` | 影子肉搏 |
| POST | `/api/v3.5/zhi/shadow-verify` | 推导验证 |
| POST | `/api/v3.5/zhi/ghost-blind` | 盲投截屏 |
| GET | `/api/v3.5/zhi/token-ledger/:userId` | Token 账本 |
| POST | `/api/v3.5/zhi/token-inject` | 能量包注入 |

### 云端与计费（v3.5）

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/api/v3.5/cloud/state/:userId` | 云端状态 |
| POST | `/api/v3.5/cloud/directories/generate` | AI 生成目录 |
| POST | `/api/v3.5/cloud/artifacts/push` | 推送制品 |
| GET | `/api/v3.5/billing/status/:userId` | Warp 余额与套餐 |
| POST | `/api/v3.5/billing/topup` | 充值 |
| POST | `/api/v3.5/billing/escape-penalty` | 逃避惩罚扣费 |
| GET / POST | `/api/v3.5/mentor/intervene` | 导师介入（与 zhi/proactive 互补） |

## 5) Video / Course

### GET /api/v1/video/pipeline/status

用途：视频管道依赖状态（yt-dlp）。

### POST /api/v1/video/assimilate

用途：视频同化（扣减 Warp Power），写入课程图谱并返回 courseId。

请求体（常用）：

- userId: string
- videoUrl?: string
- simulate?: boolean
- autoReserve?: boolean

### GET /api/v1/video/reserve

用途：获取预留视频列表。

### POST /api/v1/video/resolve-clip

用途：指针路由与虫洞跃迁。

请求体两种模式：

- 指针模式：{ userId, courseId, currentTimestamp, telemetryData }
- 旧模式：{ userId, topic, minWormholeValue }

响应 data：

- event: "WORMHOLE_ACTIVATED" | "CONTINUE_PLAYBACK" | "LEGACY_CLIP"
- redirectToSeconds?: number
- currentNode?: KnowledgeNode
- meta: object

### GET /api/v1/course/:courseId/graph

用途：课程图谱查询（当前 active version）。

响应 data：

- course: Course
- nodes: KnowledgeNode[]
- waterline: Waterline[]

## 6) Telemetry / Reports

### POST /api/v1/telemetry/ingest

用途：行为遥测事件写入。

请求体：

- userId: string
- sessionId?: string
- events: Array<{ ts: string; type: string; payload?: unknown }>

### GET /api/v1/telemetry/:userId/aggregate?windowDays=30

用途：聚合 metrics + evidence。

### GET /api/v1/report/radar/:userId

用途：雷达卡报告（数据）。

### GET /api/v1/report/radar/:userId/poster.svg

用途：雷达海报（SVG）。

### POST /api/v1/report/generate

用途：生成认知报告预览（默认 locked）。

请求体：

- userId: string
- goalId?: string
- courseId?: string

### POST /api/v1/report/cognitive/:reportId/unlock

用途：创建解锁订单或使用订单完成解锁。

请求体：

- userId: string
- orderId?: string

### GET /api/v1/report/cognitive/:reportId

用途：查询报告详情（含 shareUrl、shareToken、解锁态）。

查询参数：

- userId?: string（传则做归属校验）

### GET /api/v1/report/cognitive/:reportId/poster.svg?token=...

用途：证书 SVG（必须 token 校验且已解锁）。

## 7) Payment / Billing / Subscription

### GET /api/v1/payment/catalog

用途：商品目录与支付模式。

### POST /api/v1/payment/create

用途：创建订单。

请求体：

- userId: string
- productId?: string
- packId?: string
- metadata?: object

### POST /api/v1/payment/confirm

用途：simulate 模式确认支付并入账。

请求体：

- orderId: string
- paymentRef?: string

### POST /api/v1/payment/webhook/:provider

用途：真实支付回调（stripe/wechat/simulate）。

### GET /api/v1/payment/orders/:userId

用途：订单列表。

### Billing 兼容别名

- GET /api/v1/billing/wallet-status?userId=...
- POST /api/v1/billing/create-order
- POST /api/v1/billing/webhook

### Subscription

- GET /api/subscription/plans
- GET /api/subscription/:userId
- POST /api/subscription/:userId/upgrade
- POST /api/subscription/:userId/downgrade
