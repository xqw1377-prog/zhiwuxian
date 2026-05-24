# WUXIAN ZHI Cockpit · 3.5.0

双轴逆向拆解与动态重算核心引擎 + ZHI 学业能力层。

**当前产品版本：`3.5.0`**（与 `/api/v3.5/zhi/*` 命名空间一致；目标引擎仍为 `/api/v1/goal/*`）。

架构说明见 [ARCHITECTURE.md](./ARCHITECTURE.md)。API 参考见 [docs/api.md](./docs/api.md)。

## 快速启动

```bash
npm ci
npm run build:web
npm run server        # 后端 API → http://localhost:3401
npm run dev           # 同上（tsx watch 模式）
```

**另一台电脑部署**（与 GitHub 版本一致）：见 [docs/deploy-new-machine.md](docs/deploy-new-machine.md)，发版后运行 `npm run deploy:check`。

## Web 前端（独立开发）

```bash
npm run dev:web       # Vite dev → http://localhost:5173（API 代理到 3401）
npm run build:web     # 构建到 web/dist/
```

生产/同源部署时，需先 `npm run build:web`，再由 Express 在 `3401` 托管 `web/dist`。

## 平板 / Android / iOS（Capacitor）

主场景为平板；`<1024px` 自动切换底栏（目录 | ZHI | 成长）。完整打包与上架步骤见 **[docs/mobile-tablet.md](./docs/mobile-tablet.md)**。

```bash
# 配置 web/.env.production.local（模板见 web/.env.production.local.example）
#   VITE_API_BASE=https://你的API
#   VITE_LEGAL_OPERATOR / VITE_LEGAL_EMAIL（商店合规）
npm run mobile:android    # 需 Android Studio · 含拍试卷/相册
npm run mobile:ios        # 需 macOS + Xcode

# 应用图标：web/resources/icon.png (1024²) 后
cd web && npm run assets:icons && npx cap sync

# 隐私政策 / 用户协议（商店 URL）
# https://你的域名/#/privacy  ·  https://你的域名/#/terms

# Android 上架包
npm run android:release
```

商店清单见 [docs/store-release.md](docs/store-release.md)。

## 家长微信 · 亲密陪伴战报

三维时间折叠每日战报 + 家长充能（+5 Warp + 学生端满屏特效）。详见 [docs/companion-wechat.md](docs/companion-wechat.md)。

```text
家长 H5：/#/parent/学生userId?token=家长链接密钥
API：GET /api/v1/companion/parent-view/:studentId
     POST /api/v1/companion/parent-cheer
```

## 商用运维

```bash
npm run reconcile:payments   # 订单 vs Warp 对账
npm run e2e:tablet-loop      # 平板+家长+支付冒烟
npm run ops:backup           # SQLite 备份（Windows）
npm run ops:health           # 健康巡检
```

见 [docs/ops-production.md](docs/ops-production.md)、[docs/roadmap-90d.md](docs/roadmap-90d.md)。

## Electron 桌面端

```bash
npm run desktop       # Electron + Vite dev 前端
npm run desktop:install
```

## 统一端口

所有环境默认端口统一为 **3401**：

| 组件 | URL |
|------|-----|
| Backend API | `http://localhost:3401/` |
| Frontend Shell | `http://localhost:3401/`（需已 build:web） |
| Vite Dev | `http://localhost:5173`（代理 API 到 3401） |
| Electron API_BASE | `http://127.0.0.1:3401` |
| Docker | `3401:3401` |

配置方式：`src/.env` 中设置 `PORT=3401`，Electron 通过 `WUXIAN_API_BASE` 环境变量覆盖。

## 产品入口

| 入口 | 路由 | 说明 |
|------|------|------|
| OmniCockpit | `/` | React 主驾驶舱（**唯一 Web 主入口**） |
| Desktop Panel | `/#desktop-panel` | Electron 拦截浮窗 |
| Ghost Capture | `/#ghost-capture` | 截屏盲投浮窗 |
| 旧版静态页 | `/app`, `/wuxian`, `/dashboard`, … | **302 → `/`**（已 build 主壳时） |

健康检查：`GET /api/health` 返回 `version: "3.5.0"` 与 `api: { core: "v1", zhi: "v3.5" }`。

## Architecture

```
web/src/OmniCockpit.tsx       — React 驾驶舱（3.5 主壳）
server/express-app.ts         — Express 静态托管 + v1 核心 + /api/health
server/wuxian-core-api.ts     — 目标重路由核心（wuxian_core.db）
server/wuxian-v35-routes.ts   — ZHI 学业/语言/模考/目录（v3.5）
electron/main.ts              — Electron 唤醒/拦截
```

## Legacy 调试（可选）

旧版静态 HTML 位于 `legacy/static/`。启用：

```bash
set WUXIAN_LEGACY_STATIC=1
npm run server
# 访问 http://localhost:3401/legacy/wuxian-dashboard.html
```

归档 React 见 `web/src/_legacy/`（不参与 `tsc` 构建）。

## 跨组件事件协议

