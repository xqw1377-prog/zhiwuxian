import { describe, it, expect } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

function mockReq(overrides?: Partial<Request>): Request {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    method: 'POST',
    originalUrl: '/test',
    url: '/test',
    ...overrides,
  } as unknown as Request;
}

function mockRes() {
  return {} as Response;
}

describe('validate middleware (integration)', () => {
  describe('validateBody', () => {
    it('passes valid body through', async () => {
      const mod = await import('../server/middleware/validate');
      const schema = z.object({ name: z.string(), age: z.number() });
      const req = mockReq({ body: { name: 'Alice', age: 30 } });
      let nextCalled = false;
      mod.validateBody(schema)(req, mockRes(), (err?: unknown) => {
        nextCalled = true;
        expect(err).toBeUndefined();
      });
      expect(nextCalled).toBe(true);
      expect(req.body).toEqual({ name: 'Alice', age: 30 });
    });

    it('rejects invalid body', async () => {
      const mod = await import('../server/middleware/validate');
      const schema = z.object({ name: z.string(), age: z.number() });
      const req = mockReq({ body: { name: 42, age: 'old' } });
      let errReceived: unknown = undefined;
      mod.validateBody(schema)(req, mockRes(), (err?: unknown) => {
        errReceived = err;
      });
      expect(errReceived).toBeDefined();
      expect(errReceived).toBeInstanceOf(Error);
      expect((errReceived as Error).message).toContain('name');
    });

    it('rejects missing required fields', async () => {
      const mod = await import('../server/middleware/validate');
      const schema = z.object({ email: z.string().email() });
      const req = mockReq({ body: {} });
      let errReceived: unknown = undefined;
      mod.validateBody(schema)(req, mockRes(), (err?: unknown) => {
        errReceived = err;
      });
      expect(errReceived).toBeDefined();
      expect((errReceived as Error).message).toContain('email');
    });
  });

  describe('validateQuery', () => {
    it('passes valid query through', async () => {
      const mod = await import('../server/middleware/validate');
      const schema = z.object({ limit: z.coerce.number().optional() });
      const req = mockReq({ query: { limit: '10' } });
      let nextCalled = false;
      mod.validateQuery(schema)(req, mockRes(), (err?: unknown) => {
        nextCalled = true;
        expect(err).toBeUndefined();
      });
      expect(nextCalled).toBe(true);
    });

    it('rejects invalid query', async () => {
      const mod = await import('../server/middleware/validate');
      const schema = z.object({ limit: z.coerce.number().min(1).max(100) });
      const req = mockReq({ query: { limit: '-1' } });
      let errReceived: unknown = undefined;
      mod.validateQuery(schema)(req, mockRes(), (err?: unknown) => {
        errReceived = err;
      });
      expect(errReceived).toBeDefined();
    });
  });

  describe('validateParams', () => {
    it('passes valid params through', async () => {
      const mod = await import('../server/middleware/validate');
      const schema = z.object({ userId: z.string().min(1) });
      const req = mockReq({ params: { userId: 'u-test-123' } });
      let nextCalled = false;
      mod.validateParams(schema)(req, mockRes(), (err?: unknown) => {
        nextCalled = true;
        expect(err).toBeUndefined();
      });
      expect(nextCalled).toBe(true);
    });

    it('rejects empty params', async () => {
      const mod = await import('../server/middleware/validate');
      const schema = z.object({ userId: z.string().min(1) });
      const req = mockReq({ params: { userId: '' } });
      let errReceived: unknown = undefined;
      mod.validateParams(schema)(req, mockRes(), (err?: unknown) => {
        errReceived = err;
      });
      expect(errReceived).toBeDefined();
    });
  });
});
