/**
 * Окружение тестов.
 *
 * Интеграционные тесты работают с настоящим PostgreSQL. Если TEST_DATABASE_URL
 * (или DATABASE_URL) не задан, интеграционные наборы помечаются пропущенными —
 * см. test/db.ts. Юнит-тесты идут в любом случае.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const envPath = join(__dirname, '..', '.env');
if (existsSync(envPath)) process.loadEnvFile(envPath);

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;

// В тестах внешние сервисы не используются: хранилище и почта — в памяти.
process.env.STORAGE_DRIVER = 'memory';
process.env.MAIL_DRIVER = 'memory';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-access-secret-test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-test-refresh-secret';
process.env.APP_URL ??= 'http://localhost:5173';
process.env.MANAGER_EMAIL ??= 'manager@renovateam.am';
