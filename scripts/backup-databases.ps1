# WUXIAN · 每日备份 SQLite（商用运维）
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Data = if ($env:WUXIAN_DATA_DIR) { $env:WUXIAN_DATA_DIR } else { Join-Path $Root "data" }
$Dest = Join-Path $Root "backups"
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null

foreach ($name in @("wuxian_core.db", "wuxian_learning.db", "auth.db")) {
  $src = Join-Path $Data $name
  if (Test-Path $src) {
    Copy-Item $src (Join-Path $Dest "$name.$Stamp.bak")
    Write-Host "OK $name"
  }
}
Write-Host "备份目录: $Dest"
