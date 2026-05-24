# 新机器部署指南（与 GitHub 保持一致）

目标：在**另一台电脑**上得到与仓库 `main` 分支**相同版本**的可运行环境。

仓库：`https://github.com/xqw1377-prog/zhiwuxian.git`  
当前发版提交（部署时以 `git rev-parse HEAD` 为准）：见 `package.json` 的 `version`（3.5.0）。

---

## 1. 环境要求

| 项 | 要求 |
|----|------|
| Node.js | **20.x 或 22.x**（推荐 22 LTS） |
| npm | 10+（随 Node 自带即可） |
| Git | 用于克隆固定提交 |
| 可选 | yt-dlp（视频管道）、Python 3（openclaw 脚本） |
| 端口 | **3401**（后端 + 生产同源前端） |
| 开发前端 | **5173**（仅 `npm run dev:web` 时） |

Windows / macOS / Linux 均可；生产建议 Linux 或 Docker。

---

## 2. 克隆与锁定版本（必做）

```bash
git clone https://github.com/xqw1377-prog/zhiwuxian.git
cd zhiwuxian

# 与 GitHub main 完全一致（不要用未推送的本地分支）
git fetch origin
git checkout main
git pull origin main

# 记录部署版本，便于两台机器对照
git rev-parse HEAD
git log -1 --oneline
```

两台机器应显示**相同的 commit SHA**。若不一致，先 `git pull` 再部署。

---

## 3. 安装依赖（必须用 lockfile）

```bash
# 根目录 — 与 package-lock.json 严格一致
npm ci

# Web 子项目
npm ci --prefix web
```

不要使用 `npm install` 替代 `npm ci`（除非 lock 文件已更新并提交）。

---

## 4. 环境变量

```bash
# Windows PowerShell
Copy-Item .env.example .env

# macOS / Linux
cp .env.example .env
```

编辑根目录 `.env`，至少配置：

| 变量 | 说明 |
|------|------|
| `DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY` | LLM（二选一） |
| `QWEN_API_KEY` | 视觉多模态（建议） |
| `DB_ENCRYPTION_KEY` | ≥32 字符随机串；**两台机器若共用数据库备份，必须相同** |
| `WUXIAN_DEEPSEEK_MODEL` | 建议 `deepseek-chat` |
| `WUXIAN_QWEN_VISION_MODEL` | 建议 `qwen-vl-max` |

生产环境另见 [commercial-launch.md](./commercial-launch.md)（`NODE_ENV=production`、`WUXIAN_AUTH_RELAXED` 不得为 1 等）。

平板 / 独立前端构建：复制 `web/.env.production.local.example` → `web/.env.production.local`，设置 `VITE_API_BASE`。

---

## 5. 构建与启动

### 方式 A：开发 / 内测（最快）

```bash
npm run build:web    # 生成 web/dist，供 3401 同源托管
npm run server       # http://localhost:3401
```

另开终端（可选，热更新前端）：

```bash
npm run dev:web      # http://localhost:5173 → 代理 API 3401
```

### 方式 B：生产单进程

```bash
npm run build:web
npm run build:server
set NODE_ENV=production   # Linux/macOS: export NODE_ENV=production
node dist/server/index.js
```

### 方式 C：Docker

```bash
cp .env.example .env
# 编辑 .env 后
docker compose up -d --build
```

数据目录映射为 `./production_data`（见 `docker-compose.yml`），与本地 `data/` 不同，迁移时注意路径。

---

## 6. 数据是否一致？

| 场景 | 做法 |
|------|------|
| **新环境试跑** | 不拷贝 `data/`，首次启动自动建库（空库） |
| **与现网相同用户/订单** | 停服后拷贝 `data/wuxian_learning.db`、`data/wuxian_core.db`（及 `-wal`/`-shm` 需一并处理或先 checkpoint） |
| **加密密钥** | 共用备份时，`DB_ENCRYPTION_KEY` 必须与源机器一致 |

数据库**不在 Git 中**，不会随 `git pull` 同步。

---

## 7. 验收（与主机构建门禁对齐）

服务已起（`npm run server`）后：

```bash
npm run deploy:check     # 版本 + 可选 health
npm run verify           # typecheck + lint + test + build:web（耗时）
npm run e2e:p0           # API 冒烟（需 3401）
```

预发全量：

```bash
npm run e2e:staging      # p0 + domestic + k12 + auth-prod + user-journey
```

通过即表示与仓库定义的行为一致。

---

## 8. 两台机器快速对照清单

- [ ] `git rev-parse HEAD` 相同  
- [ ] `node -v` 均为 20+ / 22+  
- [ ] 均使用 `npm ci` + `npm ci --prefix web`  
- [ ] `.env` 中模型名、Key 策略一致（Key 可不同机器各配）  
- [ ] 若共用库：`DB_ENCRYPTION_KEY` 相同 + 已拷贝 `data/*.db`  
- [ ] `GET http://localhost:3401/api/health` → `version: "3.5.0"`  
- [ ] `npm run e2e:p0` 通过  

---

## 9. 常见问题

**Q：另一台机器页面空白？**  
先 `npm run build:web`，再访问 `http://localhost:3401/`（不要只起 Vite 而没起后端）。

**Q：LLM 全走模板、不扣费？**  
检查 `.env` 中 `DEEPSEEK_API_KEY` / `QWEN_API_KEY`；运行 `npx tsx scripts/test-llm-keys.ts`。

**Q：与 GitHub 代码不一致？**  
执行 `git status` 应为 clean；若有本地修改，另一台不会自动拥有，需 commit + push + 对端 pull。
