import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from '@common/errors/all-exceptions.filter';
import { AppThrottlerGuard } from '@common/guards/app-throttler.guard';
import { JwtAuthGuard } from '@common/guards/jwt-auth.guard';
import { PrismaModule } from '@common/prisma/prisma.module';
import { AppConfigModule } from './config/config.module';
import { AdminModule } from '@modules/admin/admin.module';
import { AuthModule } from '@modules/auth/auth.module';
import { FilesModule } from '@modules/files/files.module';
import { NotificationsModule } from '@modules/notifications/notifications.module';
import { PricingModule } from '@modules/pricing/pricing.module';
import { RequestsModule } from '@modules/requests/requests.module';

/**
 * Корневой модуль.
 *
 * JwtAuthGuard включён глобально: дефолт — «закрыто», публичные эндпоинты
 * помечаются @Public(). Забытый декоратор делает эндпоинт недоступным,
 * а не открытым.
 */
@Module({
  imports: [
    AppConfigModule,
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    JwtModule.register({}),
    PrismaModule,
    NotificationsModule,
    PricingModule,
    AuthModule,
    FilesModule,
    RequestsModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
