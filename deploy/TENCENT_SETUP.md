# WUXIAN ZHI Cockpit · 腾讯云部署指南

> 预计耗时：30 分钟（含等待审核）
> 成本预估：轻量应用服务器 2核4G ~100 元/月 + 域名首年 ~50 元

---

## 第一步：购买腾讯云服务器

1. 打开 https://console.cloud.tencent.com/lighthouse/instance
2. 点击 **新建实例**
3. 配置：
   - 地域：**上海**（兼顾大陆速度和数据合规）
   - 镜像：**Ubuntu 22.04 LTS**
   - 套餐：**2核4GB**（轻量应用服务器，~100 元/月）
   - 带宽：**8Mbps**（默认）
   - 时长：按月（可随时升配）
4. 点击 **立即购买** → 确认付款
5. 创建完成后，在实例列表拿到 **公网 IP**

## 第二步：申请域名

> 也可以先买服务器，域名在服务器控制台一起买更方便

1. 打开 https://buy.cloud.tencent.com/domain
2. 搜索想要的域名（建议 `你的项目名.com` 或 `.cn`）
3. 加入购物车 → 付款
4. 邮箱查收 **实名认证** 通知，上传身份证（个人）/ 营业执照（企业）
5. 认证预计 **1-3 个工作日**，但可以先把服务器配好

## 第三步：DNS 解析（域名买好后）

> 域名认证通过后操作

1. 打开 https://console.cloud.tencent.com/domain
2. 点你的域名 → **解析**
3. 添加两条记录：

| 记录类型 | 主机记录 | 记录值 | TTL |
|----------|----------|--------|-----|
| A | `@` | `你的服务器公网IP` | 600 |
| A | `www` | `你的服务器公网IP` | 600 |

4. 等待 **1-10 分钟** 解析生效

## 第四步：登录服务器一键部署

```bash
# 用腾讯云控制台 "登录" 按钮（WebShell），或用本地终端：
ssh root@你的服务器IP

# 安装 git（如果没装）
apt-get update && apt-get install -y git

# 克隆项目
cd /opt
git clone <你的仓库地址> wuxian
cd wuxian

# 创建 .env（复制生产模板）
cp .env.production .env
nano .env   # 填入所有密钥（DEEPSEEK_API_KEY, STRIPE_SECRET_KEY 等）

# 运行初始化脚本
chmod +x deploy/init-tencent.sh
sudo bash deploy/init-tencent.sh
```

## 第五步：配置 SSL 证书

腾讯云有免费 SSL 证书，不需要自己买：

1. 打开 https://console.cloud.tencent.com/ssl
2. 点击 **申请免费证书** → 选择 **TrustAsia 免费证书（DV）**
3. 绑定你的域名 → 提交
4. 下载证书 → 解压 → 将 `fullchain.pem` 和 `privkey.pem` 上传到服务器的 `/opt/wuxian/ssl/`
5. 执行：
```bash
sudo systemctl restart nginx
```

## 第六步：配置 Stripe Webhook

1. 登录 https://dashboard.stripe.com
2. Developers → Webhooks → Add endpoint
3. **Endpoint URL**: `https://你的域名/api/v1/payment/stripe-webhook`
4. **监听事件**: `checkout.session.completed`, `invoice.paid`
5. 拿到 **Signing secret** → 更新服务器 `.env` 中的 `STRIPE_WEBHOOK_SECRET`
6. 重启后端：
```bash
sudo systemctl restart wuxian-core
```

## 第七步：验证

```bash
# 健康检查
curl https://你的域名/api/health

# 验证隐私政策 API
curl https://你的域名/api/v1/legal/privacy

# 验证用户协议 API
curl https://你的域名/api/v1/legal/terms
```

---

## 日常运维命令

```bash
# 查看服务状态
sudo systemctl status wuxian-core

# 查看日志
sudo journalctl -u wuxian-core -f

# 重启
sudo systemctl restart wuxian-core

# 更新代码
cd /opt/wuxian
git pull
sudo npm run build:server && sudo systemctl restart wuxian-core

# 更新前端
cd /opt/wuxian
git pull
sudo npm run build:web && sudo systemctl restart nginx
```

---

## 费用预估（每月）

| 项目 | 费用 |
|------|------|
| 腾讯云轻量 2核4G 8Mbps | ~100 元 |
| 域名（平摊） | ~5 元 |
| DeepSeek API（按量） | ~30 元（个人使用） |
| Stripe 手续费 | 2.9% + 3 元/笔 |
| **合计** | **~140 元/月** |
