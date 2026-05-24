# 静态 Legacy 页面（3.5 之前）

根目录旧版 HTML 已迁入此目录，**默认不对外提供**。

启用方式（仅本地调试）：

```bash
set WUXIAN_LEGACY_STATIC=1
npm run server
```

访问示例：`http://localhost:3401/legacy/wuxian-dashboard.html`

未设置该变量时，旧路径（`/wuxian`、`/app` 等）在已构建主壳时会 **302 → `/`**。
