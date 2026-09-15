import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { EmailVerifiedGuard } from '@common/guards/email-verified.guard';
import type { AuthUser } from '@common/types/auth-user';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { DecisionDto } from './dto/decision.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  /** Отправить заявку. Требует подтверждённого e-mail (US-2). */
  @UseGuards(EmailVerifiedGuard)
  @Post()
  @HttpCode(201)
  async create(@Body() dto: CreateRequestDto, @CurrentUser() user: AuthUser) {
    return this.requests.create(user.id, dto);
  }

  @Get('me')
  async listOwn(@CurrentUser() user: AuthUser) {
    return this.requests.listOwn(user.id);
  }

  /** Заявка целиком: параметры, файлы, смета и журнал статусов. */
  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requests.getForActor(id, { id: user.id, role: user.role });
  }

  /** Ссылка на смету для владельца заявки (для staff есть свой маршрут в админке). */
  @Get(':id/quote/download-url')
  async quoteDownloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requests.getQuoteDownloadUrl(id, { id: user.id, role: user.role });
  }

  /**
   * Новое сообщение в обсуждении заявки.
   *
   * Один маршрут на обе стороны: клиент пишет в своей заявке, сметчик и
   * админ — в любой, право проверяет сервис. Отдельного админского маршрута
   * нет намеренно — сметчик отвечает из карточки заявки, а не из другого места.
   *
   * Правки и удаления сообщения нет: ни PATCH, ни DELETE здесь не появится.
   * Переписка о деньгах — документ, опечатка исправляется следующим сообщением.
   */
  @UseGuards(EmailVerifiedGuard)
  @Post(':id/comments')
  @HttpCode(201)
  async addComment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requests.addComment(id, { id: user.id, role: user.role }, dto);
  }

  @UseGuards(EmailVerifiedGuard)
  @Post(':id/decision')
  @HttpCode(201)
  async decide(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DecisionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.requests.decide(id, user.id, dto);
  }
}
