# syntax=docker/dockerfile:1
# WUXIAN · 多阶段生产镜像（可选 slim：INSTALL_YTDLP=0）

# ==========================================
# 阶段一：前端静态资源
# ==========================================
FROM node:20-alpine AS web-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ==========================================
# 阶段二：后端编译 + 原生模块（不进入最终镜像）
# ==========================================
FROM node:20-alpine AS server-builder
WORKDIR /app

RUN apk add --no-cache \
    python3 make g++ \
    cairo-dev pango-dev jpeg-dev giflib-dev

COPY package*.json ./
RUN npm ci

COPY engine ./engine
COPY server ./server
COPY src ./src
COPY tsconfig.json tsconfig.build.json ./
COPY wuxian-dashboard.html wuxian-spec.css ./

RUN npm run build:server \
  && npm prune --omit=dev \
  && npm cache clean --force

# ==========================================
# 阶段三：生产运行时（无编译工具链）
# ==========================================
FROM node:20-alpine AS runner
WORKDIR /app

ARG INSTALL_YTDLP=1
ENV NODE_ENV=production \
    PORT=5173 \
    WUXIAN_DATA_DIR=/app/data \
    WUXIAN_SHARES_DIR=/app/public/shares \
    YT_DLP_PATH=yt-dlp

# 运行时：canvas 依赖 + 可选 yt-dlp；健康检查用 Node fetch，无需 curl
RUN apk add --no-cache \
      cairo pango jpeg giflib font-noto-cjk fontconfig \
    && if [ "$INSTALL_YTDLP" = "1" ]; then apk add --no-cache yt-dlp; fi \
    && fc-cache -fv \
    && addgroup -g 1001 wuxian \
    && adduser -D -u 1001 -G wuxian wuxian

COPY --from=server-builder --chown=wuxian:wuxian /app/node_modules ./node_modules
COPY --from=server-builder --chown=wuxian:wuxian /app/dist ./dist
COPY --from=server-builder --chown=wuxian:wuxian /app/package.json ./package.json
COPY --from=server-builder --chown=wuxian:wuxian /app/wuxian-dashboard.html ./wuxian-dashboard.html
COPY --from=server-builder --chown=wuxian:wuxian /app/wuxian-spec.css ./wuxian-spec.css
COPY --from=web-builder --chown=wuxian:wuxian /app/web/dist ./web/dist

RUN mkdir -p /app/data /app/public/shares \
  && chown -R wuxian:wuxian /app/data /app/public/shares

USER wuxian
VOLUME ["/app/data", "/app/public/shares"]
EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5173)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.js"]
