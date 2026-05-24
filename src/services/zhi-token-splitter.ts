/**
 * WUXIAN · 【ZHI】生命能量分流阀
 * 基础逻辑细胞核 (CORE_LOGIC) vs 重型深度推理核 (DEEP_REASONING)
 */

import {
  ensureLifeLedger,
  listEnergyFlowHistory,
  topUpLifeTokens,
  type EnergyFlowRow,
  type LifeMatrixLedger,
  type TargetBattle,
  type TokenTypeUsed,
} from '../db/life-ledger-schema';
import { getLearningDb } from '../../server/wuxian-learning-db';
import type { BillingReason } from './billing-hub';

export type EnergyIntensity = 'LIGHTWEIGHT' | 'INTENSIVE';

export const TOKEN_COST = {
  CORE_LIGHTWEIGHT: 2000,
  DEEP_INTENSIVE: 15,
  ESCAPE_FREEZE: 2000,
} as const;

export interface SiphonResult {
  success: boolean;
  remainingCore?: number;
  remainingDeep?: number;
  frozenPunish?: number;
  tokenTypeUsed?: TokenTypeUsed;
  cost?: number;
  flowId?: string;
  errorMsg?: string;
}

export interface TokenLedgerView {
  userId: string;
  coreLogicTokens: number;
  deepReasoningTokens: number;
  frozenPunishTokens: number;
  lastBreathTime: number;
  corePercent: number;
  deepPercent: number;
  recentFlows: EnergyFlowRow[];
}

const REASON_SPLIT_MAP: Record<
  string,
  { battle: TargetBattle; intensity: EnergyIntensity; desc: string }
> = {
  GHOST_BLIND: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'LIGHTWEIGHT',
    desc: 'AP · Option+Space 屏幕物理残影拦截',
  },
  MENTOR_INTERVENTION: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'LIGHTWEIGHT',
    desc: 'AP · ZHI 轻量因果焊接',
  },
  VISION_INTERCEPT: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'LIGHTWEIGHT',
    desc: 'AP · 卡点文本/视觉解构',
  },
  METRICS_COMPILE: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'LIGHTWEIGHT',
    desc: 'AP · 航标因果矩阵编译',
  },
  SHADOW_SPAR: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'INTENSIVE',
    desc: 'AP · 影子变式题多模态突变',
  },
  SHADOW_FAIL_RELOAD: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'INTENSIVE',
    desc: 'AP · 影子题解析重载',
  },
  SHADOW_VERIFY: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'INTENSIVE',
    desc: 'AP · 影子推导深度验证',
  },
  LANGUAGE_EVAL: {
    battle: 'TOEFL_LANGUAGE_MATRIX',
    intensity: 'INTENSIVE',
    desc: '托福/雅思 · 口语写作深度物理切片',
  },
  LANGUAGE_SHADOW: {
    battle: 'TOEFL_LANGUAGE_MATRIX',
    intensity: 'INTENSIVE',
    desc: '托福/雅思 · 影子句重录深度验证',
  },
  VIDEO_CHECKPOINT: {
    battle: 'VIDEO_LEARN',
    intensity: 'LIGHTWEIGHT',
    desc: '视频陪看 · 章节卡点掌握度',
  },
  VIDEO_CHECKPOINT_EVAL: {
    battle: 'VIDEO_LEARN',
    intensity: 'LIGHTWEIGHT',
    desc: '视频陪看 · 章节卡点批改',
  },
  CAUSAL_REPORT: {
    battle: 'EVOLUTION_MATRIX',
    intensity: 'LIGHTWEIGHT',
    desc: '因果汇报 · 计划修正入账',
  },
  DAILY_REVIEW: {
    battle: 'EVOLUTION_MATRIX',
    intensity: 'LIGHTWEIGHT',
    desc: '每日复盘 · 梦校进度校准',
  },
  ASSESSMENT_GENERATE: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'LIGHTWEIGHT',
    desc: '学习评估 · AI 出卷',
  },
  ASSESSMENT_EVAL: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'INTENSIVE',
    desc: '学习评估 · 答卷清算',
  },
  FULL_MOCK_EXAM: {
    battle: 'TOEFL_LANGUAGE_MATRIX',
    intensity: 'INTENSIVE',
    desc: '托福/雅思 · 全真模考多模态清算',
  },
  ESCAPE_PENALTY: {
    battle: 'AP_KNOWLEDGE_FORGE',
    intensity: 'LIGHTWEIGHT',
    desc: '认知逃避 · 逻辑单元冻结惩罚',
  },
};

