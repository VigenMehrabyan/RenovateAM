import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Загружает apps/api/.env для скриптов, запускаемых напрямую через tsx
 * (миграции, сид). В рантайме API переменные приходят из окружения Railway.
 */
export function loadEnvFile(): void {
  const path = join(__dirname, '..', '.env');
  if (existsSync(path)) process.loadEnvFile(path);
}
