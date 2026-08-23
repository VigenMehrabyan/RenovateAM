import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PricingModule } from '@modules/pricing/pricing.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AUTH_PUBLIC_SERVICE } from './public';

/**
 * Модуль аутентификации.
 *
 * Наружу экспортируется только AUTH_PUBLIC_SERVICE. AuthRepository и
 * AuthService-как-класс остаются приватными: чужой модуль не может
 * заинжектить их — DI не найдёт провайдер.
 */
@Module({
  imports: [JwtModule.register({}), PricingModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    { provide: AUTH_PUBLIC_SERVICE, useExisting: AuthService },
  ],
  exports: [AUTH_PUBLIC_SERVICE],
})
export class AuthModule {}
