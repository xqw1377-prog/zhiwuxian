import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResourceCtor = function(attrs: any) { return attrs; } as any;

let sdk: NodeSDK | null = null;

export function initOpenTelemetry(serviceVersion: string): void {
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!otlpEndpoint) {
    console.log('[Telemetry] OpenTelemetry 未配置 (OTEL_EXPORTER_OTLP_ENDPOINT)');
    return;
  }

  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

  const traceExporter = new OTLPTraceExporter({
    url: `${otlpEndpoint}/v1/traces`,
    headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
      ? Object.fromEntries(
          process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map((h) => {
            const [k, ...v] = h.split('=');
            return [k.trim(), v.join('=').trim()];
          }),
        )
      : undefined,
  });

  sdk = new NodeSDK({
    resource: new ResourceCtor({
      'service.name': 'wuxian-zhi-cockpit',
      'service.version': serviceVersion,
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': { enabled: true },
        '@opentelemetry/instrumentation-express': { enabled: true },
      }),
    ],
  });

  sdk.start();
  console.log('[Telemetry] OpenTelemetry 已启动');
}

export async function shutdownOpenTelemetry(): Promise<void> {
  if (sdk) {
    await sdk.shutdown();
    console.log('[Telemetry] OpenTelemetry 已关闭');
  }
}

export function recordMetric(name: string, value: number, attributes?: Record<string, string>): void {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;
  try {
    const { metrics } = require('@opentelemetry/api');
    const meter = metrics.getMeter('wuxian-zhi-cockpit');
    const counter = meter.createCounter(name);
    counter.add(value, attributes);
  } catch {
    /* metrics not critical */
  }
}

export function recordLLMRequest(model: string, tokens: number, latencyMs: number, success: boolean): void {
  recordMetric('llm.requests', 1, { model, success: String(success) });
  recordMetric('llm.tokens', tokens, { model });
  recordMetric('llm.latency_ms', latencyMs, { model });
}

export function recordPayment(amount: number, currency: string, status: string): void {
  recordMetric('payment.amount', amount, { currency, status });
  recordMetric('payment.attempts', 1, { status });
}
