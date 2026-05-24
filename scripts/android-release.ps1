# WUXIAN · Android 内测 / 上架 AAB 构建
# 前置：web/.env.production.local 已配置 VITE_API_BASE；JDK 17+；Android SDK

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Web = Join-Path $Root "web"

Write-Host "[1/4] build:mobile" -ForegroundColor Cyan
Push-Location $Web
npm run build:mobile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[2/4] cap sync android" -ForegroundColor Cyan
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[3/4] gradle bundleRelease (AAB)" -ForegroundColor Cyan
Push-Location (Join-Path $Web "android")
.\gradlew.bat bundleRelease
$gradleExit = $LASTEXITCODE
Pop-Location
Pop-Location

if ($gradleExit -ne 0) {
  Write-Host "Gradle 失败。请在 Android Studio 中：Build > Generate Signed Bundle/APK" -ForegroundColor Yellow
  exit $gradleExit
}

$aab = Join-Path $Web "android\app\build\outputs\bundle\release\app-release.aab"
Write-Host "[4/4] 完成" -ForegroundColor Green
if (Test-Path $aab) {
  Write-Host "AAB: $aab"
} else {
  Write-Host "未找到 AAB，请检查 android/app/build/outputs/bundle/release/"
}
