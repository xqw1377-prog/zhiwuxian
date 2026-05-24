/** v3.5 / 扩展 API 统一信封解析 */
export function unwrapEnvelope<T>(json: unknown): T {
  const j = json as { data?: T };
  return (j?.data ?? json) as T;
}

export const API_V35_PREFIX = '/api/v3.5';
export const API_V35_ZHI_PREFIX = '/api/v3.5/zhi';
