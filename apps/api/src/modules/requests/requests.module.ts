import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { FilesModule } from '@modules/files/files.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { REQUESTS_PUBLIC_SERVICE } from './public';
import { RequestsController } from './requests.controller';
import { RequestsRepository } from './requests.repository';
import { RequestsService } from './requests.service';

/**
 * Модуль заявок — владелец агрегата «заявка»: статусы, журнал, решения.
 * Данные соседних модулей получает через их публичные сервисы.
 */
@Module({
  imports: [PricingModule, FilesModule, AuthModule],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    RequestsRepository,
    { provide: REQUESTS_PUBLIC_SERVICE, useExisting: RequestsService },
  ],
  exports: [REQUESTS_PUBLIC_SERVICE],
})
export class RequestsModule {}
