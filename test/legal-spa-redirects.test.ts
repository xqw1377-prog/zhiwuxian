import { describe, it, expect, afterEach } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import http from 'node:http';
import { LEGAL_SPA_REDIRECTS, registerLegalSpaRedirects } from '../server/legal-spa-redirects';
import { createExpressApp } from '../server/express-app';

describe('LEGAL_SPA_REDIRECTS', () => {
  it('包含隐私与用户协议路径', () => {
    expect(LEGAL_SPA_REDIRECTS['/privacy']).toBe('/#/privacy');
    expect(LEGAL_SPA_REDIRECTS['/terms']).toBe('/#/terms');
  });
});

const hasCockpitDist = existsSync(join(process.cwd(), 'web', 'dist', 'index.html'));

describe.skipIf(!hasCockpitDist)('legal SPA HTTP redirects', () => {
  let server: http.Server;
  let baseUrl = '';

  afterEach(() => {
    server?.close();
  });

  it('/privacy 与 /terms 返回 302 到 hash 路由', async () => {
    const app = createExpressApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('no listen address');
    baseUrl = `http://127.0.0.1:${addr.port}`;

    for (const [path, target] of Object.entries(LEGAL_SPA_REDIRECTS)) {
      const res = await fetch(`${baseUrl}${path}`, { redirect: 'manual' });
      expect(res.status, path).toBe(302);
      expect(res.headers.get('location'), path).toBe(target);
    }
  });
});

describe('registerLegalSpaRedirects', () => {
  it('在无 cockpit dist 时仍可注册路由', async () => {
    const express = await import('express');
    const app = express.default();
    registerLegalSpaRedirects(app);
    await new Promise<void>((resolve) => {
      const server = app.listen(0, '127.0.0.1', async () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          server.close();
          resolve();
          return;
        }
        const res = await fetch(`http://127.0.0.1:${addr.port}/privacy`, { redirect: 'manual' });
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/#/privacy');
        server.close(() => resolve());
      });
    });
  });
});
