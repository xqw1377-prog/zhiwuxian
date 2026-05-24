# WUXIAN 商用上线清单

面向 **公网收费运营** 的发布门禁；内测可只完成「必做」子集。

## 1. 代码门禁（每次发版）

在仓库根目录：

```bash
npm run verify          # typecheck + test + build:web
```

CI：推送 `main`/`master` 触发 `.github/workflows/ci.yml`（同上三项）。

## 2. 预发环境（Staging）E2E

后端已起（`npm run server`，`NODE_ENV=production` 建议用独立 `.env`）：

```bash
npm run e2e:p0
npm run e2e:domestic-loop
npm run e2e:k12-loop
npm run e2e:auth-prod      # 生产鉴权收紧抽检
npm run e2e:user-journey   # 注册(设备)→登录→购买 Warp/Credits
```

全部通过后再切流量。

## 3. 生产环境变量（必做）

| 变量 | 商用要求 |
|------|----------|
| `NODE_ENV` | `production` |
| `DB_ENCRYPTION_KEY` | 必须为强随机（用于端侧密钥加密落库） |
| `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY` | 可选：作为平台托管 Key；也可改为用户在 UI 内写入私钥（不走 env） |
| `QWEN_API_KEY` | 可选：作为平台托管视觉 Key；也可改为用户在 UI 内写入私钥（不走 env） |
| `WUXIAN_AUTH_RELAXED` | **不得** 为 `1` |
| `WUXIAN_PAYMENT_MODE` | 收款用 `live`；内测可 `simulate` |
| `WUXIAN_PAYMENT_WEBHOOK_SECRET` | `live` 时必须强随机，非 `dev-local-secret` |
| `WUXIAN_CORS_ORIGIN` | 前端正式域名（逗号分隔可多域） |
| `WUXIAN_DEEPSEEK_MODEL` | 建议与当前部署可用模型一致（默认 `deepseek-v4pro`） |
| `WUXIAN_QWEN_VISION_MODEL` | 建议与当前部署可用模型一致（默认 `qianwen3.6plus`） |

启动时 `NODE_ENV=production` 会执行 **Readiness 校验**（缺 Key / 错误支付配置将拒绝启动）。

自测 Readiness（不启动服务）：

```bash
npx vitest run test/production-readiness.test.ts
```

## 4. 部署步骤

```bash
npm ci
npm run build:web
# 配置 .env 后
npm run start:prod
# 或 Docker
docker compose up -d --build
```

健康检查：`GET /api/health` → `version: "3.5.0"`，`paymentMode` 与预期一致。

## 5. 数据与运维

- SQLite 位于 `WUXIAN_DATA_DIR`（默认 `./data`）
- **每日备份** `wuxian_learning.db`、`wuxian_core.db`（停服或 WAL checkpoint 后拷贝）
- 换梦校/升学路径：用户需 **重新唤醒 ZHI**，或 `npm run migrate:pathway -- --userId=...`

## 6. 商用能力状态

| 能力 | 商用状态 |
|------|----------|
| 梦校航标（美本/国内/k12） | 已支持 |
| 会话鉴权 v3.5 | 已支持 |
| Warp 计费 + LLM 网关 | 已支持 |
| 支付 live + webhook | Stripe/微信H5 URL + webhook 验签；`npm run reconcile:payments` 对账 |
| 家长微信战报 | H5 + SSE 充能 + Webhook 推送 + 班级花名册 API |
| 运维脚本 | `ops:backup` / `ops:health` / `docs/ops-production.md` |
| 梦校云 S3 | 可选；未配 S3 时为 LOCAL 规划模式 |
| 多实例水平扩展 | **未支持**（SQLite 单实例）；商用大规模需换库方案 |
| Android / iOS 平板 App | Capacitor 工程见 [mobile-tablet.md](./mobile-tablet.md) |
| 隐私/协议 URL | 部署后 `GET /privacy`、`/terms` → `/#/privacy`、`/#/terms`；见 [store-release.md](./store-release.md) |

## 7. 发版后 24h 观察

- [ ] `/api/health` 稳定
- [ ] 支付订单 `payment_orders` 与钱包余额一致
- [ ] 无大量 401（鉴权配置错误）
- [ ] LLM 5xx / 超时率可接受
- [ ] 用户反馈侧栏混轨 → 引导重新唤醒或 `migrate:pathway`
