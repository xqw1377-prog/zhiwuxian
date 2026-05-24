#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# WUXIAN ZHI Cockpit · 一键部署脚本 (Linux / macOS)
# 用法:
#   chmod +x deploy/deploy.sh
#   ./deploy/deploy.sh                    # 构建并启动
#   ./deploy/deploy.sh --ssl              # 启用 Let's Encrypt SSL
#   ./deploy/deploy.sh --update           # 拉取最新代码并重建
#   ./deploy/deploy.sh --logs             # 查看日志
#   ./deploy/deploy.sh --down             # 停止服务
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose.prod.yml"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

cd "$PROJECT_DIR"

# ── 前置检查 ──────────────────────────────────────────────────────────────────
check_prereqs() {
  for cmd in docker docker compose node npm; do
    if ! command -v "$cmd" &>/dev/null; then
      log_error "缺少 $cmd，请先安装"
      exit 1
    fi
  done

  if [ ! -f .env ]; then
    log_error "缺少 .env 文件，请从 .env.production 复制并填入真实值"
    log_info "  cp .env.production .env"
    exit 1
  fi

  if [ ! -d "web/dist" ] || [ ! -f "web/dist/index.html" ]; then
    log_warn "前端构建产物不存在，正在构建..."
    npm run build:web
  fi

  log_info "前置检查通过"
}

# ── 构建与启动 ────────────────────────────────────────────────────────────────
build_and_up() {
  log_info "构建并启动 WUXIAN 生产环境..."

  if [ "${1:-}" = "--ssl" ]; then
    log_info "启用 SSL 模式"
    docker compose -f "$COMPOSE_FILE" --profile ssl up -d --build
  else
    docker compose -f "$COMPOSE_FILE" up -d --build
  fi

  log_info "等待服务就绪..."
  sleep 10

  if docker compose -f "$COMPOSE_FILE" exec wuxian-core node -e "fetch('http://127.0.0.1:3401/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    log_info "服务健康检查通过！"
  else
    log_warn "服务可能需要更多时间启动，请稍后检查日志"
  fi

  log_info "完成！访问 http://localhost:80 或 https://your-domain.com"
}

# ── 更新 ──────────────────────────────────────────────────────────────────────
update() {
  log_info "拉取最新代码..."
  git pull

  log_info "重建前端..."
  npm run build:web

  log_info "重建并重启 Docker 服务..."
  docker compose -f "$COMPOSE_FILE" up -d --build

  log_info "更新完成！"
}

# ── 日志 ──────────────────────────────────────────────────────────────────────
show_logs() {
  docker compose -f "$COMPOSE_FILE" logs -f
}

# ── 停止 ──────────────────────────────────────────────────────────────────────
down() {
  log_info "停止服务..."
  docker compose -f "$COMPOSE_FILE" down
  log_info "服务已停止"
}

# ── 主入口 ─────────────────────────────────────────────────────────────────────
case "${1:-}" in
  --ssl)
    check_prereqs
    build_and_up "--ssl"
    ;;
  --update)
    update
    ;;
  --logs)
    show_logs
    ;;
  --down)
    down
    ;;
  *)
    check_prereqs
    build_and_up
    ;;
esac
