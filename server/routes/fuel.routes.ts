import type { Application } from 'express';
import { wrap, sendSuccess } from './shared';
import { validateBody } from '../middleware/validate';
import { resolveTrustedUserId } from '../middleware/session-auth';
import { requireAdmin } from '../middleware/admin-auth';
import { z } from 'zod';
import { FUEL_TASK_POLICY, type FuelTaskType } from '../../src/services/llm-fuel-gateway';
import { createWarpActivationCodes, redeemWarpActivationCode } from '../../src/db/warp-activation-schema';

type FuelCatalogItem = {
  taskType: FuelTaskType;
  title: string;
  costWarp: number;
  maxTokens: number;
  channel: 'text' | 'vision';
};

const TITLES: Record<FuelTaskType, string> = {
  CHAT_LIGHT: '轻量对话',
  ROUTE_REROUTE: '重路由/计划重算',
  VISION_INTERCEPT: '视觉拦截（卡点提取）',
  VISION_INTAKE: '摄影建档（试卷/教材）',
  VISION_RELAY: '视觉中继（概念提取）',
  VISION_SOLVE: '拍照解题',
  SHADOW_SPAR_MUTATE: '影子肉搏（出题）',
  SHADOW_SPAR_VERIFY: '影子肉搏（裁判）',
};

function buildCatalog(): FuelCatalogItem[] {
  const keys = Object.keys(FUEL_TASK_POLICY) as FuelTaskType[];
  return keys.map((taskType) => {
    const p = FUEL_TASK_POLICY[taskType];
    return {
      taskType,
      title: TITLES[taskType] ?? taskType,
      costWarp: Number(p.cost ?? 0),
      maxTokens: Number(p.maxTokens ?? 0),
      channel: p.channel,
    };
  });
}

export function registerFuelRoutes(app: Application): void {
  app.get('/api/v1/fuel/catalog', wrap((_req, res) => {
    sendSuccess(res, {
      domesticDefault: { text: 'deepseek', vision: 'qwen' },
      currency: 'WARP',
      items: buildCatalog(),
    });
  }));

  app.post('/api/v1/fuel/activate', validateBody(z.object({
    code: z.string().min(6).max(80),
  })), wrap((req, res) => {
    const userId = resolveTrustedUserId(req);
    const { code } = req.body as { code: string };
    const result = redeemWarpActivationCode({ userId, code });
    sendSuccess(res, result);
  }));

  app.post('/api/v1/fuel/activation/create', requireAdmin, validateBody(z.object({
    warpAmount: z.number().int().min(1).max(500_000),
    count: z.number().int().min(1).max(5000),
    expiresInDays: z.number().int().min(1).max(3650).optional(),
  })), wrap((req, res) => {
    const body = req.body as { warpAmount: number; count: number; expiresInDays?: number };
    const expiresAtSec = body.expiresInDays
      ? Math.floor(Date.now() / 1000) + Math.floor(body.expiresInDays) * 86400
      : 0;
    const codes = createWarpActivationCodes({
      warpAmount: body.warpAmount,
      count: body.count,
      expiresAtSec,
    });
    sendSuccess(res, { codes });
  }));
}
