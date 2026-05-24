/** WUXIAN · 管理员鉴权中间件 */

import type { Request, Response, NextFunction } from 'express';
import { isAdminUser, isUserBanned } from '../routes/auth.routes';
import { ForbiddenError, UnauthorizedError } from '../errors';

declare global {
  namespace Express {
    interface Request {
      wuxianAdmin?: boolean;
    }
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.wuxianSession?.userId;
  if (!userId) throw new UnauthorizedError('未登录');
  if (isUserBanned(userId)) throw new ForbiddenError('账号已被封禁');
  if (!isAdminUser(userId)) throw new ForbiddenError('需要管理员权限');
  req.wuxianAdmin = true;
  next();
}

export function optionalAdmin(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.wuxianSession?.userId;
  if (userId && isAdminUser(userId) && !isUserBanned(userId)) {
    req.wuxianAdmin = true;
  }
  next();
}
