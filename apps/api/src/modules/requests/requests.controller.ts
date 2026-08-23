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

  @Get(':id')
  async getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.requests.getForActor(id, { id: user.id, role: user.role });
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
