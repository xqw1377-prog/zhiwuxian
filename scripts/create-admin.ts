/**
 * WUXIAN · 创建管理员用户 CLI
 *
 * 用法: npx tsx scripts/create-admin.ts <email> <password> [displayName]
 *
 * 示例: npx tsx scripts/create-admin.ts admin@wuxian.dev Admin123 超级管理员
 */

import { createAdminUser } from '../server/routes/auth.routes';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('用法: npx tsx scripts/create-admin.ts <email> <password> [displayName]');
    process.exit(1);
  }
  const [email, password, displayName] = args;
  const ok = createAdminUser(email, password, displayName || 'Admin');
  if (ok) {
    console.log(`管理员 ${email} 创建成功`);
    console.log(`登录邮箱: ${email}`);
    console.log(`密  码: ${password}`);
  } else {
    console.log(`管理员 ${email} 已存在，跳过`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
