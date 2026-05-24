# WUXIAN · 健康检查巡检（可挂计划任务 / cron）
param([string]$Base = "http://localhost:3401")
$ErrorActionPreference = "Stop"
try {
  $r = Invoke-RestMethod -Uri "$Base/api/health" -TimeoutSec 15
  if ($r.status -ne "ok") { throw "health status not ok" }
  Write-Host "OK $($r.product) $($r.version) payment=$($r.paymentMode)"
  exit 0
} catch {
  Write-Host "FAIL $_"
  exit 1
}
