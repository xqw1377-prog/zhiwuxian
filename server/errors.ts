/**
 * WUXIAN · 类型化错误系统
 */

const SQLITE_HINT = /SQLITE|no such table|no such column|FOREIGN KEY|UNIQUE constraint/i;

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    super(404, 'NOT_FOUND', id ? `${entity} not found: ${id}` : `${entity} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, 'VALIDATION_ERROR', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = '需要登录或会话已失效') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = '无权访问该资源') {
    super(403, 'FORBIDDEN', message);
  }
}

export class UsageLimitError extends AppError {
  constructor(message: string) {
    super(429, 'USAGE_LIMIT', message);
  }
}

export class ConsentRequiredError extends AppError {
  constructor(category: string) {
    super(403, 'CONSENT_REQUIRED', `需要先授权数据类别: ${category}`);
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message: string) {
    super(402, 'PAYMENT_REQUIRED', message);
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error') {
    super(500, 'INTERNAL_ERROR', message);
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** 生产环境不向客户端泄露 SQL / 堆栈等内部细节 */
export function sanitizePublicErrorMessage(message: string): string {
  if (!isProduction()) return message;
  if (SQLITE_HINT.test(message)) {
    return '服务暂时不可用，请稍后重试';
  }
  if (/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up/i.test(message)) {
    return '上游服务暂时不可用';
  }
  if (message.length > 160) {
    return '服务暂时不可用，请稍后重试';
  }
  return '服务暂时不可用，请稍后重试';
}

export function handleError(err: unknown): { status: number; body: { code: string; error: string; detail?: unknown } } {
  if (err instanceof AppError) {
    return {
      status: err.statusCode,
      body: { code: err.code, error: err.message, detail: err.detail },
    };
  }

  const rawMessage = err instanceof Error ? err.message : 'Internal server error';
  console.error('[WUXIAN Error]', err);

  return {
    status: 500,
    body: {
      code: 'INTERNAL_ERROR',
      error: sanitizePublicErrorMessage(rawMessage),
    },
  };
}
