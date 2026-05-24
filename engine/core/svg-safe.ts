/**
 * WUXIAN · SVG 输出安全（防 XSS / 注入）
 * 所有用户可控文本进入 SVG 前须经 escSvgText / sanitizeSvgUserText
 */

const DANGEROUS_URI = /(?:javascript|vbscript|data)\s*:/gi;
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

/** 文本节点 / &lt;tspan&gt; 内容 */
export function escSvgText(text: string): string {
  return String(text ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 属性值（如 id、href） */
export function escSvgAttr(text: string): string {
  return escSvgText(text).replace(/`/g, '&#96;');
}

/** 用户摘要等长文本：截断 + 去危险 URI 片段 */
export function sanitizeSvgUserText(text: string, maxLen = 600): string {
  let s = String(text ?? '').replace(CONTROL_CHARS, '').replace(DANGEROUS_URI, '');
  if (s.length > maxLen) s = `${s.slice(0, maxLen)}…`;
  return escSvgText(s);
}

export function clampSvgNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

const FORBIDDEN_SVG_PATTERNS = [
  /<script\b/i,
  /<foreignObject\b/i,
  /xlink:href\s*=\s*["']\s*javascript/i,
  /<iframe\b/i,
  /<embed\b/i,
  /<object\b/i,
  /\shref\s*=\s*["']\s*javascript/i,
];

/** 渲染完成后断言（开发/E2E）；生产路由在写出前调用 */
export function assertSafeSvgOutput(svg: string): void {
  for (const re of FORBIDDEN_SVG_PATTERNS) {
    if (re.test(svg)) {
      throw new Error(`SVG 安全校验失败: ${re.source}`);
    }
  }
}