主路径请使用 `web/src/lib/wuxian-events.ts`（`WUXIAN_EVENTS`、`emitDirectoryWorkspaceRefresh`、`openToolViaEvent`）。底层仍为 `CustomEvent`。

| 事件 | dispatch 方 | 监听方 | 行为 |
|------|------------|--------|------|
| `wuxian:hide-overlays` | Electron `ensureMentorHome()` | `ZhiCloudConsole`, `DeepSeekLockBox`, `CertificationDrawer` | 收起控制台 / 释放锁定 / 关闭认证抽屉 |
| `wuxian:enter-cockpit` | Electron `ensureMentorHome()` | `OmniCockpit` | 聚焦驾驶舱 |
| `wuxian:directories-refresh` | `ZhiDirectoryProvider` 内部 | `ZhiSidebarMatrix` | 刷新目录列表 |

> 新增叠加层组件时，必须注册 `wuxian:hide-overlays` 监听器以确保桌面唤醒后正确关闭。

## 商用上线

发版门禁与生产环境变量见 **[docs/commercial-launch.md](./docs/commercial-launch.md)**。

```bash
npm run verify                # typecheck + 单元测试 + build:web（CI 同款）
npm run server                # 预发/生产前再跑 E2E（需服务已起）
npm run e2e:p0
npm run e2e:domestic-loop
npm run e2e:k12-loop
npm run e2e:user-journey    # 设备注册→会话→购买 Warp/Credits
```

生产启动（`NODE_ENV=production`）会自动做 Readiness 校验（LLM Key、禁止 AUTH_RELAXED、live 支付 webhook 等）。

## E2E 测试

```bash
npm run e2e:p0                # P0 冒烟（需 bootstrap token；含 v1 goal 写接口）
npm run e2e:toefl-loop        # 托福 90 天闭环（解构→任务→评估→目录计数）
npm run e2e:domestic-loop     # 清华/国内路径（梦校唤醒→PINNED→指标→主动简报）
npm run e2e:k12-loop          # 校内成长：清华→小学切换无混轨
npm run e2e:wave1             # Wave1 链路
```

## 切换梦校 / 升学路径（操作清单）

改梦校、现就读学校或所在地后，建议按顺序执行，避免侧栏仍显示旧的 AP/托福 PINNED：

1. **重启后端**：`npm run server`（`.env` 或库结构变更后必做）
2. **打开梦校航标**：填齐梦校、专业、年级、入学时间、**现就读学校**、**所在地**、**梦校所在地**
3. **点击「唤醒 ZHI」**：会重算 `school_matrix`、PINNED 目录与硬指标（按 `domestic_cn` / `us_intl` 自动分支）
4. **刷新页面或重新进入驾驶舱**：触发主动简报（`session_open`）与目录 `listUserDirectories` 对齐
5. 若仍有历史托福目录：可对用户执行目录 reconcile，或清空该用户的 `zhi_cognitive_directory` 后重新唤醒

国内梦校（如清华）应对齐：**高考/数学/物理/信息学** PINNED，倒计时硬指标不含托福/SAT。美本梦校（如 CMU）则保留标化轨。

**小学生 / 暂无大学目标（校内成长）**：在梦校航标选 **「还没想好大学 · 校内成长」**，再选 **全班/全校第一** 或 **单科提分 + 主攻科目**（如数学）。系统写入 `校内成长目标 · 全校第一名` 或 `单科提升·数学`，侧栏为单元卷/错题本/周测，**不会出现托福/SAT/Common App/高考竞赛轨**。年级请选小学三至六年级或初中。

| 路径 | 航标示例 | 侧栏重点 |
|------|----------|----------|
| 美本/国际 | CMU · CS | 托福、SAT、AP、Common App |
| 国内高考 | 清华 · 计算机 | 高考/数学/物理/信息学 |
| 校内成长 | 校内成长目标 · 全校第一名 | 排名习惯、主攻科、周测归档 |

若仅改库内航标、未重新唤醒，可执行路径迁移：

```bash
npm run migrate:pathway -- --userId=你的用户ID
npm run migrate:pathway -- --all          # 所有已锁梦校用户
```

## API 统一（第三阶段）

| 能力 | 推荐端点 | 说明 |
|------|----------|------|
| ZHI 对话/遥测介入 | `POST /api/v3.5/zhi/intrusion` | 含学习快照、云目录最近归档、Omni 兼容字段（`mentorText`/`shouldTrigger`） |
| 旧 Electron / 兼容 | `POST /api/v2/omni/intrusion` | **代理**至 v3.5，带 `Deprecation` 头 |
| 主动导师 | `GET/POST /api/v3.5/mentor/intervene` | 替代 `/api/v2/mentor/active-intervention` |

Electron `telemetry-sensor.js` 已改为调用 **v3.5 intrusion**。

## 统一 LLM 网关（P0）

生产路径请使用 `gatewayJsonCompletion` / `gatewayTextCompletion`（见 [docs/llm-gateway.md](./docs/llm-gateway.md)），勿直接 `chat.completions.create`。固定 Warp 与按 token 计费二选一，避免双扣。
