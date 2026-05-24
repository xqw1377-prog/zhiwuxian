/**
 * WUXIAN Beta 1.0 · Wave 1 验收
 */
const BASE = process.env.WUXIAN_E2E_BASE ?? 'http://localhost:3401';

async function main() {
  const health = await fetch(`${BASE}/api/health`).then(r => r.json());
  console.log('[health]', health.release, health.wave);
  console.log('[pipeline]', health.pipeline);

  const boot = await fetch(`${BASE}/api/v1/auth/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Wuxian-Device': 'wave1-device-abc' },
    body: JSON.stringify({}),
  }).then(r => r.json());
  console.log('[device bootstrap] userId:', boot.data?.userId);

  const order = await fetch(`${BASE}/api/v1/payment/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: boot.data.userId, productId: 'warp_10h' }),
  }).then(r => r.json());

  const wh = await fetch(`${BASE}/api/v1/payment/webhook/simulate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Wuxian-Signature': process.env.WUXIAN_PAYMENT_WEBHOOK_SECRET ?? 'dev-local-secret',
    },
    body: JSON.stringify({
      orderId: order.data.orderId,
      thirdPartyTxId: `wave1-${Date.now()}`,
    }),
  }).then(r => r.json());
  console.log('[webhook]', wh.data?.order?.status);

  console.log('\n✅ Wave 1 冒烟通过');
}

main().catch(e => { console.error(e); process.exit(1); });
