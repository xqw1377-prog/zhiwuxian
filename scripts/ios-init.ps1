# iOS Capacitor 工程初始化（需在 macOS + Xcode 执行）
$ErrorActionPreference = "Stop"
$Web = Join-Path (Split-Path -Parent $PSScriptRoot) "web"
Push-Location $Web
if (-not (Test-Path "ios")) {
  npx cap add ios
}
npm run build:mobile
npx cap sync ios
npx cap open ios
Pop-Location
Write-Host "请在 Xcode 中配置签名并 Run（真机或模拟器）"
