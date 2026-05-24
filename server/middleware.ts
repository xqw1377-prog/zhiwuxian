/**
 * WUXIAN · 中间件链
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { AppError, handleError } from './errors';

export type Middleware = (req: IncomingMessage, res: ServerResponse) => boolean | Promise<boolean>;

export async function runMiddleware(req: IncomingMessage, res: ServerResponse, chain: Middleware[]): Promise<boolean> {
  for (const mw of chain) {
    const passed = await mw(req, res);
    if (!passed) return false;
  }
  return true;
}

export function readBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {} as T);
      } catch {
        reject(new AppError(400, 'INVALID_JSON', '请求体不是合法的 JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

export function sendHtml(res: ServerResponse, html: string): void {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

export function sendError(res: ServerResponse, err: unknown): void {
  const { status, body } = handleError(err);
  sendJson(res, status, body);
}

export function sendSuccess(res: ServerResponse, data: unknown): void {
  const maybeEnvelope = data as { code?: unknown; status?: unknown; data?: unknown } | null;
  if (
    maybeEnvelope
    && typeof maybeEnvelope === 'object'
    && typeof maybeEnvelope.code === 'number'
    && maybeEnvelope.status === 'SUCCESS'
    && 'data' in maybeEnvelope
  ) {
    sendJson(res, 200, maybeEnvelope);
    return;
  }
  sendJson(res, 200, { code: 200, status: 'SUCCESS', data });
}

// ── 中间件工厂 ──

export function cors(options: { origin?: string } = {}): Middleware {
  return (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', options.origin ?? '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Consent-Token');
    if (req.method === 'OPTIONS') {
      sendJson(res, 204, null);
      return false;
    }
    return true;
  };
}

export function logger(): Middleware {
  return (req) => {
    const method = req.method ?? 'GET';
    const url = req.url ?? '/';
    console.log(`[${new Date().toISOString()}] ${method} ${url}`);
    return true;
  };
}

export function contentType(mime: string): Middleware {
  return (req, res) => {
    res.setHeader('Content-Type', mime);
    return true;
  };
}

export function requireMethod(methods: string[]): Middleware {
  return (req, res) => {
    if (!methods.includes(req.method ?? 'GET')) {
      sendJson(res, 405, { code: 'METHOD_NOT_ALLOWED', error: `仅支持 ${methods.join(', ')}` });
      return false;
    }
    return true;
  };
}
