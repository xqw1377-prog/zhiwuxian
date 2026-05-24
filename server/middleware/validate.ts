/**
 * WUXIAN · Zod 请求校验中间件
 */

import type { Request, Response, NextFunction } from 'express';
import type { ZodTypeAny } from 'zod';
import { ValidationError } from '../errors';

function formatZodError(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  return err.issues.map(i => {
    const path = i.path.length ? i.path.join('.') : 'body';
    return `${path}: ${i.message}`;
  }).join('; ');
}

export function validateBody<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new ValidationError(formatZodError(parsed.error)));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      next(new ValidationError(formatZodError(parsed.error)));
      return;
    }
    (req as unknown as { _wuxianQuery?: unknown })._wuxianQuery = parsed.data;
    const target = req.query as unknown as Record<string, unknown>;
    if (target && typeof target === 'object') {
      for (const k of Object.keys(target)) delete target[k];
      Object.assign(target, parsed.data);
    }
    next();
  };
}

export function validateParams<T extends ZodTypeAny>(schema: T) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.params);
    if (!parsed.success) {
      next(new ValidationError(formatZodError(parsed.error)));
      return;
    }
    req.params = parsed.data as typeof req.params;
    next();
  };
}
