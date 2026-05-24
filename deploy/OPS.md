# WUXIAN ZHI Cockpit · 运维手册

## 目录

1. [架构概览](#1-架构概览)
2. [首次部署](#2-首次部署)
3. [日常运维](#3-日常运维)
4. [备份与恢复](#4-备份与恢复)
5. [监控与告警](#5-监控与告警)
6. [故障排查](#6-故障排查)
7. [安全加固](#7-安全加固)
8. [Stripe 支付配置](#8-stripe-支付配置)
9. [性能调优](#9-性能调优)
10. [升级指南](#10-升级指南)

---

## 1. 架构概览

```
                     ┌─────────────┐
                     │   Certbot   │ (SSL 自动续签, 可选)
                     └──────┬──────┘
                            │
                 ┌──────────▼──────────┐
                 │       Nginx         │ ← 端口 80/443
                 │  (反向代理 + SSL)    │
                 └──────────┬──────────┘
                            │
              ┌─────────────▼─────────────┐
              │     wuxian-core (Node)    │ ← 端口 3401
              │  Express + LLM + Stripe   │
              └──┬──────────┬──────────┬──┘
                 │          │          │
        ┌────────▼──┐ ┌────▼────┐ ┌───▼────┐
        │  SQLite   │ │  Redis  │ │  OTel  │
        │ (data/)   │ │ (可选)  │ │ (可选) │
        └───────────┘ └─────────┘ └────────┘
```

### 组件说明

| 组件 | 说明 | 是否必需 |
|------|------|----------|
| Nginx | 反向代理、SSL 终止、静态资源服务、gzip | 是 |
| wuxian-core | Node.js Express 后端服务 | 是 |
| SQLite | 默认数据库，数据持久化在 volume | 是 |
| Redis | 速率限制存储，缺省自动降级内存模式 | 否 |
| OpenTelemetry | 链路追踪导出，缺省不导出 | 否 |
| Certbot | Let's Encrypt SSL 证书自动管理 | 按需 |

---

## 2. 首次部署

### 2.1 前置要求

- Docker ≥ 24.0 + Docker Compose plugin
- Node.js ≥ 20（仅首次构建前端需要）
- 域名（必填，用于 SSL 证书）

### 2.2 部署步骤

```bash
# 1. 克隆代码
git clone <repo-url> wuxian
cd wuxian

# 2. 配置环境变量
cp .env.production .env
# 编辑 .env 填入所有必填项（DEEPSEEK_API_KEY, STRIPE_SECRET_KEY, DB_ENCRYPTION_KEY 等）

# 3. 构建前端（宿主机执行，Docker 内不包含 Node 编译工具链）
npm run build:web

# 4. 启动服务
chmod +x deploy/deploy.sh
./deploy/deploy.sh
# 如需 SSL: ./deploy/deploy.sh --ssl

# 5. 验证部署
curl https://your-domain.com/api/health
# 预期返回: {"status":"ok","product":"WUXIAN ZHI Cockpit",...}
```

### 2.3 SSL 证书（首次）

首次使用 `--ssl` 模式前，需要先手动获取证书：

```bash
# 临时启动 nginx 用于域名验证
docker compose -f deploy/docker-compose.prod.yml up -d nginx

# 手动获取证书
docker compose -f deploy/docker-compose.prod.yml run --rm certbot certonly --webroot \
  -w /var/www/certbot -d your-domain.com

# 重启使用 SSL
./deploy/deploy.sh --ssl
```

---

## 3. 日常运维

### 3.1 服务管理

```bash
# 查看状态
docker compose -f deploy/docker-compose.prod.yml ps

# 查看日志
docker compose -f deploy/docker-compose.prod.yml logs -f
docker compose -f deploy/docker-compose.prod.yml logs -f wuxian-core

# 重启单个服务
docker compose -f deploy/docker-compose.prod.yml restart wuxian-core

# 停止
docker compose -f deploy/docker-compose.prod.yml down

# 重建（代码更新后）
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

### 3.2 健康检查

```
GET /api/health
```

返回示例：
```json
{
  "status": "ok",
  "product": "WUXIAN ZHI Cockpit",
  "version": "3.5.0",
  "api": { "core": "v3.5", "zhi": "v3.5" },
  "storage": ["wuxian_core.db", "wuxian_learning.db"]
}
```

可接入外部监控（如 UptimeRobot、Better Uptime）定期检查该端点。

### 3.3 OpenTelemetry 监控

如果配置了 `OTEL_EXPORTER_OTLP_ENDPOINT`，服务会自动导出：
- **链路追踪**: 所有 HTTP 请求、LLM 调用、数据库操作
- **指标**: LLM token 消耗、API 请求速率、错误率
- **日志关联**: trace ID 会注入响应头

推荐搭配：Grafana Tempo（追踪）+ Prometheus（指标）+ Loki（日志）

---

## 4. 备份与恢复

### 4.1 备份数据

```bash
# SQLite 数据库
docker compose -f deploy/docker-compose.prod.yml exec wuxian-core tar czf /tmp/backup-$(date +%Y%m%d).tar.gz /app/data

# 复制到宿主机
docker compose -f deploy/docker-compose.prod.yml cp wuxian-core:/tmp/backup-20260522.tar.gz ./backups/
```

### 4.2 自动备份（crontab）

```bash
# 每天凌晨 3 点备份，保留最近 30 天
0 3 * * * cd /opt/wuxian && docker compose -f deploy/docker-compose.prod.yml exec -T wuxian-core tar czf /tmp/backup-$(date +\%Y\%m\%d).tar.gz /app/data && docker compose -f deploy/docker-compose.prod.yml cp wuxian-core:/tmp/backup-$(date +\%Y\%m\%d).tar.gz ./backups/ && find ./backups -name "*.tar.gz" -mtime +30 -delete
```

### 4.3 恢复数据

```bash
# 停止服务
docker compose -f deploy/docker-compose.prod.yml down

# 恢复数据目录
docker run --rm -v wuxian_wuxian-data:/data -v $(pwd)/backups:/backups alpine tar xzf /backups/backup-20260522.tar.gz -C /data

# 重启
docker compose -f deploy/docker-compose.prod.yml up -d
```

---

## 5. 监控与告警

### 5.1 内置指标

| 指标 | 端点 | 频率 |
|------|------|------|
| 健康检查 | `GET /api/health` | 30s |
| LLM 用量 | `GET /api/v1/billing/:userId` | 按需 |
| 遥测事件 | POST `/api/v1/telemetry/ingest` | 实时 |

### 5.2 推荐第三方服务

- **错误追踪**: Sentry（`@sentry/node`）
- **性能监控**: Grafana + Prometheus + Tempo
- **可用性监控**: UptimeRobot（免费版每 5 分钟）
- **日志管理**: ELK Stack 或 Grafana Loki

---

## 6. 故障排查

### 6.1 服务无法启动

```bash
# 检查日志
docker compose -f deploy/docker-compose.prod.yml logs wuxian-core

# 验证 .env 文件
grep -v "^#" .env | grep -v "^$" | head -20

# 检查端口冲突
netstat -tlnp | grep -E ':80|:443|:3401'
```

### 6.2 数据库故障

```bash
# 检查数据库文件
docker compose -f deploy/docker-compose.prod.yml exec wuxian-core ls -la /app/data/

# 数据库完整性检查
docker compose -f deploy/docker-compose.prod.yml exec wuxian-core node -e "
  const Database = require('better-sqlite3');
  const db = new Database('/app/data/wuxian_core.db');
  console.log(db.pragma('integrity_check'));
  db.close();
"
```

### 6.3 Stripe 支付问题

1. 验证 `STRIPE_SECRET_KEY` 和 `STRIPE_WEBHOOK_SECRET` 正确
2. 在 Stripe Dashboard 注册 webhook 端点：`https://your-domain.com/api/v1/payment/stripe-webhook`
3. 选择事件：`checkout.session.completed`、`invoice.paid`
4. 验证 webhook 签名：确保 `STRIPE_WEBHOOK_SECRET` 与 Dashboard 中一致
5. 测试模式：将 `WUXIAN_PAYMENT_MODE` 设为 `simulate` 可跳过 Stripe 验证

### 6.4 LLM API 故障

```bash
# 测试 API Key
npx tsx scripts/test-llm-keys.ts

# 检查余额
curl -H "Authorization: Bearer $DEEPSEEK_API_KEY" https://api.deepseek.com/user/balance
```

### 6.5 内存不足

如果容器频繁 OOM：
1. 在 `docker-compose.prod.yml` 中添加内存限制：
   ```yaml
   wuxian-core:
     deploy:
       resources:
         limits:
           memory: 512M
   ```
2. 启用 Redis 减少内存数据库压力
3. 调低 `WUXIAN_RATE_ASSIMILATE_PER_MIN` 限制并发

---

## 7. 安全加固

### 7.1 生产环境检查清单

- [ ] 所有 API Key 已轮换为生产密钥（非开发测试 Key）
- [ ] `DB_ENCRYPTION_KEY` 设置为 32 字符以上随机字符串
- [ ] SSL 证书已配置且自动续签
- [ ] Nginx 安全头已启用（X-Frame-Options, HSTS 等）
- [ ] `.env` 文件权限设置为 600（`chmod 600 .env`）
- [ ] Docker 服务以非 root 用户运行（默认已配置）
- [ ] Stripe Webhook 签名验证已启用
- [ ] Redis 设置密码认证
- [ ] 定期更新 Docker 镜像和依赖

### 7.2 网络策略

- 只暴露端口 80/443
- 数据库端口（SQLite 无网络端口，Redis 仅内网）
- 建议部署在 VPC/私有网络内

### 7.3 审计日志

```bash
# Nginx 访问日志位于容器内
docker compose -f deploy/docker-compose.prod.yml exec nginx tail -f /var/log/nginx/wuxian-access.log
```

---

## 8. Stripe 支付配置

### 8.1 创建 Stripe 产品与价格

1. 登录 [Stripe Dashboard](https://dashboard.stripe.com)
2. Products → Add Product → 填写名称/描述/价格
3. 复制 Price ID（格式: `price_xxx`）到 `.env` 的 `STRIPE_PRICE_ID`
4. 切换至生产模式：`WUXIAN_PAYMENT_MODE=stripe`

### 8.2 配置 Webhook

```bash
# Stripe CLI 本地测试
stripe listen --forward-to localhost:3401/api/v1/payment/stripe-webhook
stripe trigger checkout.session.completed
```

生产环境在 Dashboard 中配置：
- **Endpoint URL**: `https://your-domain.com/api/v1/payment/stripe-webhook`
- **监听事件**: `checkout.session.completed`、`invoice.paid`、`customer.subscription.updated`
- **Signing secret**: 复制到 `.env` 的 `STRIPE_WEBHOOK_SECRET`

### 8.3 验证支付流程

```bash
# 创建 checkout session
curl -X POST https://your-domain.com/api/v1/payment/stripe/create-checkout \
  -H "Content-Type: application/json" \
  -d '{"productId": "price_xxx", "userId": "test-user-001"}'
# 返回 { sessionId, url }，跳转到 url 完成支付
```

---

## 9. 性能调优

### 9.1 数据库优化

- SQLite 默认使用 WAL 模式（已在代码中启用）
- 定期执行 `PRAGMA optimize`
- 大数据量时考虑迁移 PostgreSQL（设置 `DATABASE_URL` 环境变量）

### 9.2 缓存策略

- Nginx 静态资源缓存 365 天（带 hash 的文件名）
- API 响应可在 Nginx 层配置 `proxy_cache`
- 考虑引入 Redis 缓存热点数据

### 9.3 并发优化

| 场景 | 建议 |
|------|------|
| 单实例 < 100 并发 | SQLite 足够 |
| 100-1000 并发 | 启用 Redis + PostgreSQL |
| > 1000 并发 | 水平扩展 + 负载均衡 + 读写分离 |

---

## 10. 升级指南

### 10.1 常规升级

```bash
# 1. 备份数据
./deploy/deploy.sh --down
docker run --rm -v wuxian_wuxian-data:/data alpine tar czf /tmp/pre-upgrade-backup.tar.gz -C /data .

# 2. 拉取新版本
git pull

# 3. 重建前端
npm run build:web

# 4. 重建并启动
docker compose -f deploy/docker-compose.prod.yml up -d --build

# 5. 验证
curl https://your-domain.com/api/health
```

### 10.2 数据库迁移

如果新版本包含数据库 schema 变更：

```bash
# SQLite: 手动备份后应用迁移
docker compose -f deploy/docker-compose.prod.yml exec wuxian-core cp /app/data/wuxian_core.db /app/data/wuxian_core.db.bak

# 执行迁移脚本
docker compose -f deploy/docker-compose.prod.yml exec wuxian-core npx tsx scripts/migrate-pathway.ts
```

### 10.3 回滚

```bash
# 回滚到上一个版本
git checkout <previous-tag>

# 重建并恢复数据
npm run build:web
docker compose -f deploy/docker-compose.prod.yml up -d --build

# 如有需要恢复数据库
# docker run --rm -v wuxian_wuxian-data:/data -v $(pwd)/backups:/backups alpine tar xzf /backups/pre-upgrade-backup.tar.gz -C /data
```
