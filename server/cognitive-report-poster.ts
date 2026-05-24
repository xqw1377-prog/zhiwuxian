/**
 * WUXIAN · 认知诊断证书霓虹海报 SVG
 */

import { clampSvgNumber, escSvgText, sanitizeSvgUserText } from '../engine/core/svg-safe';

export interface CertificateData {
  userId: string;
  ilPeak: number;
  psPeak: number;
  resilienceDensity: number;
  summaryText: string;
  generatedAt?: string;
}

function pct(v: number): string {
  return `${Math.round(clampSvgNumber(v, 0, 1) * 100)}%`;
}

export function renderCognitiveCertificateSvg(data: CertificateData): string {
  const w = 1080;
  const h = 1350;
  const tsDisplay = escSvgText((data.generatedAt ?? new Date().toISOString()).slice(0, 10));
  const shortId = escSvgText(data.userId.slice(0, 16).toUpperCase());
  const summary = sanitizeSvgUserText(data.summaryText, 500);

  const metrics = [
    { label: '直觉跳跃 IL', value: data.ilPeak, color: '#39ff14' },
    { label: '模式敏感 PS', value: data.psPeak, color: '#00f0ff' },
    { label: '韧性密度 RD', value: data.resilienceDensity, color: '#a78bfa' },
  ];

  const bars = metrics.map((m, i) => {
    const y = 720 + i * 120;
    const barW = 680 * clampSvgNumber(m.value, 0, 1);
    return `
      <text x="120" y="${y}" fill="rgba(226,232,240,0.85)" font-size="24" font-family="ui-monospace, monospace">${escSvgText(m.label)}</text>
      <rect x="120" y="${y + 16}" width="680" height="18" rx="9" fill="rgba(255,255,255,0.06)"/>
      <rect x="120" y="${y + 16}" width="${barW.toFixed(1)}" height="18" rx="9" fill="${m.color}" opacity="0.85"/>
      <text x="820" y="${y + 30}" fill="${m.color}" font-size="28" font-family="ui-monospace, monospace">${pct(m.value)}</text>
    `;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#050508"/>
      <stop offset="55%" stop-color="#0a1020"/>
      <stop offset="100%" stop-color="#050508"/>
    </linearGradient>
    <filter id="glow">
      <feGaussianBlur stdDeviation="4" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect x="40" y="40" width="${w - 80}" height="${h - 80}" rx="28" fill="none" stroke="rgba(57,255,20,0.35)" stroke-width="1"/>
  <rect x="48" y="48" width="${w - 96}" height="${h - 96}" rx="24" fill="none" stroke="rgba(0,240,255,0.12)" stroke-width="0.5"/>

  <text x="80" y="130" fill="rgba(57,255,20,0.9)" font-size="22" font-family="ui-monospace, monospace" letter-spacing="6">WUXIAN // PURE ToC</text>
  <text x="80" y="220" fill="#f8fafc" font-size="52" font-weight="800" font-family="system-ui, sans-serif">认知模态与直觉跳跃</text>
  <text x="80" y="280" fill="#f8fafc" font-size="52" font-weight="800" font-family="system-ui, sans-serif">天赋诊断证书</text>
  <text x="80" y="340" fill="rgba(148,163,184,0.95)" font-size="24" font-family="ui-monospace, monospace">LEARNER // ${shortId} · ${tsDisplay}</text>

  <g filter="url(#glow)">
    <circle cx="540" cy="500" r="140" fill="none" stroke="rgba(57,255,20,0.25)" stroke-width="1"/>
    <circle cx="540" cy="500" r="100" fill="none" stroke="rgba(0,240,255,0.2)" stroke-width="0.5"/>
    <text x="540" y="490" text-anchor="middle" fill="#39ff14" font-size="64" font-family="ui-monospace, monospace">${pct((data.ilPeak + data.psPeak) / 2)}</text>
    <text x="540" y="530" text-anchor="middle" fill="rgba(226,232,240,0.7)" font-size="20" font-family="ui-monospace, monospace">综合认知能级</text>
  </g>

  ${bars}

  <text x="80" y="1080" fill="rgba(226,232,240,0.88)" font-size="26" font-family="system-ui, sans-serif">${summary}</text>
  <text x="80" y="1180" fill="rgba(100,116,139,0.9)" font-size="20" font-family="ui-monospace, monospace">你负责专注，我负责重路由 · 零存储指针路由 · Edge Shield</text>
  <text x="80" y="1260" fill="rgba(57,255,20,0.75)" font-size="18" font-family="ui-monospace, monospace">#WUXIAN #虫洞跃迁 #自学外挂</text>
</svg>`;
}
