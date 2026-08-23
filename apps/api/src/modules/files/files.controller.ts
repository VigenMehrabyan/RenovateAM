import {
  Body,
  Controller,
  Delete,
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
import { UploadUrlDto } from './dto/upload-url.dto';
import { FilesService } from './files.service';

/**
 * Двухфазная загрузка: клиент запрашивает ссылку, грузит файл напрямую
 * в R2 (минуя API) и подтверждает загрузку.
 */
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @UseGuards(EmailVerifiedGuard)
  @Post('upload-url')
  @HttpCode(201)
  async createUploadUrl(@Body() dto: UploadUrlDto, @CurrentUser() user: AuthUser) {
    return this.files.createUploadUrl({
      userId: user.id,
      ...(dto.requestId ? { requestId: dto.requestId } : {}),
      kind: dto.kind,
      originalName: dto.originalName,
      mime: dto.mime,
      size: dto.size,
    });
  }

  @UseGuards(EmailVerifiedGuard)
  @Post(':id/confirm')
  @HttpCode(200)
  async confirm(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const meta = await this.files.confirmUpload(id, user.id);
    return { id: meta.id, uploadedAt: meta.uploadedAt, size: meta.size };
  }

  @Get('drafts')
  async drafts(@CurrentUser() user: AuthUser) {
    return this.files.listOwnDrafts(user.id);
  }

  @Get(':id/download-url')
  async downloadUrl(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.files.createDownloadUrl(id, { id: user.id, role: user.role });
  }

  @UseGuards(EmailVerifiedGuard)
  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    await this.files.deleteFile(id, user.id);
  }
}
