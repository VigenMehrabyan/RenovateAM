import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { Roles } from '@common/decorators/roles.decorator';
import { AppException } from '@common/errors/app.exception';
import { ErrorCode } from '@common/errors/error-codes';
import { RolesGuard } from '@common/guards/roles.guard';
import type { AuthUser } from '@common/types/auth-user';
import { UserRole } from '@db/enums';
import { UpdateRatesDto } from './dto/update-rates.dto';
import { AdminService } from './admin.service';
import { ChangeStatusDto } from './dto/change-status.dto';
import { QueueQueryDto } from './dto/queue-query.dto';
import { UploadQuoteDto } from './dto/upload-quote.dto';

/** Загруженный через multipart файл сметы. */
interface UploadedQuoteFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

/**
 * Админка: очередь сметчика, сметы, редактор ставок.
 *
 * ESTIMATOR и ADMIN отличаются только доступом к ставкам и списку
 * пользователей (MVP §3: разделение прав — после MVP).
 */
@UseGuards(RolesGuard)
@Roles(UserRole.ESTIMATOR, UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('requests')
  async queue(@Query() query: QueueQueryDto) {
    return this.admin.listQueue({
      ...(query.status ? { status: query.status } : {}),
      ...(query.phone ? { phone: query.phone } : {}),
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 20,
      sortDirection: query.sort === 'createdAt:asc' ? 'asc' : 'desc',
    });
  }

  @Get('requests/:id')
  async card(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.getRequestCard(id);
  }

  @Patch('requests/:id/status')
  @HttpCode(200)
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.admin.changeStatus({
      requestId: id,
      to: dto.to,
      actor: { id: user.id, role: user.role },
      ...(dto.comment !== undefined ? { comment: dto.comment } : {}),
    });
  }

  @Post('requests/:id/quote')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file'))
  async uploadQuote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UploadQuoteDto,
    @UploadedFile() file: UploadedQuoteFile | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) {
      throw new AppException(422, ErrorCode.VALIDATION_FAILED, 'Quote file is required', {
        details: [{ field: 'file', code: 'REQUIRED' }],
      });
    }
    return this.admin.uploadQuote({
      requestId: id,
      actor: { id: user.id, role: user.role },
      totalAmount: dto.totalAmount,
      file,
    });
  }

  @Get('requests/:id/quote/download-url')
  async quoteDownloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.admin.getQuoteDownloadUrl(id, { id: user.id, role: user.role });
  }

  @Roles(UserRole.ADMIN)
  @Get('pricing/rates/versions')
  async rateVersions() {
    return this.admin.listRateVersions();
  }

  @Roles(UserRole.ADMIN)
  @Get('users')
  async users(@Query() query: QueueQueryDto) {
    return this.admin.listUsers(query.page ?? 1, query.pageSize ?? 20);
  }

  @Roles(UserRole.ADMIN)
  @Put('pricing/rates')
  @HttpCode(201)
  async updateRates(@Body() dto: UpdateRatesDto, @CurrentUser() user: AuthUser) {
    return this.admin.createRateVersion(dto.rates, user.id, dto.note);
  }
}
