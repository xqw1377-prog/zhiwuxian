# 亲密陪伴 · 家长微信战报

## 数据表（`wuxian_core.db`）

| 表 | 用途 |
|----|------|
| `student_companion_reports` | 每日「三维时间折叠」战报 |
| `parent_cheer_log` | 家长充能点击记录 |
| `student_messages` | 家长鼓励短语（PARENT 发送方） |
| `weekly_recap` | 周复盘聚合（预留） |

启动时 `ensureCompanionSchema` 自动迁移。

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/companion/parent-view/:studentId?token=` | 家长战报卡片 JSON |
| POST | `/api/v1/companion/parent-cheer?token=` | 充能（+Warp、降斜率、SSE 特效） |
| GET | `/api/v1/companion/recap/:studentId?days=30` | 月度复盘聚合 |
| GET | `/api/v1/companion/cheer-stream?studentId=` | 学生端 SSE |
| POST | `/api/v1/companion/daily-report` | 手动写入战报 |
| POST | `/api/v1/companion/synthesize/:studentId` | 从学业进度熔炼今日战报 |

生产环境请配置：

```env
WUXIAN_PARENT_LINK_TOKEN=强随机字符串
```

家长 H5 链接：

```
https://你的域名/#/parent/学生userId?token=同上密钥
```

开发环境未配置 token 时自动放行。

## 学生端

`OmniCockpit` 已挂载 `CheerOverlay`，监听 SSE，满屏荧光绿特效并刷新 Warp 余额。

## 深夜批处理

服务启动后 `scheduleCompanionDailyReports()` 每 6 小时为有梦校航标的用户熔炼战报（`zhi_school_anchor`）。

手动：

```bash
curl -X POST http://localhost:3401/api/v1/companion/synthesize/你的userId
```

## 微信 Gateway

`ZhiCompanionEngine.pushToWeChatGateway` 预留企业微信/模板消息；配置 `WECHAT_COMPANION_WEBHOOK_URL` 后可在该函数内对接。
