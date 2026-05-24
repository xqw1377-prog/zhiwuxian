/**
 * 生产 / 商用启动前配置校验（在 listen 前调用）
 */

function hasLlmKey(): boolean {
  return Boolean(
    process.env.DEEPSEEK_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim(),
  );
}

function hasVisionKey(): boolean {
  return Boolean(process.env.QWEN_API_KEY?.trim() || process.env.DASHSCOPE_API_KEY?.trim());
}

export type ReadinessIssue = { level: 'error' | 'warn'; code: string; message: string };

export function collectProductionReadinessIssues(): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const prod = process.env.NODE_ENV === 'production';

  if (prod && ['1', 'true'].includes((process.env.WUXIAN_AUTH_RELAXED ?? '').trim().toLowerCase())) {
    issues.push({
      level: 'error',
      code: 'AUTH_RELAXED',
      message: '生产环境禁止 WUXIAN_AUTH_RELAXED=1',
    });
  }

  if (!hasLlmKey()) {
    issues.push({
      level: 'warn',
      code: 'LLM_KEY_MISSING',
      message: '未配置平台 LLM Key（DEEPSEEK_API_KEY / OPENAI_API_KEY）。若你采用“用户自填 Key 落库”，可忽略；否则将大量降级为模板模式。',
    });
  }

  if (!hasVisionKey()) {
    issues.push({
      level: 'warn',
      code: 'VISION_KEY_MISSING',
      message: '未配置平台视觉 Key（QWEN_API_KEY / DASHSCOPE_API_KEY）。若你采用“用户自填 Key 落库”，可忽略；否则视觉将回退文本/启发式。',
    });
  }

  const paymentMode = (process.env.WUXIAN_PAYMENT_MODE ?? 'simulate').trim().toLowerCase();
  if (paymentMode === 'live') {
    const secret = process.env.WUXIAN_PAYMENT_WEBHOOK_SECRET?.trim();
    if (!secret || secret === 'dev-local-secret') {
      issues.push({
        level: 'error',
        code: 'PAYMENT_WEBHOOK',
        message: 'WUXIAN_PAYMENT_MODE=live 时必须设置强随机 WUXIAN_PAYMENT_WEBHOOK_SECRET',
      });
    }
  } else if (prod) {
    issues.push({
      level: 'warn',
      code: 'PAYMENT_SIMULATE',
      message: '生产 NODE_ENV 下 WUXIAN_PAYMENT_MODE 仍为 simulate，商用收款未启用',
    });
  }

  if (prod && !process.env.WUXIAN_CORS_ORIGIN?.trim()) {
    issues.push({
      level: 'warn',
      code: 'CORS_ORIGIN',
      message: '建议设置 WUXIAN_CORS_ORIGIN 为前端正式域名',
    });
  }

  return issues;
}

export function assertProductionReadiness(): void {
  const issues = collectProductionReadinessIssues();
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  for (const w of warns) {
    console.warn(`[WUXIAN Readiness] WARN ${w.code}: ${w.message}`);
  }
  if (errors.length) {
    for (const e of errors) {
      console.error(`[WUXIAN Readiness] ERROR ${e.code}: ${e.message}`);
    }
    throw new Error(`生产配置未通过 (${errors.length} 项错误)，见上方 Readiness 日志`);
  }
}
