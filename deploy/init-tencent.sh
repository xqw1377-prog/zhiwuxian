#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# WUXIAN ZHI Cockpit · 腾讯云一键初始化脚本
# 用法：在腾讯云服务器首次登录后执行:
#   curl -fsSL https://your-repo/init-tencent.sh | bash
# 或手动: chmod +x init-tencent.sh && sudo ./init-tencent.sh
# =============================================================================

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ── 仅允许 root 或 sudo ──────────────────────────────────────────────────────
if [ "$EUID" -ne 0 ]; then
  log_error "请使用 sudo 运行: sudo bash init-tencent.sh"
  exit 1
fi

cd /opt

# ── 1. 系统基础配置 ──────────────────────────────────────────────────────────
log_info "更新系统..."
apt-get update -qq && apt-get upgrade -y -qq

log_info "安装 Docker + Docker Compose..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | bash
  systemctl enable --now docker
fi

if ! docker compose version &>/dev/null; then
  apt-get install -y docker-compose-plugin
fi

log_info "安装 Node.js 20.x（仅首次构建前端需要）..."
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash
  apt-get install -y nodejs
fi

# ── 2. 克隆项目 ──────────────────────────────────────────────────────────────
log_info "克隆 WUXIAN ZHI Cockpit..."
if [ ! -d /opt/wuxian ]; then
  git clone <你的仓库地址> /opt/wuxian
fi
cd /opt/wuxian

# ── 3. 创建 .env ─────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  log_info "请手动创建 .env 文件（参考 .env.production 填入密钥）"
  log_info "  cp .env.production .env"
  log_info "  nano .env"
  log_info "完成后重新运行此脚本"
  exit 0
fi

# ── 4. 构建前端 ──────────────────────────────────────────────────────────────
log_info "构建前端静态资源..."
npm run build:web

# ── 5. 创建 SSL 证书目录 ─────────────────────────────────────────────────────
mkdir -p /opt/wuxian/ssl
log_info "SSL 证书目录已创建: /opt/wuxian/ssl"

# ── 6. 生产 Nginx 配置（腾讯云专用）─────────────────────────────────────────
log_info "配置 Nginx..."
cat > /opt/wuxian/deploy/nginx.tencent.conf << 'NGINX'
upstream wuxian_backend {
    server 127.0.0.1:3401;
    keepalive 64;
}

server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name <你的域名>;

    ssl_certificate     /opt/wuxian/ssl/fullchain.pem;
    ssl_certificate_key /opt/wuxian/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 256;
    gzip_comp_level 6;
    gzip_vary on;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        root /opt/wuxian/web/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$ {
            expires 365d;
            add_header Cache-Control "public, immutable";
        }
    }

    location /api/ {
        proxy_pass http://wuxian_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    location /public/ {
        proxy_pass http://wuxian_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        expires 7d;
        add_header Cache-Control "public";
    }

    location /health {
        proxy_pass http://127.0.0.1:3401/api/health;
    }

    access_log /var/log/nginx/wuxian-access.log;
    error_log  /var/log/nginx/wuxian-error.log;
}
NGINX

sed -i "s/<你的域名>/$(grep WUXIAN_CORS_ORIGIN .env | cut -d= -f2 | sed 's|https://||' | tr -d ' ')/g" /opt/wuxian/deploy/nginx.tencent.conf

# ── 7. 安装 Nginx（宿主机模式，不用 Docker Nginx 以简化 SSL）───────────────
log_info "安装 Nginx..."
apt-get install -y nginx
ln -sf /opt/wuxian/deploy/nginx.tencent.conf /etc/nginx/sites-available/wuxian
ln -sf /etc/nginx/sites-available/wuxian /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# ── 8. 创建 systemd 服务 ────────────────────────────────────────────────────
log_info "创建 wuxian-core systemd 服务..."
cat > /etc/systemd/system/wuxian-core.service << 'SERVICE'
[Unit]
Description=WUXIAN ZHI Cockpit Core Engine
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/wuxian
ExecStart=/usr/bin/node /opt/wuxian/dist/server/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/opt/wuxian/.env
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload

# ── 9. 构建后端 ──────────────────────────────────────────────────────────────
log_info "编译后端代码..."
npm run build:server

# ── 10. 启动 ─────────────────────────────────────────────────────────────────
log_info "启动服务..."
systemctl enable --now wuxian-core
systemctl restart nginx

# ── 11. 验证 ─────────────────────────────────────────────────────────────────
sleep 5
if curl -sf http://127.0.0.1:3401/api/health > /dev/null 2>&1; then
  log_info "✅ WUXIAN 后端健康检查通过!"
else
  log_warn "⚠️ 后端可能需要更多时间启动，请稍后检查: systemctl status wuxian-core"
fi

PUBLIC_IP=$(curl -sf http://checkip.amazonaws.com 2>/dev/null || curl -sf https://api.ipify.org 2>/dev/null || echo "获取失败")
log_info ""
log_info "╔════════════════════════════════════════════════════════╗"
log_info "║          WUXIAN ZHI Cockpit · 部署完成               ║"
log_info "╠════════════════════════════════════════════════════════╣"
log_info "║  1. 配置 DNS: 将域名 A 记录指向 $PUBLIC_IP"
log_info "║  2. 上传 SSL 证书到 /opt/wuxian/ssl/"
log_info "║  3. 重启 Nginx: sudo systemctl restart nginx"
log_info "║  4. 访问: https://你的域名"
log_info "╚════════════════════════════════════════════════════════╝"
