import type { JwtSignOptions } from '@nestjs/jwt';

/** Формат времени жизни токена, принимаемый @nestjs/jwt. */
export type TokenTtl = NonNullable<JwtSignOptions['expiresIn']>;

/**
 * Конфигурация приложения. Читается один раз на старте; отсутствие
 * обязательной переменной роняет процесс сразу, а не на первом запросе.
 */
export interface AppConfig {
  nodeEnv: string;
  port: number;
  appUrl: string;
  databaseUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: TokenTtl;
    refreshTtlDays: number;
  };
  storage: {
    driver: 's3' | 'memory';
    endpoint: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    region: string;
  };
  mail: {
    driver: 'resend' | 'memory';
    apiKey: string;
    from: string;
    managerEmail: string;
  };
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Обязательная переменная окружения ${name} не задана`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

/** Проверенное приведение: «15m», «900s», «1h» и т. п. */
function parseTtl(value: string): TokenTtl {
  if (!/^\d+[smhd]$/.test(value)) {
    throw new Error(`ACCESS_TOKEN_TTL должен быть вида 15m/900s/1h, получено "${value}"`);
  }
  return value as TokenTtl;
}

export function loadConfiguration(): AppConfig {
  const storageDriver = optional('STORAGE_DRIVER', 's3');
  const mailDriver = optional('MAIL_DRIVER', 'resend');

  if (storageDriver !== 's3' && storageDriver !== 'memory') {
    throw new Error(`STORAGE_DRIVER должен быть "s3" или "memory", получено "${storageDriver}"`);
  }
  if (mailDriver !== 'resend' && mailDriver !== 'memory') {
    throw new Error(`MAIL_DRIVER должен быть "resend" или "memory", получено "${mailDriver}"`);
  }

  const config: AppConfig = {
    nodeEnv: optional('NODE_ENV', 'development'),
    port: Number(optional('PORT', '3000')),
    appUrl: optional('APP_URL', 'http://localhost:5173'),
    databaseUrl: required('DATABASE_URL'),
    jwt: {
      accessSecret: required('JWT_SECRET'),
      refreshSecret: required('JWT_REFRESH_SECRET'),
      accessTtl: parseTtl(optional('ACCESS_TOKEN_TTL', '15m')),
      refreshTtlDays: Number(optional('REFRESH_TOKEN_TTL_DAYS', '30')),
    },
    storage: {
      driver: storageDriver,
      endpoint: optional('S3_ENDPOINT', ''),
      bucket: optional('S3_BUCKET', ''),
      accessKey: optional('S3_ACCESS_KEY', ''),
      secretKey: optional('S3_SECRET_KEY', ''),
      region: optional('S3_REGION', 'auto'),
    },
    mail: {
      driver: mailDriver,
      apiKey: optional('RESEND_API_KEY', ''),
      from: optional('MAIL_FROM', 'RenovateAM <noreply@renovateam.am>'),
      managerEmail: optional('MANAGER_EMAIL', ''),
    },
  };

  if (config.storage.driver === 's3') {
    for (const key of ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY']) required(key);
  }
  if (config.mail.driver === 'resend') required('RESEND_API_KEY');

  return config;
}

export const CONFIG = 'APP_CONFIG';
