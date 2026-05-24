import { onLCP, onINP, onCLS, onFCP, onTTFB } from 'web-vitals';

type VitalMetric = {
  name: string;
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
};

const THRESHOLDS: Record<string, { good: number; poor: number }> = {
  LCP: { good: 2500, poor: 4000 },
  INP: { good: 200, poor: 500 },
  CLS: { good: 0.1, poor: 0.25 },
  FCP: { good: 1800, poor: 3000 },
  TTFB: { good: 800, poor: 1800 },
};

function getRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const t = THRESHOLDS[name];
  if (!t) return 'needs-improvement';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

function reportMetric(metric: VitalMetric): void {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[WebVitals] ${metric.name}: ${metric.value} (${metric.rating})`);
  }

  try {
    const body = JSON.stringify({
      name: metric.name,
      value: Math.round(metric.value),
      rating: metric.rating,
      url: window.location.pathname,
      ts: new Date().toISOString(),
    });

    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/v1/telemetry/web-vitals', body);
    } else {
      fetch('/api/v1/telemetry/web-vitals', {
        method: 'POST',
        body,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).catch(() => { /* ignore */ });
    }
  } catch {
    /* silent */
  }
}

export function initWebVitalsReporting(): void {
  try {
    onLCP((m) => reportMetric({ name: 'LCP', value: m.value, rating: getRating('LCP', m.value) }));
    onINP((m) => reportMetric({ name: 'INP', value: m.value, rating: getRating('INP', m.value) }));
    onCLS((m) => reportMetric({ name: 'CLS', value: m.value, rating: getRating('CLS', m.value) }));
    onFCP((m) => reportMetric({ name: 'FCP', value: m.value, rating: getRating('FCP', m.value) }));
    onTTFB((m) => reportMetric({ name: 'TTFB', value: m.value, rating: getRating('TTFB', m.value) }));
    console.log('[WebVitals] 性能监控已启动');
  } catch (err) {
    console.warn('[WebVitals] 初始化失败:', err);
  }
}
