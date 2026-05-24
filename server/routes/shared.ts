/**
 * WUXIAN · 路由共享工具
 */

import type { Application, Request, Response, NextFunction } from 'express';
import { isTocOnlyMode } from '../toc-manifest';

export function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}

export function sendSuccess(res: Response, data: unknown): void {
  const maybe = data as { code?: number; status?: string; data?: unknown } | null;
  if (maybe && typeof maybe === 'object' && maybe.code === 200 && maybe.status === 'SUCCESS' && 'data' in maybe) {
    res.json(maybe);
    return;
  }
  res.json({ code: 200, status: 'SUCCESS', data });
}

export function wrap(handler: (req: Request, res: Response) => void | Promise<void>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await handler(req, res);
    } catch (err) {
      next(err);
    }
  };
}

export function blockTocB2B(_req: Request, res: Response): void {
  res.status(404).json({
    code: 404,
    error: 'NOT_FOUND',
    message: '纯 ToC 模式：此能力已收敛。请使用 /lab 进化实验室或 /wuxian 学习加速器。',
  });
}

export function tocGate(handler: (req: Request, res: Response) => void | Promise<void>) {
  return wrap((req, res) => {
    if (isTocOnlyMode()) {
      blockTocB2B(req, res);
      return;
    }
    return handler(req, res);
  });
}

export type RouteRegistrar = (app: Application) => void;
