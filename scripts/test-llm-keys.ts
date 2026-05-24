/**
 * 一次性脚本：验证 DeepSeek / 通义千问 API Key 是否可用
 * 用法: npx tsx scripts/test-llm-keys.ts
 */
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { loadEnvFiles } from '../server/load-env';
import OpenAI from 'openai';
import { llmStatus } from '../server/llm/llm-provider';

loadEnvFiles();

async function loadClients() {
  const ds = await import('../src/services/deepseek-client');
  const qw = await import('../src/services/qwen-client');
  return { ...ds, ...qw };
}

async function testDeepSeek(
  dsKey: string | null,
  DEEPSEEK_BASE_URL: string,
  DEEPSEEK_CHAT_MODEL: string,
) {
  if (!dsKey) return { ok: false, error: '未配置 DEEPSEEK_API_KEY' };
  const client = new OpenAI({ apiKey: dsKey, baseURL: DEEPSEEK_BASE_URL });
  const candidates = [
    DEEPSEEK_CHAT_MODEL,
    'deepseek-chat',
    'deepseek-v4-flash',
    'deepseek-v4-pro',
  ].filter((m, i, a) => a.indexOf(m) === i);

  const attempts: { model: string; ok: boolean; ms?: number; reply?: string; error?: string }[] = [];
  for (const model of candidates) {
    const t0 = Date.now();
    try {
      const r = await client.chat.completions.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: '只回复 OK 两个字母，不要其它内容' }],
      });
      const text = (r.choices[0]?.message?.content ?? '').trim();
      attempts.push({ model, ok: true, ms: Date.now() - t0, reply: text.slice(0, 80) });
      return { ok: true, model, ms: Date.now() - t0, reply: text.slice(0, 80), attempts };
    } catch (e) {
      attempts.push({
        model,
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { ok: false, error: '所有候选模型均失败', attempts };
}

async function testQwen(qwKey: string | null, QWEN_BASE_URL: string, QWEN_VISION_MODEL: string) {
  if (!qwKey) return { ok: false, error: '未配置 QWEN_API_KEY 或 DASHSCOPE_API_KEY（请写入 src/.env，不是 .env.example）' };
  const client = new OpenAI({ apiKey: qwKey, baseURL: QWEN_BASE_URL });
  const candidates = [
    QWEN_VISION_MODEL,
    'qwen-plus',
    'qwen-turbo',
    'qwen-vl-max',
  ].filter((m, i, a) => a.indexOf(m) === i);

  const attempts: { model: string; ok: boolean; ms?: number; reply?: string; error?: string }[] = [];
  for (const model of candidates) {
    const t0 = Date.now();
    try {
      const r = await client.chat.completions.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: '只回复 OK 两个字母，不要其它内容' }],
      });
      const text = (r.choices[0]?.message?.content ?? '').trim();
      attempts.push({ model, ok: true, ms: Date.now() - t0, reply: text.slice(0, 80) });
      return { ok: true, model, ms: Date.now() - t0, reply: text.slice(0, 80), attempts };
    } catch (e) {
      attempts.push({
        model,
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { ok: false, error: '所有候选模型均失败', attempts };
}

/** 若 src/.env 未配置千问，尝试从 .env.example 读取（仅诊断，不参与正式运行） */
function loadQwenFromExample(): string | null {
  const fp = resolve(process.cwd(), '.env.example');
  if (!existsSync(fp)) return null;
  for (const line of readFileSync(fp, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^(?:QWEN_API_KEY|DASHSCOPE_API_KEY)=(.+)$/);
    if (m?.[1]?.trim()) return m[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function testQwenWithKey(key: string, label: string, QWEN_BASE_URL: string, QWEN_VISION_MODEL: string) {
  const client = new OpenAI({ apiKey: key, baseURL: QWEN_BASE_URL });
  const candidates = [QWEN_VISION_MODEL, 'qwen-plus', 'qwen-turbo', 'qwen-vl-max'].filter(
    (m, i, a) => a.indexOf(m) === i,
  );
  const attempts: { model: string; ok: boolean; error?: string }[] = [];
  for (const model of candidates) {
    try {
      const r = await client.chat.completions.create({
        model,
        max_tokens: 16,
        messages: [{ role: 'user', content: '只回复 OK' }],
      });
      const text = (r.choices[0]?.message?.content ?? '').trim();
      return { ok: true, label, model, reply: text.slice(0, 40), attempts: [...attempts, { model, ok: true }] };
    } catch (e) {
      attempts.push({ model, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { ok: false, label, error: '所有候选模型均失败', attempts };
}

async function main() {
  const {
    getPlatformDeepSeekKey,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_CHAT_MODEL,
    getPlatformQwenKey,
    QWEN_BASE_URL,
    QWEN_VISION_MODEL,
  } = await loadClients();

  const dsKey = getPlatformDeepSeekKey();
  const qwKey = getPlatformQwenKey();

  console.log('=== 环境变量 ===');
  console.log('DEEPSEEK_API_KEY:', dsKey ? `已设置 (长度 ${dsKey.length})` : '未设置');
  console.log('QWEN_API_KEY / DASHSCOPE:', qwKey ? `已设置 (长度 ${qwKey.length})` : '未设置');
  console.log('llmStatus():', JSON.stringify(llmStatus()));
  console.log('DeepSeek 模型:', DEEPSEEK_CHAT_MODEL);
  console.log('千问 模型:', QWEN_VISION_MODEL);

  console.log('\n=== DeepSeek 连通性 ===');
  console.log(JSON.stringify(await testDeepSeek(dsKey, DEEPSEEK_BASE_URL, DEEPSEEK_CHAT_MODEL), null, 2));
  console.log('\n=== 通义千问 连通性（src/.env）===');
  console.log(JSON.stringify(await testQwen(qwKey, QWEN_BASE_URL, QWEN_VISION_MODEL), null, 2));

  if (!qwKey) {
    const exampleKey = loadQwenFromExample();
    if (exampleKey) {
      console.log('\n=== 通义千问 连通性（.env.example 中的 Key，未写入 src/.env）===');
      console.log(
        JSON.stringify(await testQwenWithKey(exampleKey, 'env.example', QWEN_BASE_URL, QWEN_VISION_MODEL), null, 2),
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
