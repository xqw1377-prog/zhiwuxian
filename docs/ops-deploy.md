# WUXIAN 部署与运维

## 1) 本地运行

### 前置

- Node.js（项目使用 TypeScript + tsx）
- 可选：yt-dlp（用于更强的视频管道能力）

### 启动

- 启动服务：`npm run server`
- 类型检查：`npm run typecheck`

默认端口：3401

可用入口：

- Cockpit：`http://localhost:3401/`
- Dashboard：`http://localhost:3401/wuxian`

## 2) 环境变量（常用）

- WUXIAN_INTERNAL
  - 默认非 1 即 ToC 模式（屏蔽内部页面/前缀）
- WUXIAN_PAYMENT_MODE
  - 默认 simulate；设为 live 则走 webhook 真实验签路径
- WUXIAN_PAYMENT_WEBHOOK_SECRET
  - live 模式 webhook 验签密钥
- DEEPSEEK_API_KEY
  - 可选：语义能力增强（未配置会 fallback 到启发式）
- DEEPSEEK_BASE_URL
  - 默认 https://api.deepseek.com/v1
- WUXIAN_DEEPSEEK_MODEL
  - 默认 deepseek-v4pro

- QWEN_API_KEY
  - 多模态读图（DashScope OpenAI 兼容模式）

- WUXIAN_QWEN_VISION_MODEL
  - 默认 qianwen3.6plus

## 3) 数据与备份

SQLite 数据默认写入 `data/` 目录（learning.db 与 core.db）。

建议：

- 备份：按文件级备份 data/*.db（服务停止或确保 WAL 同步后）
- 监控：关注 payment_orders、user_wallet、cognitive_reports 增长与一致性

## 4) Docker（仓库已包含）

仓库包含 Dockerfile 与 docker-compose.yml，可作为部署起点。

建议部署策略：

- 单实例：适合本地/个人私有部署
- 多实例：需要将 SQLite 替换为共享存储或升级为服务化数据库

## 5) 商用发版

完整清单见 [commercial-launch.md](./commercial-launch.md)。最小命令：

```bash
npm run verify
npm run e2e:p0 && npm run e2e:domestic-loop && npm run e2e:k12-loop
```

## 6) 运维检查清单

- /api/health 返回 ok
- /api/v1/payment/catalog 可访问
- /api/v1/wallet/:userId 能正常返回与重置
- 报告解锁链路可跑通（create → confirm/webhook → poster token）
