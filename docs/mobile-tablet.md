# WUXIAN · 平板 / Android / iOS 上线指南

产品主场景为 **平板横竖屏**；Web 壳在 `<1024px` 使用底栏三页（目录 | ZHI | 成长），`≥1024px` 保持桌面三栏。

原生 App 采用 **Capacitor 7** 包装现有 `web/` Vite 工程（与 Electron 桌面并列，不重复写 UI）。

## 架构

| 端 | 技术 | 说明 |
|----|------|------|
| 平板浏览器 | PWA / Safari / Chrome | `npm run build:web` + HTTPS 部署 |
| Android | Capacitor + WebView | 上架 Google Play 或企业分发 |
| iOS | Capacitor + WKWebView | 上架 App Store |
| Windows 桌面 | Electron（已有） | 截屏浮窗等，非平板主路径 |

## 前置条件

- Node 20+
- **Android**：Android Studio、JDK 17、SDK 34+
- **iOS**（仅 macOS）：Xcode 15+、CocoaPods
- 已部署的 **HTTPS API**（`NODE_ENV=production`），CORS 含 `capacitor://localhost` 或留空由原生直连

## 1. 配置 API 地址

```bash
# web 目录（PowerShell）
Copy-Item .env.production.local.example .env.production.local
# 编辑 VITE_API_BASE、VITE_LEGAL_* 后 build:mobile
```

原生 App **不会**走 Vite 代理，未配置 `VITE_API_BASE` 时默认 `http://localhost:3401`（仅模拟器调试）。

服务端 `.env` 建议：

```env
WUXIAN_CORS_ORIGIN=https://你的Web域名
```

## 2. 构建 Web 资源

```bash
cd web
npm install
npm run build:mobile
```

`build:mobile` 使用 `base: ./` 与 `CAPACITOR=1`，输出到 `web/dist`。

## 3. 初始化原生工程（首次）

```bash
cd web
npx cap add android    # Windows / macOS / Linux 均可
npx cap add ios        # 仅 macOS + Xcode
```

本仓库已在 Windows 环境生成 **`web/android/`**；iOS 需在 Mac 上执行 `npx cap add ios`。

## 4. 同步并打开 IDE

```bash
cd web
npx cap sync
npx cap open android
# 或
npx cap open ios
```

在 Android Studio / Xcode 中：

- 配置签名（Release keystore / Apple 开发者证书）
- 包名默认 `com.wuxian.zhi`（可在 `capacitor.config.ts` 修改）
- 真机运行前：手机与 API **同一可达网络**，或使用公网 HTTPS API

## 5. 根目录快捷命令

```bash
npm run mobile:sync      # build:mobile + cap sync
npm run mobile:android     # sync + open Android Studio
npm run mobile:ios         # sync + open Xcode（需 macOS）
```

## 平板 UX 说明

- **横屏 ≥1024px**：左目录 + 中对话 + 右成长（与桌面一致）
- **竖屏 / 手机**：底部 Tab，避免三栏挤在一起
- 安全区：`safe-area-pt` / `safe-area-pb` 适配 iPad 刘海与 Home 条

## iOS IAP（应用内购买）集成

### 架构

```
原生 App → RevenueCat SDK → Apple App Store
             ↓
     RevenueCat Server → Webhook → WUXIAN 后端 → 用户钱包充值
```

### 配置步骤

1. **RevenueCat 后台**
   - 注册 https://app.revenuecat.com
   - 创建项目 → 添加 iOS 和 Android App
   - 在 App Store Connect / Google Play Console 配置产品 ID：
     - `wuxian_pro_monthly`（Pro 月卡）
     - `wuxian_lifetime`（终身）
   - 将 RevenueCat API Key 填入 `web/.env.production.local`

2. **Webhook 配置**
   - RevenueCat Dashboard → Integrations → Webhook
   - URL: `https://你的域名/api/v1/iap/revenuecat-webhook`
   - 签名密钥填入 `.env` → `REVENUECAT_WEBHOOK_SECRET`

3. **iOS 注意事项**
   - 所有数字内容购买**必须**使用 Apple IAP，不能用 Stripe
   - 需要 Apple 开发者账号（$99/年）
   - App Store 审核时需提供测试账号

4. **本地测试**
   ```bash
   cd web
   npm run build:mobile
   npx cap sync
   npx cap open ios    # Xcode → 真机或模拟器测试
   ```

## 商用检查清单（移动端）

- [ ] `VITE_API_BASE` 指向生产 HTTPS
- [ ] `POST /api/v1/auth/bootstrap` 使用 `deviceId`（已实现）
- [ ] 支付：iOS 用 RevenueCat IAP、Web 用 Stripe、Android 可选 IAP 或 Stripe
- [ ] 隐私政策 / 用户协议 URL（商店必填）
- [ ] 图标与启动图：`web/resources/`（可用 `@capacitor/assets` 生成）
- [ ] 弱网：对话超时提示（按需加强）

## 与 Electron 的差异

| 能力 | Electron | Capacitor 平板 |
|------|----------|----------------|
| 全局截屏浮窗 | ✅ | ❌（需系统分享或相册选图） |
| 后台服务 | 部分 | 受限 |
| 商店分发 | 可选 | Play / App Store |

平板主路径不依赖 Electron；截屏批改可后续用 **相册/相机 Capacitor 插件** 接入 `zhi/vision`。

## 第 3 步（已实现）：合规页 + 平板布局 + 上架脚本

- 应用内 **`#/privacy`**、**`#/terms`**（底部链接，商店可填同一 HTTPS）
- 横屏 ≥1024px 三栏（侧栏略窄）；竖屏底栏；宽屏以下右侧「成长」默认收起
- Android AAB：`npm run android:release` 或 `scripts/android-release.ps1`
- 上架清单：[store-release.md](./store-release.md)

## 第 2 步（已实现）：相机 + 品牌资源

### 拍试卷 / 相册

- 原生 App 对话区上方有 **「拍试卷 / 错题」「相册」** 按钮（Capacitor Camera）
- 选图后走现有附件流，发送即 `/api/v3.5/zhi/vision/analyze` 视觉解析

首次真机需允许相机/相册权限。

### 图标与启动图

```bash
# 1. 将 1024×1024 的 icon.png 放到 web/resources/
# 2. 生成并同步
cd web
npm run assets:icons
npx cap sync
```

模板见 `web/resources/icon-template.svg`。

## 故障排查

| 现象 | 处理 |
|------|------|
| App 白屏 | 检查 `web/dist` 是否生成、`npx cap sync` |
| 接口 401 | 是否 bootstrap；生产勿用自造 `userId` |
| 接口连不上 | 检查 `VITE_API_BASE`、真机能否访问该域名 |
| Android 明文 HTTP | 仅调试；生产必须 HTTPS 或 network security 配置 |
| 相机打不开 | 系统设置中授予相机/相册权限；重新 `cap sync` |
