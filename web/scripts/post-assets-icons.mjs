/**
 * capacitor-assets 会改写 manifest 并可能删掉 favicon.svg；生成后恢复 Web 静态资源。
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(web, 'public');
const iconsSrc = join(web, 'icons');
const iconsDst = join(publicDir, 'icons');
const templateSvg = join(web, 'resources', 'icon-template.svg');
const favicon = join(publicDir, 'favicon.svg');
const manifest = join(publicDir, 'manifest.webmanifest');

mkdirSync(iconsDst, { recursive: true });
if (existsSync(iconsSrc)) {
  for (const name of readdirSync(iconsSrc)) {
    if (name.endsWith('.webp')) {
      copyFileSync(join(iconsSrc, name), join(iconsDst, name));
    }
  }
}

if (existsSync(templateSvg)) {
  copyFileSync(templateSvg, favicon);
}

const pwaIcons = ['48', '72', '96', '128', '192', '256', '512']
  .filter((s) => existsSync(join(iconsDst, `icon-${s}.webp`)))
  .map((s) => ({
    src: `/icons/icon-${s}.webp`,
    sizes: `${s}x${s}`,
    type: 'image/webp',
    purpose: 'any maskable',
  }));

if (pwaIcons.length > 0) {
  writeFileSync(
    manifest,
    `${JSON.stringify(
      {
        name: 'WUXIAN ZHI',
        short_name: 'ZHI',
        description: 'AI 学业驾驶舱 · 平板优先',
        start_url: '/',
        display: 'standalone',
        background_color: '#0D0E12',
        theme_color: '#0D0E12',
        orientation: 'any',
        lang: 'zh-CN',
        icons: pwaIcons,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

console.log('[post-assets-icons] public/icons + manifest + favicon.svg 已同步');
