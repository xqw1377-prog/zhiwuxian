/**
 * 预发 E2E 套件：p0 → domestic → k12 → auth-prod → user-journey
 *
 * 运行：npm run e2e:staging
 * 需本机 API：npm run server（3401）
 */

import { spawn } from 'child_process';
import { join } from 'path';

const ROOT = join(__dirname, '..');
const BASE = process.env.WUXIAN_E2E_BASE ?? 'http://localhost:3401';

const STEPS = ['e2e:p0', 'e2e:domestic-loop', 'e2e:k12-loop', 'e2e:auth-prod', 'e2e:user-journey'];

async function healthOk(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

function run(script: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn('npm', ['run', script], { cwd: ROOT, shell: true, stdio: 'inherit', env: process.env });
    proc.on('close', (code) => resolve(code ?? 1));
  });
}

async function main() {
  if (!(await healthOk())) {
    console.error(`\n[WUXIAN] 请先启动 API：npm run server（${BASE}）\n`);
    process.exit(1);
  }

  const results: string[] = [];
  for (const step of STEPS) {
    console.log(`\n═══ ${step} ═══\n`);
    const code = await run(step);
    if (code === 0) results.push(`✅ ${step}`);
    else {
      results.push(`❌ ${step}`);
      break;
    }
  }

  console.log('\n═══ Staging E2E Summary ═══\n');
  results.forEach((r) => console.log(r));
  process.exit(results.some((r) => r.startsWith('❌')) ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
