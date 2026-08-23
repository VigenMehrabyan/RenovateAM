import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@db';
import { CONFIG, type AppConfig } from '../../config/configuration';

/**
 * Единственный экземпляр PrismaClient на процесс.
 *
 * Используется driver adapter (@prisma/adapter-pg) вместо нативного движка:
 * клиент собирается из TypeScript, бинарные движки Prisma не нужны.
 *
 * Доступ к клиенту разрешён только файлам `*.repository.ts` — это правило
 * проверяет ESLint (см. eslint.config.mjs), а владение таблицами —
 * scripts/check-module-boundaries.mjs.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(CONFIG) config: AppConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Соединение с БД закрыто');
  }
}
