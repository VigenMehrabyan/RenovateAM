import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Public } from '@common/decorators/public.decorator';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import type { AuthUser } from '@common/types/auth-user';
import { CONFIG, type AppConfig } from '@config';
import { AuthService, type TokenPair } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyDto } from './dto/verify.dto';

/** Имя cookie с refresh-токеном. Access-токен в cookie не кладётся. */
export const REFRESH_COOKIE = 'renovateam_rt';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  @HttpCode(201)
  async register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('verify')
  @HttpCode(200)
  async verify(@Body() dto: VerifyDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  @HttpCode(202)
  async resend(@CurrentUser() user: AuthUser) {
    return this.auth.resendVerification(user.id);
  }

  /**
   * Лимит строже, чем у входа: каждый запрос отправляет письмо, и эндпоинт
   * публичный. Бизнес-троттлинга по пользователю, как у resend-verification,
   * здесь нет намеренно — он требовал бы ветвления по существованию аккаунта.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto.email);
    // Один и тот же ответ на любой адрес: эндпоинт не перечисляет аккаунты.
    return { accepted: true as const };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { tokens, user } = await this.auth.login(dto, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    this.setRefreshCookie(response, tokens);
    return {
      accessToken: tokens.accessToken,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        locale: user.locale,
        emailVerified: user.emailVerified,
      },
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const raw = readRefreshCookie(request);
    const tokens = await this.auth.refresh(raw, {
      userAgent: request.headers['user-agent'],
      ip: request.ip,
    });
    this.setRefreshCookie(response, tokens);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    await this.auth.logout(readRefreshCookie(request));
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.auth.getUserById(user.id);
    if (!profile) throw new AppException(404, ErrorCode.NOT_FOUND, 'User not found');
    return profile;
  }

  /**
   * refresh живёт только в httpOnly-cookie: XSS не может его прочитать,
   * а путь ограничивает отправку эндпоинтами аутентификации.
   */
  private setRefreshCookie(response: Response, tokens: TokenPair): void {
    response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
      httpOnly: true,
      secure: this.config.nodeEnv === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      expires: tokens.refreshExpiresAt,
    });
  }
}

function readRefreshCookie(request: Request): string | undefined {
  const cookies = (request as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE];
}
