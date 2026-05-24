/**
 * WUXIAN · SVG 海报 XSS 回归（纯本地，无需启动服务）
 * 运行：npx tsx scripts/e2e-svg-security.ts
 */

import { renderCognitiveCertificateSvg } from '../server/cognitive-report-poster';
import { renderRadarPosterSvg } from '../engine/core/radar-poster';
import { assertSafeSvgOutput } from '../engine/core/svg-safe';
import type { RadarCardReport } from '../engine/core/radar-report';

const XSS = '<script>alert(1)</script><img src=x onerror=alert(1)> javascript:alert(1)';

function ok(name: string) {
  console.log(`✅ ${name}`);
}

function main() {
  const cert = renderCognitiveCertificateSvg({
    userId: 'user"><script',
    ilPeak: 0.9,
    psPeak: 0.8,
    resilienceDensity: 0.7,
    summaryText: XSS,
    generatedAt: '2026-01-01T00:00:00.000Z',
  });
  if (cert.includes('<script')) throw new Error('认知证书 SVG 仍含 script');
  assertSafeSvgOutput(cert);
  ok('认知证书 SVG 转义 + assertSafeSvgOutput');

  const radarReport: RadarCardReport = {
    userId: 'evil" onload="alert(1)',
    windowDays: 30,
    axes: [
      { label: '<b>IL</b>', value: 0.5 },
      { label: 'PS & drop', value: 0.6 },
    ],
    highlights: [XSS, '第二行<script>'],
    evidence: [{ type: 'TELEMETRY', ts: '2026-01-01T00:00:00Z', summary: XSS }],
    generatedAt: '2026-01-01T00:00:00.000Z',
  };
  const radar = renderRadarPosterSvg(radarReport);
  if (radar.includes('<script')) throw new Error('雷达 SVG 仍含 script');
  assertSafeSvgOutput(radar);
  ok('雷达海报 SVG 转义 + assertSafeSvgOutput');

  console.log('\n2/2 passed\n');
}

main();
