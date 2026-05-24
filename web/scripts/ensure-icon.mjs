/**
 * 若尚无 icon.png，写入深色占位图（上架前请替换为 1024×1024 设计稿）。
 */
import { existsSync, statSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const resources = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');
const iconPath = join(resources, 'icon.png');

if (existsSync(iconPath) && statSync(iconPath).size > 200) {
  process.exit(0);
}
if (existsSync(iconPath)) {
  console.warn('[ensure-icon] 现有 icon.png 过小或可能损坏，将重新生成占位图');
}

// 1×1 有效 PNG（capacitor-assets 会放大；上架前请换 1024×1024）
const PLACEHOLDER_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

writeFileSync(iconPath, Buffer.from(PLACEHOLDER_B64, 'base64'));
console.warn(
  '[ensure-icon] 已生成占位 icon.png（1×1）。上架前请替换为 1024×1024 并重新 npm run assets:icons',
);
