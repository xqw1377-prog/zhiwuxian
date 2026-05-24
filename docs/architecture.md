# WUXIAN 架构与模块（以当前代码为准）

## 1. 总览

WUXIAN 由三层组成：

- 前端：两套入口（React Cockpit + Dashboard 单页）
- 服务端：Express 应用，聚合路由与静态资源
- 存储：SQLite（learning.db + core.db）

## 2. 前端

### 2.1 React Cockpit

- 路径：GET /
- 主要能力：
  - 投喂输入（链接/描述）
  - 展示下一行动节点与路线（roadmap）
  - 钱包显示与充值引导（simulate）
  - 星卡弹层（StarCard）

### 2.2 Dashboard（目标操作系统看板）

- 路径：GET /wuxian
- 主要能力：
  - TimeSlope / Assimilation / Risk KPI
  - 指针路由 resolveClip + 虫洞跃迁动画
  - 雷达卡、海报、证书生成/解锁/打开
  - 晨起航线对齐（utterance）

## 3. 服务端（Express）

### 3.1 应用入口

- 启动：server/index.ts
- 组装：createExpressApp + registerExtendedRoutes

### 3.2 路由层

核心用户路由集中在 server/extended-routes.ts：

- auth / wallet
- quantum
- video / course
- telemetry
- report / poster
- payment / billing / subscription

createExpressApp 负责：

- ToC 模式拦截与页面收敛
- 静态资源托管（/assets, /wuxian, /wuxian-spec.css）

## 4. 数据层（SQLite）

### 4.1 learning.db（wuxian_learning.db）

承载：

- 课程图谱：courses、knowledge_nodes（含 version）
- 遥测：cognitive_telemetry、behavioral_telemetry_events
- 水位：user_cognitive_waterline
- 虫洞日志：wormhole_leap_logs
- 报告与证书：cognitive_reports
- 钱包与订单：user_wallet、payment_orders、user_sessions

### 4.2 core.db（wuxian_core.db）

承载：

- 目标与重路由日志（goal / reroute_logs 等）

## 5. 数据流（关键链路）

### 5.1 冷启动与会话

1) 前端发起 auth/bootstrap
2) 服务端创建 user_sessions 与 user_wallet 行
3) 返回 token + wallet summary

### 5.2 视频同化

1) video/assimilate → 计费 consume warp
2) 同化产出 knowledge cells
3) persistKnowledgeGraph 写入 courses + knowledge_nodes
4) 返回 courseId；前端后续用 courseId+timestamp 走指针路由

### 5.3 指针路由与虫洞

1) video/resolve-clip（courseId+currentTimestamp）
2) findNodeByTimestamp 查 active version 节点
3) wormhole evaluator 计算 IL/PS/Assimilation
4) 达标返回 WORMHOLE_ACTIVATED + redirectToSeconds

### 5.4 报告与证书解锁

1) report/generate 创建 cognitive_reports（默认 locked）
2) report/cognitive/:id/unlock 创建订单或用订单解锁
3) payment/confirm 或 payment/webhook 完成订单
4) unlockCognitiveReport 写 shareUrl（token）
5) poster.svg 访问必须 token 校验

### 5.5 逆向目标矩阵（路径 A）

1) 用户提交目的地/现状/天数 → quantum/reverse-plan
2) 服务端调用逆向引擎（LLM 或 fallback）产出 totalUnits / initialCompletedUnits / whisper
3) 写入 goal_reversing_matrix，前端展示倒计时 + 进度条
4) 冷启动通过 quantum/reversing-metrics 恢复

## 6. 一致性策略（已实现）

### 6.1 支付幂等

- fulfillOrder 使用 SQLite transaction
- 已支付订单重复回调直接返回，避免重复发放
- third_party_tx_id 尝试建立唯一索引，历史冲突时降级不阻塞启动

### 6.2 图谱版本化

- courses.active_version_id 指向当前版本
- knowledge_nodes.version_id 标记节点所属版本
- 读路径按 active version 过滤，避免旧节点残留污染与外键冲突
