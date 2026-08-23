import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { FilesModule } from '@modules/files/files.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { RequestsModule } from '@modules/requests/requests.module';
import { AdminController } from './admin.controller';
import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

/**
 * Админка. Владеет только таблицей quotes; заявки, файлы, пользователей
 * и ставки получает через публичные сервисы соседних модулей.
 * Публичного интерфейса не экспортирует — к admin никто не обращается.
 */
@Module({
  imports: [RequestsModule, AuthModule, FilesModule, PricingModule],
  controllers: [AdminController],
  providers: [AdminService, AdminRepository],
})
export class AdminModule {}
