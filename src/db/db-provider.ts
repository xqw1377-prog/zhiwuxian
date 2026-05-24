import BetterSqlite3 from 'better-sqlite3';
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import fs from 'fs';

export type DbDialect = 'sqlite' | 'postgres';

interface DbConfig {
  dialect: DbDialect;
  sqlitePath?: string;
  pgConnectionString?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let dbInstance: any = null;
let dialect: DbDialect = 'sqlite';

function detectConfig(): DbConfig {
  const pgUrl = process.env.DATABASE_URL?.trim();
  if (pgUrl && pgUrl.startsWith('postgres')) {
    return { dialect: 'postgres', pgConnectionString: pgUrl };
  }
  const dataDir = process.env.WUXIAN_DATA_DIR || './data';
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  return { dialect: 'sqlite', sqlitePath: path.join(dataDir, 'wuxian.db') };
}

export function getDialect(): DbDialect {
  return dialect;
}

export function getDb() {
  if (dbInstance) return dbInstance;

  const config = detectConfig();
  dialect = config.dialect;

  if (config.dialect === 'postgres') {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { Pool } = require('pg');
    const { drizzle: pgDrizzle } = require('drizzle-orm/node-postgres');
    const pool = new Pool({ connectionString: config.pgConnectionString });
    dbInstance = pgDrizzle(pool);
    console.log('[DB] PostgreSQL 已连接');
  } else {
    const sqlite = new BetterSqlite3(config.sqlitePath!);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    dbInstance = drizzleSqlite(sqlite);
    console.log(`[DB] SQLite 已连接: ${config.sqlitePath}`);
  }

  return dbInstance;
}

export function closeDb(): void {
  if (!dbInstance) return;
  if (dialect === 'sqlite') {
    const sqlite = (dbInstance as unknown as { session?: { client?: BetterSqlite3.Database } }).session?.client;
    sqlite?.close();
  }
  dbInstance = null;
}

export function isPostgres(): boolean {
  return dialect === 'postgres';
}

export function isSqlite(): boolean {
  return dialect === 'sqlite';
}
