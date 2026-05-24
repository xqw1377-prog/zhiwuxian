# 应用图标与启动图

## 准备素材

1. 导出 **`icon.png`**：1024×1024，透明或深色底 `#0D0E12`
2. 可选 **`splash.png`**：2732×2732，居中 Logo

可将 `icon-template.svg` 在 Figma 中打开后导出 PNG。

## 一键生成各平台资源

```bash
cd web
npm run assets:icons
npx cap sync
```

会写入 `android/app/src/main/res/` 与 `ios/App/App/Assets.xcassets/`（需已 `cap add ios`）。

## 商店截图建议

- iPad 12.9" 横屏：三栏或底栏「ZHI」对话页
- 竖屏：底栏「目录 | ZHI | 成长」
- 突出：拍试卷 → ZHI 解析回复
