/**
 * WUXIAN · SVG HTTP 响应（安全头 + 输出校验）
 */

import type { Response } from 'express';
import { assertSafeSvgOutput } from '../engine/core/svg-safe';

export function sendSvgPoster(
  res: Response,
  svg: string,
  filename: string,
  options?: { cacheSeconds?: number },
): void {
  assertSafeSvgOutput(svg);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; script-src 'none'",
  );
  res.setHeader('Content-Disposition', `inline; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  if (options?.cacheSeconds && options.cacheSeconds > 0) {
    res.setHeader('Cache-Control', `private, max-age=${Math.floor(options.cacheSeconds)}`);
  } else {
    res.setHeader('Cache-Control', 'private, no-store');
  }
  res.status(200).end(svg);
}
