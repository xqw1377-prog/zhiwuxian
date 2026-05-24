# =============================================================================
# WUXIAN ZHI Cockpit · 一键部署脚本 (Windows PowerShell)
# 用法:
#   .\deploy\deploy.ps1                    # 构建并启动
#   .\deploy\deploy.ps1 -SSL               # 启用 Let's Encrypt SSL
#   .\deploy\deploy.ps1 -Update            # 拉取最新代码并重建
#   .\deploy\deploy.ps1 -Logs              # 查看日志
#   .\deploy\deploy.ps1 -Down              # 停止服务
# =============================================================================

param(
  [switch]$SSL,
  [switch]$Update,
  [switch]$Logs,
  [switch]$Down
)

$ProjectDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$ComposeFile = Join-Path $ProjectDir "deploy" "docker-compose.prod.yml"

function Write-Info  { Write-Host "[INFO] $args" -ForegroundColor Green }
function Write-Warn  { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Error { Write-Host "[ERROR] $args" -ForegroundColor Red }

Set-Location -LiteralPath $ProjectDir

# ── 前置检查 ──────────────────────────────────────────────────────────────────
function Check-Prereqs {
  $missing = @()
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $missing += "docker" }
  if (-not (Get-Command node -ErrorAction SilentlyContinue))   { $missing += "node" }
  if ($missing.Count -gt 0) {
    Write-Error "缺少: $($missing -join ', ')"
    exit 1
  }

  if (-not (Test-Path ".env")) {
    Write-Error "缺少 .env 文件，请从 .env.production 复制并填入真实值"
    Write-Info "  Copy-Item .env.production .env"
    exit 1
  }

  if (-not (Test-Path "web\dist\index.html")) {
    Write-Warn "前端构建产物不存在，正在构建..."
    npm run build:web
  }

  Write-Info "前置检查通过"
}

# ── 构建与启动 ────────────────────────────────────────────────────────────────
function Build-And-Up {
  param([switch]$EnableSSL)

  Write-Info "构建并启动 WUXIAN 生产环境..."

  if ($EnableSSL) {
    docker compose -f "$ComposeFile" --profile ssl up -d --build
  } else {
    docker compose -f "$ComposeFile" up -d --build
  }

  Write-Info "完成！访问 http://localhost:80"
}

# ── 更新 ──────────────────────────────────────────────────────────────────────
function Update {
  Write-Info "拉取最新代码..."
  git pull

  Write-Info "重建前端..."
  npm run build:web

  Write-Info "重建并重启 Docker 服务..."
  docker compose -f "$ComposeFile" up -d --build

  Write-Info "更新完成！"
}

# ── 主入口 ─────────────────────────────────────────────────────────────────────
if ($Update) {
  Check-Prereqs
  Update
} elseif ($Logs) {
  docker compose -f "$ComposeFile" logs -f
} elseif ($Down) {
  Write-Info "停止服务..."
  docker compose -f "$ComposeFile" down
  Write-Info "服务已停止"
} else {
  Check-Prereqs
  Build-AndUp -EnableSSL:$SSL
}
