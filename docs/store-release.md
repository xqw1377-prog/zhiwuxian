# 应用商店上架清单（Android / iOS）

## 应用内合规页（已内置）

| 页面 | 链接 | 用途 |
|------|------|------|
| 隐私政策 | `https://你的域名/privacy` 或 `/#/privacy` | Google Play / App Store 必填 URL（服务端 302 到 hash 页） |
| 用户协议 | `https://你的域名/terms` 或 `/#/terms` | 建议同上 |

部署 Web 或 App 内 WebView 均可打开；商店后台填写 **HTTPS 公网地址**。

在 `web/.env.production.local` 配置 `VITE_LEGAL_OPERATOR`、`VITE_LEGAL_EMAIL`、`VITE_LEGAL_ADDRESS` 后重新 `npm run build:mobile`。

---

## Android（Google Play）

### 构建内测包

```powershell
# 项目根目录
npm run android:release
# 或
.\scripts\android-release.ps1
```

产出：`web/android/app/build/outputs/bundle/release/app-release.aab`

首次需在 Android Studio 配置 **签名密钥**（Build → Generate Signed Bundle）。

### Play Console 必填

- [ ] 应用名称、简短说明（平板学业辅导）
- [ ] 隐私政策 URL（`#/privacy` 的完整 HTTPS）
- [ ] 内容分级问卷
- [ ] 目标受众：含未成年人需如实申报
- [ ] 截图：7 寸 / 10 寸平板横竖屏各 2–4 张
- [ ] `VITE_API_BASE` 生产 API 已 HTTPS

### 支付

- 应用内虚拟商品：Google Play Billing 或 H5 + 合规说明
- 当前代码：`WUXIAN_PAYMENT_MODE=live` + webhook

---

## iOS（App Store）

需在 **macOS** 执行：

```bash
cd web
npx cap add ios   # 若尚未添加
npm run cap:ios
```

### App Store Connect

- [ ] 隐私政策 URL
- [ ] App 隐私标签（与隐私政策一致）
- [ ] **IAP**：若卖 Warp/订阅，需配置 App 内购买项目，或仅用外部 H5（审核风险自担）
- [ ] iPad 截图（13 寸优先）

---

## 平板演示路径（审核 / 内测）

1. 打开 App → 自动 bootstrap 登录  
2. 梦校航标 → 选「还没想好大学」或清华 → 唤醒  
3. 底栏 **ZHI** → **拍试卷** → 发送 → 看解析  
4. 底栏 **成长** → **购买 10h Warp**（simulate 环境可验单）  
5. 设置页链接 → 隐私政策 / 用户协议  

---

## PWA（免安装）

`npm run build:web` 部署后，平板 Chrome/Safari 可「添加到主屏幕」；`manifest.webmanifest` 已提供。

---

## 运营方信息模板（请替换）

在隐私政策第 6、7 节与商店「开发者联系」中填写：

- 运营主体：________有限公司  
- 联系邮箱：support@________.com  
- 注册地址：________  
