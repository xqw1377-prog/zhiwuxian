# WUXIAN 安全与隐私（现状与规范）

## 1) 原则

- 最小化：只采集与产品目标直接相关的数据
- 可追溯：收费、解锁、证书访问必须可审计
- 可撤回：提供能力迁移与失效策略（会话/认证/分享 token）
- 默认安全：对外默认 ToC 模式，屏蔽内部页面与 API 前缀

## 2) 当前实现要点

### 2.1 ToC 模式拦截

- 默认纯 ToC 模式（WUXIAN_INTERNAL != '1'）
- 屏蔽 /admin 与一批 legacy 前缀

### 2.2 支付与对账

- payment_orders 落库：订单状态、provider、txId 等记录可追溯
- fulfillOrder 使用 SQLite transaction 保证入账原子性
- token 化证书访问：未解锁或 token 不匹配返回 403

### 2.3 Webhook 验签

- live 模式下校验 webhook 签名（WUXIAN_PAYMENT_WEBHOOK_SECRET）
- simulate 模式用于本地联调

## 3) 隐私边界（对外叙事 vs 代码现状）

对外叙事强调 Edge Shield 与脱敏指标，但当前实现中：

- 遥测事件与晨起 utterance 会写入本机 SQLite（默认本地部署可接受）
- payload 可能包含文本、行为细节（需持续推进最小化与脱敏）

建议后续推进：

- 对 behavioral telemetry 的 payload 做字段级白名单与截断
- 将“分享资产”与“原始遥测”隔离存储与权限
- 增加数据保留期与清理策略（含旧图谱版本 GC）

## 4) 访问控制建议（后续）

- 会话：token 过期与单点失效
- 分享：share_token 长度与熵升级，支持一键失效
- 速率限制：对外 API 加更严格限流（尤其是支付与报告）

