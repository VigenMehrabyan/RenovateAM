import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import type { AuthUser } from '@common/types/auth-user';
import { UserRole } from '@db/enums';
import { ChatService } from './chat.service';
import { LeadQueryDto } from './dto/lead-query.dto';
import type { ChatConversation, ChatLeadList, ChatLeadRow } from './public';

/** Размер страницы списка лидов по умолчанию — как в остальных списках админки. */
const DEFAULT_PER_PAGE = 20;

/**
 * Лиды из чата в админке (docs/CHAT.md §5.2).
 *
 * Контроллер живёт в модуле `chat`, а не в `admin`, хотя маршруты начинаются
 * на `/admin`: таблицами владеет chat, и список лидов — это его собственный
 * запрос к своим таблицам. В `admin` он потребовал бы публичного сервиса
 * ради трёх эндпоинтов и лишнего слоя пересылки.
 */
@UseGuards(RolesGuard)
@Roles(UserRole.ESTIMATOR, UserRole.ADMIN)
@Controller('admin/chat')
export class ChatAdminController {
  constructor(private readonly chat: ChatService) {}

  @Get('sessions')
  async leads(@Query() query: LeadQueryDto): Promise<ChatLeadList> {
    return this.chat.listLeads({
      // Пустая строка — фильтр снят, а не «только новые».
      ...(query.handled === undefined || query.handled === ''
        ? {}
        : { handled: query.handled === 'true' }),
      page: query.page ?? 1,
      perPage: query.perPage ?? DEFAULT_PER_PAGE,
    });
  }

  @Get('sessions/:id')
  async conversation(@Param('id', ParseUUIDPipe) id: string): Promise<ChatConversation> {
    return this.chat.getConversation(id);
  }

  @Post('sessions/:id/handled')
  @HttpCode(200)
  async markHandled(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ChatLeadRow> {
    return this.chat.markHandled(id, { id: user.id });
  }
}
