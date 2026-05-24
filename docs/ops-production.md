# 生产运维手册

## 每日

```powershell
npm run ops:health
npm run ops:backup
npm run reconcile:payments
```

## 发版

```bash
npm run verify
npm run build:web
NODE_ENV=production npm run start:prod
```

## 告警建议

- 计划任务每 5 分钟：`npm run ops:health`，失败发钉钉/邮件
- 每日 03:00：`npm run ops:backup`
- 每周：`npm run reconcile:payments -- --fix`

## 支付 live

1. `WUXIAN_PAYMENT_MODE=live`
2. 配置 `STRIPE_SECRET_KEY` 或 `WUXIAN_WECHAT_PAY_H5_URL`
3. Webhook：`POST /api/v1/payment/webhook/wechat` 或 Stripe 路由

## 家长战报

1. `WECHAT_COMPANION_WEBHOOK_URL` 指向自建中转服务
2. `WUXIAN_PARENT_LINK_TOKEN` + `WUXIAN_FRONTEND_URL`
3. 班级花名册：`GET /api/v1/companion/classes`
