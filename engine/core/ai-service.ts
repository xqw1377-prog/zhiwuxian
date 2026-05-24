/**
 * WUXIAN · AI 服务抽象层
 * 统一管理所有外部 AI 依赖，提供降级策略与缓存
 */

export type AIServiceName =
  | 'whisper'
  | 'gemini'
  | 'yt-dlp'
  | 'neo4j'
  | 'milvus'
  | 'tavily'
  | 'jina'
  | 'browser-use'
  | 'firecrawl';

export interface AIServiceStatus {
  service: AIServiceName;
  available: boolean;
  latencyMs: number;
  lastChecked: string;
  fallbackActive: boolean;
}

export interface AIServiceResult<T = unknown> {
  success: boolean;
  data: T | null;
  fallback: boolean;
  confidence: number;
  serviceUsed: AIServiceName | 'local_fallback';
  error?: string;
  cached: boolean;
}

interface ServiceConfig {
  timeoutMs: number;
  retries: number;
  fallbackOrder: Array<AIServiceName | 'local_fallback'>;
  cacheTtlMs: number;
}

const SERVICE_CONFIG: Record<AIServiceName, ServiceConfig> = {
  whisper: {
    timeoutMs: 30000,
    retries: 2,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 3600000,
  },
  gemini: {
    timeoutMs: 15000,
    retries: 1,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 300000,
  },
  'yt-dlp': {
    timeoutMs: 10000,
    retries: 1,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 86400000,
  },
  neo4j: {
    timeoutMs: 5000,
    retries: 2,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 600000,
  },
  milvus: {
    timeoutMs: 5000,
    retries: 2,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 600000,
  },
  tavily: {
    timeoutMs: 10000,
    retries: 1,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 3600000,
  },
  jina: {
    timeoutMs: 10000,
    retries: 1,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 3600000,
  },
  'browser-use': {
    timeoutMs: 20000,
    retries: 1,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 86400000,
  },
  firecrawl: {
    timeoutMs: 15000,
    retries: 1,
    fallbackOrder: ['local_fallback'],
    cacheTtlMs: 86400000,
  },
};

const SERVICE_AVAILABILITY: Record<AIServiceName, boolean> = {
  whisper: false,
  gemini: false,
  'yt-dlp': false,
  neo4j: false,
  milvus: false,
  tavily: false,
  jina: false,
  'browser-use': false,
  firecrawl: false,
};

export class AIServiceManager {
  private statusCache = new Map<AIServiceName, AIServiceStatus>();
  private resultCache = new Map<string, { data: unknown; expiresAt: number }>();
  private availability = new Map<AIServiceName, boolean>(Object.entries(SERVICE_AVAILABILITY) as [AIServiceName, boolean][]);

  setAvailability(service: AIServiceName, available: boolean): void {
    this.availability.set(service, available);
  }

  isAvailable(service: AIServiceName): boolean {
    return this.availability.get(service) ?? false;
  }

  async call<T>(
    service: AIServiceName,
    operation: string,
    executor: () => Promise<T>,
    cacheKey?: string,
  ): Promise<AIServiceResult<T>> {
    const config = SERVICE_CONFIG[service];
    const start = performance.now();

    if (cacheKey) {
      const cached = this.resultCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return {
          success: true,
          data: cached.data as T,
          fallback: false,
          confidence: 1,
          serviceUsed: service,
          cached: true,
        };
      }
    }

    if (!this.isAvailable(service)) {
      return this.executeFallback<T>(service, operation, config.fallbackOrder);
    }

    for (let attempt = 0; attempt <= config.retries; attempt++) {
      try {
        const result = await this.withTimeout(executor(), config.timeoutMs);
        const latencyMs = Math.round(performance.now() - start);

        this.statusCache.set(service, {
          service,
          available: true,
          latencyMs,
          lastChecked: new Date().toISOString(),
          fallbackActive: false,
        });

        if (cacheKey) {
          this.resultCache.set(cacheKey, { data: result, expiresAt: Date.now() + config.cacheTtlMs });
        }

        return {
          success: true,
          data: result,
          fallback: false,
          confidence: 0.95,
          serviceUsed: service,
          cached: false,
        };
      } catch (err) {
        if (attempt < config.retries) continue;
        this.availability.set(service, false);
        return this.executeFallback<T>(service, operation, config.fallbackOrder, err instanceof Error ? err.message : 'Unknown error');
      }
    }

    return this.executeFallback<T>(service, operation, config.fallbackOrder, 'Max retries exceeded');
  }

  healthCheck(service: AIServiceName): AIServiceStatus {
    return this.statusCache.get(service) ?? {
      service,
      available: this.isAvailable(service),
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      fallbackActive: !this.isAvailable(service),
    };
  }

  healthCheckAll(): AIServiceStatus[] {
    return (Object.keys(SERVICE_CONFIG) as AIServiceName[]).map(s => this.healthCheck(s));
  }

  clearCache(): void {
    this.resultCache.clear();
  }

  private async executeFallback<T>(
    service: AIServiceName,
    operation: string,
    fallbackOrder: Array<AIServiceName | 'local_fallback'>,
    error?: string,
  ): Promise<AIServiceResult<T>> {
    for (const fallback of fallbackOrder) {
      if (fallback === 'local_fallback') {
        return {
          success: true,
          data: null,
          fallback: true,
          confidence: 0.4,
          serviceUsed: 'local_fallback',
          error: error ? `${service} unavailable: ${error}` : `${service} unavailable`,
          cached: false,
        };
      }
      if (this.isAvailable(fallback)) {
        return {
          success: true,
          data: null,
          fallback: true,
          confidence: 0.6,
          serviceUsed: fallback,
          error: error ? `${service} unavailable, using ${fallback}: ${error}` : `${service} unavailable, using ${fallback}`,
          cached: false,
        };
      }
    }

    return {
      success: false,
      data: null,
      fallback: true,
      confidence: 0,
      serviceUsed: 'local_fallback',
      error: error ?? `All services unavailable for ${operation}`,
      cached: false,
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
    ]);
  }
}

let globalAIServiceManager: AIServiceManager | null = null;

export function getAIServiceManager(): AIServiceManager {
  if (!globalAIServiceManager) {
    globalAIServiceManager = new AIServiceManager();
  }
  return globalAIServiceManager;
}
