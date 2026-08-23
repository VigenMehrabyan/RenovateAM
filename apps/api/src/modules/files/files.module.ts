import { Module } from '@nestjs/common';
import { CONFIG, type AppConfig } from '@config';
import { AuthModule } from '@modules/auth/auth.module';
import { FilesController } from './files.controller';
import { FilesRepository } from './files.repository';
import { FilesService } from './files.service';
import { FILES_PUBLIC_SERVICE } from './public';
import { MemoryStorage } from './storage/memory.storage';
import { S3Storage } from './storage/s3.storage';
import { STORAGE_PROVIDER, type StorageProvider } from './storage/storage.provider';

/**
 * Модуль файлов. Провайдер хранилища выбирается конфигом: боевой R2 или
 * реализация в памяти (тесты, локальная разработка).
 *
 * MemoryStorage экспортируется, чтобы тест мог сымитировать загрузку
 * браузером по подписанной ссылке.
 */
@Module({
  imports: [AuthModule],
  controllers: [FilesController],
  providers: [
    MemoryStorage,
    {
      provide: STORAGE_PROVIDER,
      inject: [CONFIG, MemoryStorage],
      useFactory: (config: AppConfig, memory: MemoryStorage): StorageProvider =>
        config.storage.driver === 's3'
          ? new S3Storage(config.storage.bucket, {
              endpoint: config.storage.endpoint,
              region: config.storage.region,
              accessKey: config.storage.accessKey,
              secretKey: config.storage.secretKey,
            })
          : memory,
    },
    FilesService,
    FilesRepository,
    { provide: FILES_PUBLIC_SERVICE, useExisting: FilesService },
  ],
  exports: [FILES_PUBLIC_SERVICE, MemoryStorage],
})
export class FilesModule {}
