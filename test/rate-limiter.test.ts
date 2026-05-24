import { describe, it, expect } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

import {
  rateLimitGlobalApi,
  rateLimitAssimilate,
  rateLimitVideo,
  rateLimitPayment,
  rateLimitAuthBootstrap,
  rateLimitVideoUrlPayload,
} from '../server/middleware/rate-limiter';

function mockReq(overrides?: Partial<Request>): Request {
  const req = {
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    body: {},
    ...overrides,
  } as unknown as Request;
  (req as Record<string, unknown>).wuxianSession = undefined;
  return req;
}

function mockRes() {
  let _statusCode = 200;
  let _body: unknown = undefined;
  const _headers: Record<string, string> = {};
  return {
    get statusCode() { return _statusCode; },
    set statusCode(v: number) { _statusCode = v; },
    get body() { return _body; },
    get headers() { return _headers; },
    status(code: number) { _statusCode = code; return this; },
    json(data: unknown) { _body = data; return this; },
    setHeader(k: string, v: string) { _headers[k] = v; return this; },
    getHeader(k: string) { return _headers[k]; },
    end() { return this; },
  } as unknown as ReturnType<typeof mockRes>;
}

describe('rate-limiter', () => {
  describe('basic behavior', () => {
    it('allows requests under the limit and sets headers', async () => {
      const req = mockReq();
      const res = mockRes();
      let called = false;
      await new Promise<void>((resolve) => {
        rateLimitGlobalApi(req, res, () => { called = true; resolve(); });
      });
      expect(called).toBe(true);
      expect(res.headers['X-RateLimit-Limit']).toBeDefined();
      expect(res.headers['X-RateLimit-Remaining']).toBeDefined();
    });

    it('accepts multiple requests within limit', async () => {
      const req = mockReq();
      for (let i = 0; i < 5; i++) {
        await new Promise<void>((resolve) => {
          rateLimitGlobalApi(req, mockRes(), () => resolve());
        });
      }
    });
  });

  describe('rateLimitVideoUrlPayload', () => {
    it('does not apply video limit for non-URL payloads', async () => {
      const req = mockReq({ body: { rawInput: '让我学学微积分' } });
      const res = mockRes();
      let called = false;
      await new Promise<void>((resolve) => {
        rateLimitVideoUrlPayload(req, res, () => { called = true; resolve(); });
      });
      expect(called).toBe(true);
    });
  });

  describe('client key scoping', () => {
    it('uses userId when session exists', async () => {
      const req = mockReq();
      (req as Record<string, unknown>).wuxianSession = { userId: 'u-test-scope', displayName: null, token: 'tok' };
      const res = mockRes();
      let called = false;
      await new Promise<void>((resolve) => {
        rateLimitGlobalApi(req, res, () => { called = true; resolve(); });
      });
      expect(called).toBe(true);
    });
  });

  describe('all limiters are exported', () => {
    it('exports all rate limiters', () => {
      expect(rateLimitGlobalApi).toBeDefined();
      expect(rateLimitAssimilate).toBeDefined();
      expect(rateLimitVideo).toBeDefined();
      expect(rateLimitPayment).toBeDefined();
      expect(rateLimitAuthBootstrap).toBeDefined();
      expect(rateLimitVideoUrlPayload).toBeDefined();
    });
  });

  describe('rateLimitVideo returns 429 when exceeded', () => {
    it('blocks when limit is exceeded for video route', async () => {
      const uniqueIp = `10.0.0.${Math.floor(Math.random() * 10000)}`;
      const req = mockReq({ ip: uniqueIp, socket: { remoteAddress: uniqueIp } });

      // Default VIDEO_MAX is 6 per minute. Exhaust it.
      for (let i = 0; i < 6; i++) {
        await new Promise<void>((resolve) => {
          rateLimitVideo(req, mockRes(), () => resolve());
        });
      }

      // 7th request should get 429
      const res = mockRes();
      rateLimitVideo(req, res, () => { /* should not be called */ });

      expect(res.statusCode).toBe(429);
      expect(res.headers['Retry-After']).toBeDefined();
    });
  });
});
