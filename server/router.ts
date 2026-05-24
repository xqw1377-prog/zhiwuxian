/**
 * WUXIAN · 类型化路由注册表
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { sendSuccess, sendJson, sendHtml } from './middleware';
import { NotFoundError, InternalError } from './errors';

export type RouteHandler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>) => Promise<void> | void;

interface RouteEntry {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export class Router {
  private routes: RouteEntry[] = [];

  get(path: string, handler: RouteHandler): void {
    this.add('GET', path, handler);
  }

  post(path: string, handler: RouteHandler): void {
    this.add('POST', path, handler);
  }

  add(method: string, path: string, handler: RouteHandler): void {
    const paramNames: string[] = [];
    const patternStr = path.replace(/:(\w+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    this.routes.push({
      method,
      pattern: new RegExp(`^${patternStr}$`),
      paramNames,
      handler,
    });
  }

  html(path: string, html: string): void {
    this.get(path, (req, res) => sendHtml(res, html));
  }

  async dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    const internalEnabled = process.env.WUXIAN_INTERNAL === '1';
    if (!internalEnabled) {
      if (
        path.startsWith('/api/admin')
        || path === '/admin'
        || path === '/admin.html'
        || path === '/console'
        || path === '/school-organism'
        || path === '/school-organism.html'
        || path === '/dreamer-twin'
        || path === '/dreamer-twin.html'
      ) {
        throw new NotFoundError('Route', path);
      }
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;

      const params: Record<string, string> = {};
      route.paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1]);
      });

      try {
        await route.handler(req, res, params);
      } catch (err) {
        throw err;
      }
      return;
    }

    throw new NotFoundError('Route', path);
  }
}
