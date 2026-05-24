import { createExpressApp } from './express-app';
import { registerExtendedRoutes } from './extended-routes';
import { loadEnvFiles } from './load-env';
import { assertProductionReadiness } from './production-readiness';

import { applyProductionShield } from './middleware/production-shield';

import { bootstrapDatabase } from './bootstrap-database';
import { scheduleTelemetryMaintenance } from './telemetry-maintenance';
import { scheduleZhiDailyReview } from './zhi-daily-review-scheduler';
import { scheduleCompanionDailyReports } from './companion/companion-scheduler';

import { probeYtDlp } from './video-pipeline';

import { registerWuxianV2Routes } from './wuxian-v2-routes';

import { registerWuxianV3Routes } from './wuxian-v3-routes';

import { registerWuxianV35Routes } from './wuxian-v35-routes';

import { handleError } from './errors';
import { WUXIAN_API_CORE, WUXIAN_API_ZHI, WUXIAN_PRODUCT_NAME, WUXIAN_PRODUCT_VERSION, WUXIAN_DEFAULT_PORT } from './product-version';
import { initLlmBilling } from '../src/services/billing-hub';
import { initOpenTelemetry, shutdownOpenTelemetry } from './telemetry-otel';
import { initRedisRateLimiter } from '../src/services/redis-rate-limiter';
import { initStripe } from './stripe-payment';

import type { Request, Response, NextFunction } from 'express';


loadEnvFiles();

if (process.env.NODE_ENV === 'production') {
  assertProductionReadiness();
}

const PORT = Number(process.env.PORT) || WUXIAN_DEFAULT_PORT;

initOpenTelemetry(WUXIAN_PRODUCT_VERSION);
initRedisRateLimiter();
initStripe();

bootstrapDatabase();
initLlmBilling();

const app = createExpressApp();

applyProductionShield(app);

registerExtendedRoutes(app);

registerWuxianV2Routes(app);

registerWuxianV3Routes(app);

registerWuxianV35Routes(app);



app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {

  const { status, body } = handleError(err);

  res.status(status).json(body);

});



void probeYtDlp().then((ok) => {

  console.log(`  [Video]     yt-dlp ${ok ? '就绪' : '未安装 · 将使用启发式折叠'}`);

});



app.listen(PORT, () => {

  const apiUrl = `http://localhost:${PORT}`;

  console.log(`\n  ╔══════════════════════════════════════════╗`);

  console.log(`  ║  ${WUXIAN_PRODUCT_NAME} ${WUXIAN_PRODUCT_VERSION}`.padEnd(41) + '║');

  console.log(`  ║                                       ║`);

  console.log(`  ║     Backend API : ${apiUrl.padEnd(29)}║`);

  console.log(`  ║     Frontend   : ${apiUrl.padEnd(29)}║`);

  console.log(`  ║     Electron   : http://127.0.0.1:${String(PORT).padEnd(22)}║`);

  console.log(`  ║     Storage    : wuxian_core + learning.db ║`);

  console.log(`  ╚══════════════════════════════════════════╝\n`);

  console.log(`  [Cockpit]   GET  /              → OmniCockpit（${WUXIAN_PRODUCT_VERSION} 主入口）`);

  console.log(`  [ZHI]       /api/${WUXIAN_API_ZHI}/zhi/*  → 学业 · 语言 · 评估 · 目录`);

  console.log(`  [Core]      /api/${WUXIAN_API_CORE}/goal/*   → 目标拆解 · 重路由`);

  console.log('  [Health]    GET  /api/health');

  console.log('  [Quantum]   POST /api/v1/quantum/*  → 意图投喂（legacy）');

  console.log('  [Wormhole]  POST /api/v1/wormhole/* → 虫洞跃迁评估');

  console.log('  [Poster]    POST /api/v1/poster/*   → 赛博星卡 PNG 生成');

  console.log('  [Wallet]    GET  /api/v1/wallet/:userId');

  console.log('  [Auth]      POST /api/v1/auth/bootstrap');

  console.log('  [Companion] GET  /api/v1/companion/parent-view/:studentId');

  console.log('  [Companion] POST /api/v1/companion/parent-cheer');

  console.log('  [Payment]   POST /api/v1/payment/create|confirm|webhook/:provider');

  console.log('  [Billing]   GET  /api/v1/billing/:userId');

  console.log('  [Telemetry] POST /api/v1/telemetry/ingest  → SQLite 持久化');

  console.log('  [Video]     GET  /api/v1/video/pipeline/status');

  console.log('  [Desktop]   Option+Space / Alt+Space → Electron 拦截浮窗 (npm run desktop)');
  console.log('  [Trend]     GET  /api/v3.5/zhi/trend/:userId → 学习趋势预测');
  console.log('  [SpacedRep]  间隔重复引擎已就绪');
  console.log('  [WebVitals]  前端性能监控已启用');
  console.log('  [MultiLang]  支持中/英/日/韩/泰');
  console.log('  [Offline]   PWA 离线缓存已注册');
  console.log(`  [OTel]      ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? 'OpenTelemetry 已连接' : 'OpenTelemetry 未配置'}`);
  console.log(`  [Redis]     ${process.env.REDIS_URL ? 'Redis 速率限制已就绪' : 'Redis 未配置，使用内存模式'}`);

  console.log('');

  scheduleTelemetryMaintenance();
  scheduleZhiDailyReview();
  scheduleCompanionDailyReports();
});
