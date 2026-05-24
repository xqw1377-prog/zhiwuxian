import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const ORIGINAL_ENV = { ...process.env };

let mod: typeof import('../server/middleware/session-auth');

beforeAll(async () => {
  process.env.NODE_ENV = 'production';
  delete process.env.WUXIAN_AUTH_RELAXED;
  mod = await import('../server/middleware/session-auth');
});

afterAll(() => {
  process.env = { ...ORIGINAL_ENV };
});

function mockReq(overrides?: Partial<Request>): Request {
  return {
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    body: {},
    method: 'GET',
    originalUrl: '/api/v3.5/zhi/progress-dashboard/u-test',
    url: '/api/v3.5/zhi/progress-dashboard/u-test',
    params: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function createMockRes() {
  let _statusCode = 200;
  let _body: unknown = undefined;
  return {
    get statusCode() { return _statusCode; },
    set statusCode(v: number) { _statusCode = v; },
    get body() { return _body; },
    status(code: number) { _statusCode = code; return this; },
    json(data: unknown) { _body = data; return this; },
    setHeader() { return this; },
    getHeader() { return undefined; },
    end() { return this; },
    send(data: unknown) { _body = data; return this; },
  } as unknown as Response & { statusCode: number; body: unknown };
}

describe('session-auth', () => {
  describe('isAuthRelaxed', () => {
    it('returns false in production', () => {
      expect(process.env.NODE_ENV).toBe('production');
      expect(mod.isAuthRelaxed()).toBe(false);
    });
  });

  describe('enforceSessionAuth', () => {
    it('rejects unauthenticated requests to protected v3.5 routes', () => {
      const req = mockReq({
        method: 'GET',
        originalUrl: '/api/v3.5/zhi/progress-dashboard/u-test',
        url: '/api/v3.5/zhi/progress-dashboard/u-test',
        headers: {},
      });
      const res = createMockRes();
      let called = false;

      // Verify conditions before the call
      const path = (req.originalUrl || req.url || '').split('?')[0];
      expect(path.startsWith('/api/v3.5/')).toBe(true);
      expect(mod.isAuthRelaxed()).toBe(false);

      mod.enforceSessionAuth(req, res, () => { called = true; });
      expect(res.statusCode).toBe(401);
      expect(called).toBe(false);
    });

    it('allows public routes', () => {
      const req = mockReq({
        method: 'POST',
        originalUrl: '/api/v1/auth/bootstrap',
        url: '/api/v1/auth/bootstrap',
        headers: {},
      });
      const res = createMockRes();
      let called = false;
      mod.enforceSessionAuth(req, res, () => { called = true; });
      expect(called).toBe(true);
    });

    it('allows health endpoint', () => {
      const req = mockReq({
        method: 'GET',
        originalUrl: '/api/health',
        url: '/api/health',
        headers: {},
      });
      const res = createMockRes();
      let called = false;
      mod.enforceSessionAuth(req, res, () => { called = true; });
      expect(called).toBe(true);
    });
  });

  describe('extractBearerToken', () => {
    it('extracts Bearer token', () => {
      const req = mockReq({ headers: { authorization: 'Bearer tok-123' } });
      expect(mod.extractBearerToken(req)).toBe('tok-123');
    });

    it('returns null when no auth header', () => {
      const req = mockReq({ headers: {} });
      expect(mod.extractBearerToken(req)).toBe(null);
    });
  });

  describe('attachSession', () => {
    it('calls next without token', () => {
      const req = mockReq({ headers: {} });
      let called = false;
      mod.attachSession(req, createMockRes(), () => { called = true; });
      expect(called).toBe(true);
    });
  });

  describe('resolveTrustedUserId', () => {
    it('returns userId from session', () => {
      const req = mockReq();
      (req as Record<string, unknown>).wuxianSession = { userId: 'u-session', displayName: null, token: 'tok' };
      expect(mod.resolveTrustedUserId(req)).toBe('u-session');
    });
  });

  describe('assertTrustedUserId', () => {
    it('passes when userId matches session', () => {
      const req = mockReq();
      (req as Record<string, unknown>).wuxianSession = { userId: 'u-match', displayName: null, token: 'tok' };
      expect(() => mod.assertTrustedUserId(req, 'u-match')).not.toThrow();
    });

    it('throws when no session', () => {
      const req = mockReq();
      expect(() => mod.assertTrustedUserId(req, 'u-any')).toThrow();
    });
  });
});
