import type { RadarCardReport } from './radar-report';
import { clampSvgNumber, escSvgAttr, escSvgText, sanitizeSvgUserText } from './svg-safe';

export function renderRadarPosterSvg(report: RadarCardReport): string {
  const w = 1080;
  const h = 1350;

  const cx = 540;
  const cy = 660;
  const r = 260;

  const axes = report.axes ?? [];
  const n = Math.max(3, axes.length);

  const angle0 = -Math.PI / 2;
  const pt = (i: number, value: number) => {
    const a = angle0 + (i * 2 * Math.PI) / n;
    const rr = r * Math.max(0, Math.min(1, value));
    return { x: cx + rr * Math.cos(a), y: cy + rr * Math.sin(a) };
  };

  const poly = axes.map((ax, i) => {
    const p = pt(i, ax.value);
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(' ');

  const rings = [0.25, 0.5, 0.75, 1].map(k => {
    const rr = r * k;
    return `<circle cx="${cx}" cy="${cy}" r="${rr}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  }).join('');

  const spokes = axes.map((_, i) => {
    const p = pt(i, 1);
    return `<line x1="${cx}" y1="${cy}" x2="${p.x.toFixed(2)}" y2="${p.y.toFixed(2)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>`;
  }).join('');

  const labels = axes.map((ax, i) => {
    const p = pt(i, 1);
    const dx = p.x - cx;
    const dy = p.y - cy;
    const lx = p.x + Math.sign(dx) * 18;
    const ly = p.y + Math.sign(dy) * 18;
    const anchor = dx >= 0 ? 'start' : 'end';
    const pct = `${Math.round(ax.value * 100)}%`;
    return [
      `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}" fill="rgba(226,232,240,0.78)" font-size="22" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace" text-anchor="${anchor}">${escSvgText(ax.label)}</text>`,
      `<text x="${lx.toFixed(2)}" y="${(ly + 26).toFixed(2)}" fill="rgba(0,240,255,0.92)" font-size="26" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace" text-anchor="${anchor}">${escSvgText(pct)}</text>`,
    ].join('');
  }).join('');

  const highlight1 = sanitizeSvgUserText(report.highlights?.[0] ?? '认知雷达已生成', 120);
  const highlight2 = sanitizeSvgUserText(report.highlights?.[1] ?? '', 120);
  const stamp = escSvgAttr(report.generatedAt ? report.generatedAt.slice(0, 19).replace('T', ' ') : '');
  const userTag = escSvgText(report.userId.slice(0, 16));
  const windowTag = escSvgText(String(report.windowDays));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#07080a"/>
      <stop offset="100%" stop-color="#06070a"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="rgba(0,240,255,0.10)"/>
      <stop offset="55%" stop-color="rgba(0,240,255,0.03)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
    <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#bg)"/>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#glow)"/>

  <g opacity="0.6">
    ${Array.from({ length: 28 }).map((_, i) => `<line x1="0" y1="${i * 48}" x2="${w}" y2="${i * 48}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`).join('')}
    ${Array.from({ length: 23 }).map((_, i) => `<line x1="${i * 48}" y1="0" x2="${i * 48}" y2="${h}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`).join('')}
  </g>

  <g>
    <rect x="80" y="88" width="${w - 160}" height="210" rx="14" fill="rgba(15,18,24,0.66)" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
    <text x="110" y="140" fill="rgba(226,232,240,0.52)" font-size="22" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace" letter-spacing="4">WUXIAN // RADAR</text>
    <text x="110" y="182" fill="rgba(226,232,240,0.92)" font-size="34" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,system-ui,sans-serif" font-weight="300">${highlight1}</text>
    <text x="110" y="224" fill="rgba(226,232,240,0.62)" font-size="26" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,system-ui,sans-serif" font-weight="300">${highlight2}</text>
    <text x="110" y="264" fill="rgba(0,240,255,0.88)" font-size="22" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">USER // ${userTag} · WINDOW // ${windowTag}d · ${stamp}</text>
  </g>

  <g>
    <rect x="80" y="330" width="${w - 160}" height="780" rx="18" fill="rgba(15,18,24,0.58)" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
    <g transform="translate(0,0)">
      ${rings}
      ${spokes}
      <polygon points="${poly}" fill="rgba(0,240,255,0.14)" stroke="rgba(0,240,255,0.82)" stroke-width="3" filter="url(#softGlow)"/>
      <circle cx="${cx}" cy="${cy}" r="5" fill="rgba(0,240,255,0.95)"/>
      ${labels}
    </g>
  </g>

  <g>
    <rect x="80" y="1140" width="${w - 160}" height="150" rx="14" fill="rgba(15,18,24,0.66)" stroke="rgba(255,255,255,0.10)" stroke-width="1"/>
    <text x="110" y="1195" fill="rgba(226,232,240,0.72)" font-size="22" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace" letter-spacing="2">EVIDENCE</text>
    ${(report.evidence ?? []).slice(0, 3).map((e, i) => {
      const y = 1235 + i * 32;
      const t = `${e.type} · ${e.ts.slice(0,19).replace('T',' ')} · ${e.summary}`;
      return `<text x="110" y="${y}" fill="rgba(226,232,240,0.62)" font-size="18" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace">${sanitizeSvgUserText(t, 200)}</text>`;
    }).join('')}
  </g>
</svg>`;
}
