/**
 * 部署一致性自检（新机器 / 发版后）
 *
 * 运行：npm run deploy:check
 * 可选：WUXIAN_E2E_BASE=http://127.0.0.1:3401 npm run deploy:check
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

const ROOT = join(__dirname, '..');
const BASE = process.env.WUXIAN_E2E_BASE ?? 'http://127.0.0.1:3401';

function ok(msg: string) {
  console.log(`✅ ${msg}`);
}

function warn(msg: string) {
  console.log(`⚠️  ${msg}`);
}

function fail(msg: string) {
  console.log(`❌ ${msg}`);
}

function main() {
  console.log('\n═══ WUXIAN deploy:check ═══\n');

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    version?: string;
    engines?: { node?: string };
  };
  ok(`package version: ${pkg.version ?? '?'}`);

  const nodeVer = process.version;
  const major = Number(nodeVer.slice(1).split('.')[0]);
  if (major >= 20) ok(`Node ${nodeVer}`);
  else fail(`Node ${nodeVer} — 需要 20+（推荐 22 LTS）`);

  try {
    const sha = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
    const branch = execSync('git branch --show-current', { cwd: ROOT, encoding: 'utf8' }).trim();
    ok(`git ${branch} @ ${sha.slice(0, 7)}`);
    try {
      const upstream = execSync('git rev-parse @{u}', { cwd: ROOT, encoding: 'utf8' }).trim();
      if (sha === upstream) ok('与远程跟踪分支一致');
      else warn(`本地与 @{u} 不同，部署前请 git pull`);
    } catch {
      warn('未设置上游分支，请确认已 git pull origin main');
    }
  } catch {
    warn('非 git 目录或 git 不可用');
  }

  if (existsSync(join(ROOT, '.env'))) ok('.env 存在');
  else fail('缺少 .env — 请 Copy-Item .env.example .env');

  if (existsSync(join(ROOT, 'web', 'dist', 'index.html'))) ok('web/dist 已构建');
  else warn('未构建前端 — 生产请 npm run build:web');

  if (existsSync(join(ROOT, 'node_modules'))) ok('node_modules 存在');
  else fail('请运行 npm ci');

  void checkHealth();
}

async function checkHealth() {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
    const body = (await res.json()) as { status?: string; version?: string };
    if (res.ok && body.status === 'ok') {
      ok(`/api/health → version ${body.version ?? '?'}`);
    } else {
      warn(`/api/health 异常: ${res.status} ${JSON.stringify(body)}`);
    }
  } catch {
    warn(`未连上 ${BASE} — 若未启动服务可忽略，先 npm run server`);
  }
  console.log('');
}

main();
