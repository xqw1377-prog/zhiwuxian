# WUXIAN 数据与口径（SQLite）

本文件描述当前代码落地的数据结构与推荐口径，便于对账、排障与后续扩展。

## 1) 数据库

- learning.db：课程图谱、遥测、报告、钱包与订单
- core.db：目标、重路由日志

## 2) learning.db 关键表（摘要）

### courses

用途：课程元信息与 active version 指针。

关键字段：

- id
- title
- source_url
- video_id
- total_duration_sec
- active_version_id（当前版本）

### knowledge_nodes

用途：课程的知识节点（按 active version 过滤读取）。

关键字段：

- id（写入时带 courseId/versionId 前缀，避免跨版本冲突）
- course_id
- version_id
- node_index
- title
- video_timestamp_start / end
- cognitive_load
- core_concept_hash

### cognitive_telemetry

用途：与节点绑定的核心遥测（IL/PS 计算来源）。

关键字段：

- user_id
- node_id
- play_speed
- skip_count
- quiz_score
- interaction_latency
- timestamp

### behavioral_telemetry_events

用途：泛化事件总线（证据链来源）。

关键字段：

- user_id
- session_id
- event_type
- payload（JSON 字符串）
- ts

### user_cognitive_waterline

用途：用户在课程维度的当前水位与指标。

关键字段：

- (user_id, course_id) 主键
- current_node_id
- il / ps / assimilation_rate
- updated_at

### wormhole_leap_logs

用途：虫洞跃迁日志（可追溯）。

关键字段：

- from_node_id / to_node_id
- skipped_titles
- il / ps / assimilation_rate
- old_slope / new_slope
- persona_feedback

### cognitive_reports

用途：认知报告与证书解锁状态。

关键字段：

- id
- user_id
- goal_id / course_id
- il_peak / ps_peak / resilience_density
- is_unlocked
- share_token / share_url
- summary_text
- created_at

### user_wallet

用途：统一钱包（credits + warp + tier + reset）。

关键字段：

- user_id
- credits / daily_free_credits / credits_reset_at
- warp_minutes / warp_unlimited_until / warp_monthly_reset_at
- tier / tier_expires_at
- subscription_status / subscription_expires_at
- daily_* usage fields

### payment_orders

用途：支付订单与入账对账。

关键字段：

- id
- user_id
- product_type / product_id
- amount_cny / amount_cents
- status（PENDING/PAID/FAILED）
- payment_provider
- payment_ref
- third_party_tx_id
- metadata
- created_at / paid_at

### goal_reversing_matrix

用途：路径 A 逆向目标与倒计时账本（以终为始进度条）。

关键字段：

- user_id（主键）
- target_destination
- current_baseline_score
- target_deadline_timestamp（unix 秒）
- total_cognitive_units / completed_cognitive_units
- updated_at（unix 秒）

## 3) 口径建议

### Warp Power

- 单位：分钟
- 免费额度：月度重置（user_wallet.warp_monthly_reset_at）
- 无限逻辑：tier=pro 且未过期，或 warp_unlimited_until 未过期

### Credits

- 单位：抽象算力点数
- 日重置：credits_reset_at 与当日对比

### 报告解锁

- 严格口径：is_unlocked=1 且 share_token 完全匹配才允许访问证书 SVG

### 图谱一致性

- 读取必须按 courses.active_version_id 过滤 knowledge_nodes.version_id
- 旧版本节点允许留存，用于避免外键失败与回滚