function flowId(): string {
  return `FLOW_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export class ZhiTokenSplitter {
  /**
   * 智无限生命体：Token 分离清算判定
   */
  static siphonEnergy(
    userId: string,
    battle: TargetBattle,
    intensity: EnergyIntensity,
    actionDesc: string,
    options?: { costOverride?: number; applyFreeze?: boolean },
  ): SiphonResult {
    const uid = userId.trim();
    if (!uid) {
      return { success: false, errorMsg: '缺少 userId' };
    }

    const matrix = ensureLifeLedger(uid);

    let tokenType: TokenTypeUsed = 'CORE_LOGIC';
    let cost: number = TOKEN_COST.CORE_LIGHTWEIGHT;

    if (intensity === 'INTENSIVE') {
      tokenType = 'DEEP_REASONING';
      cost = options?.costOverride ?? TOKEN_COST.DEEP_INTENSIVE;
      if (matrix.deep_reasoning_tokens < cost) {
        return {
          success: false,
          errorMsg: '重型深度推理核已熔断，ZHI 无法启动高维多模态审判。',
          remainingCore: matrix.core_logic_tokens,
          remainingDeep: matrix.deep_reasoning_tokens,
        };
      }
    } else {
      cost = options?.costOverride ?? TOKEN_COST.CORE_LIGHTWEIGHT;
      if (matrix.core_logic_tokens < cost) {
        return {
          success: false,
          errorMsg: '基础逻辑细胞核能量耗尽，请及时注入算力补充包。',
          remainingCore: matrix.core_logic_tokens,
          remainingDeep: matrix.deep_reasoning_tokens,
        };
      }
    }

    const id = flowId();
    const now = Date.now();
    const db = getLearningDb();

    const tx = db.transaction(() => {
      if (tokenType === 'CORE_LOGIC') {
        db.prepare(`
          UPDATE zhi_life_matrix_ledger
          SET core_logic_tokens = core_logic_tokens - ?, last_breath_time = ?
          WHERE user_id = ?
        `).run(cost, now, uid);
      } else {
        db.prepare(`
          UPDATE zhi_life_matrix_ledger
          SET deep_reasoning_tokens = deep_reasoning_tokens - ?, last_breath_time = ?
          WHERE user_id = ?
        `).run(cost, now, uid);
      }

      db.prepare(`
        INSERT INTO zhi_energy_flow_history
          (flow_id, user_id, target_battle, token_type_used, amount_changed, action_description, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, uid, battle, tokenType, -cost, actionDesc.slice(0, 200), now);

      if (
        options?.applyFreeze ||
        (intensity === 'LIGHTWEIGHT' && (actionDesc.includes('逃避') || actionDesc.includes('冻结')))
      ) {
        db.prepare(`
          UPDATE zhi_life_matrix_ledger
          SET frozen_punish_tokens = frozen_punish_tokens + ?
          WHERE user_id = ?
        `).run(TOKEN_COST.ESCAPE_FREEZE, uid);
      }
    });

    tx();

    const updated = ensureLifeLedger(uid);
    return {
      success: true,
      remainingCore: updated.core_logic_tokens,
      remainingDeep: updated.deep_reasoning_tokens,
      frozenPunish: updated.frozen_punish_tokens,
      tokenTypeUsed: tokenType,
      cost,
      flowId: id,
    };
  }

  static siphonForBillingReason(
    userId: string,
    reason: BillingReason,
    actionDescOverride?: string,
  ): SiphonResult {
    const key = String(reason).toUpperCase();
    const mapped = REASON_SPLIT_MAP[key] ?? REASON_SPLIT_MAP.MENTOR_INTERVENTION;
    return this.siphonEnergy(
      userId,
      mapped.battle,
      mapped.intensity,
      actionDescOverride ?? mapped.desc,
    );
  }

  static getLedgerView(userId: string, flowLimit = 12): TokenLedgerView {
    const ledger = ensureLifeLedger(userId);
    const coreCap = 100_000;
    const deepCap = 5_000;
    return {
      userId: ledger.user_id,
      coreLogicTokens: ledger.core_logic_tokens,
      deepReasoningTokens: ledger.deep_reasoning_tokens,
      frozenPunishTokens: ledger.frozen_punish_tokens,
      lastBreathTime: ledger.last_breath_time,
      corePercent: Math.min(100, (ledger.core_logic_tokens / coreCap) * 100),
      deepPercent: Math.min(100, (ledger.deep_reasoning_tokens / deepCap) * 100),
      recentFlows: listEnergyFlowHistory(userId, flowLimit),
    };
  }

  static injectEnergyPack(
    userId: string,
    pack: 'CORE' | 'DEEP' | 'BALANCED',
  ): TokenLedgerView {
    if (pack === 'CORE') topUpLifeTokens(userId, 20_000, 0);
    else if (pack === 'DEEP') topUpLifeTokens(userId, 0, 500);
    else topUpLifeTokens(userId, 10_000, 250);
    return this.getLedgerView(userId);
  }
}
