import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';
import { FilesModule } from '@modules/files/files.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { RequestsModule } from '@modules/requests/requests.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

/**
 * Админка. Собственных таблиц нет: заявки, сметы, файлы, пользователей и
 * ставки получает через публичные сервисы соседних модулей. Публичного
 * интерфейса не экспортирует — к admin никто не обращается.
 */
@Module({
  imports: [RequestsModule, AuthModule, FilesModule, PricingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
