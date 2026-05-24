import { existsSync } from 'fs';
import { join } from 'path';
import { GlobalFonts } from '@napi-rs/canvas';

export const CYBER_FONT_FAMILY = 'CyberFont';

let fontsReady = false;

function fontCandidates(): string[] {
  const root = process.env.WUXIAN_ROOT?.trim() || process.cwd();
  return [
    join(root, 'public', 'fonts', 'NotoSansSC-Bold.ttf'),
    join(root, 'public', 'fonts', 'NotoSansSC-Bold.otf'),
    join(__dirname, '..', '..', 'public', 'fonts', 'NotoSansSC-Bold.ttf'),
    join(__dirname, '..', '..', 'public', 'fonts', 'NotoSansSC-Bold.otf'),
    '/usr/share/fonts/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/noto-cjk/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
    '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Bold.ttc',
  ];
}

export function ensurePosterFonts(): void {
  if (fontsReady) return;

  for (const p of fontCandidates()) {
    if (!existsSync(p)) continue;
    try {
      GlobalFonts.registerFromPath(p, CYBER_FONT_FAMILY);
      fontsReady = true;
      return;
    } catch {
    }
  }

  const gf = GlobalFonts as typeof GlobalFonts & { loadSystemFonts?: () => void };
  if (typeof gf.loadSystemFonts === 'function') {
    gf.loadSystemFonts();
  }
  fontsReady = true;
}

export function posterFont(weight: 'bold' | 'normal' | 'italic', sizePx: number): string {
  ensurePosterFonts();
  const style = weight === 'italic' ? 'italic' : 'normal';
  const w = weight === 'bold' ? 'bold' : 'normal';
  return `${style} ${w} ${sizePx}px "${CYBER_FONT_FAMILY}", "Noto Sans SC", "Noto Sans CJK SC", sans-serif`;
}

