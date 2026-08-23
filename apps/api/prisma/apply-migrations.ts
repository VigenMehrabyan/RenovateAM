/**
 * Применение SQL-миграций.
 *
 * `prisma migrate` не используется: schema-engine Prisma требует загрузки
 * бинарников с binaries.prisma.sh, недоступной в среде разработки. Миграции —
 * обычные .sql-файлы, применяются по порядку и отмечаются в таблице
 * `_migrations`, поэтому повторный запуск идемпотентен.
 *
 * Использование:
 *   tsx prisma/apply-migrations.ts            — применить недостающие миграции
 *   tsx prisma/apply-migrations.ts --reset    — снести схему public и применить всё заново
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { loadEnvFile } from './load-env';

const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function main(): Promise<void> {
  loadEnvFile();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL не задан');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    if (process.argv.includes('--reset')) {
      await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
      console.warn('Схема public пересоздана');
    }

    await client.query(
      `CREATE TABLE IF NOT EXISTS "_migrations" (
         "name" TEXT PRIMARY KEY,
         "applied_at" TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );

    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM "_migrations"')).rows.map(
        (row) => row.name,
      ),
    );

    const names = readdirSync(MIGRATIONS_DIR).sort();
    for (const name of names) {
      if (applied.has(name)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, name, 'migration.sql'), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO "_migrations" ("name") VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.warn(`применена миграция ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    console.warn('миграции применены');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
