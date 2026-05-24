/**
 * WUXIAN · yt-dlp 跨平台调用解析
 * Windows pip 安装后通常为 python -m yt_dlp
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { existsSync } from 'fs';
import { join } from 'path';

const execFileAsync = promisify(execFile);

function pythonSafeEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONPYCACHEPREFIX: join(process.cwd(), '.pycache'),
  };
}

export type YtDlpInvoker = {
  kind: 'binary' | 'python-module';
  command: string;
  prefixArgs: string[];
  label: string;
};

let cachedInvoker: YtDlpInvoker | null | undefined;

function candidateInvokers(): YtDlpInvoker[] {
  const out: YtDlpInvoker[] = [];
  const envPath = process.env.YT_DLP_PATH?.trim();
  if (envPath) {
    out.push({ kind: 'binary', command: envPath, prefixArgs: [], label: envPath });
  }

  out.push({ kind: 'binary', command: 'yt-dlp', prefixArgs: [], label: 'yt-dlp' });

  const localAppData = process.env.LOCALAPDATA ?? '';
  const appData = process.env.APPDATA ?? '';
  for (const base of [localAppData, appData]) {
    if (!base) continue;
    for (const ver of ['Python314', 'Python313', 'Python312', 'Python311']) {
      const exe = join(base, 'Python', ver, 'Scripts', 'yt-dlp.exe');
      if (existsSync(exe)) {
        out.push({ kind: 'binary', command: exe, prefixArgs: [], label: exe });
      }
    }
  }

  const py = process.env.PYTHON_PATH?.trim() || 'python';
  out.push({ kind: 'python-module', command: py, prefixArgs: ['-m', 'yt_dlp'], label: `${py} -m yt_dlp` });
  return out;
}

async function probeInvoker(inv: YtDlpInvoker): Promise<boolean> {
  try {
    await execFileAsync(
      inv.command,
      [...inv.prefixArgs, '--version'],
      { timeout: 8000, env: pythonSafeEnv() },
    );
    return true;
  } catch {
    return false;
  }
}

export async function resolveYtDlpInvoker(force = false): Promise<YtDlpInvoker | null> {
  if (!force && cachedInvoker !== undefined) return cachedInvoker;

  for (const inv of candidateInvokers()) {
    if (await probeInvoker(inv)) {
      cachedInvoker = inv;
      return inv;
    }
  }
  cachedInvoker = null;
  return null;
}

export async function runYtDlp(args: string[], options?: { timeout?: number; maxBuffer?: number }): Promise<string> {
  const inv = await resolveYtDlpInvoker();
  if (!inv) throw new Error('yt-dlp 未安装。请 pip install yt-dlp 或设置 YT_DLP_PATH');

  try {
    const { stdout } = await execFileAsync(
      inv.command,
      [...inv.prefixArgs, ...args],
      {
        timeout: options?.timeout ?? 120000,
        maxBuffer: options?.maxBuffer ?? 12 * 1024 * 1024,
        env: pythonSafeEnv(),
      },
    );
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; message?: string };
    const detail = (e.stderr ?? e.message ?? String(err)).trim().slice(0, 500);
    throw new Error(`yt-dlp 执行失败: ${detail}`);
  }
}

export async function getYtDlpVersion(): Promise<string | null> {
  try {
    const out = await runYtDlp(['--version'], { timeout: 8000, maxBuffer: 1024 * 64 });
    return out.trim();
  } catch {
    return null;
  }
}

export function clearYtDlpCache(): void {
  cachedInvoker = undefined;
}
