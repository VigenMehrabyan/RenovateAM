import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { FileKind } from '@db/enums';

/** Запрос подписанной ссылки на загрузку (US-3). */
export class UploadUrlDto {
  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsEnum(FileKind)
  kind!: FileKind;

  @IsString()
  @MaxLength(300)
  originalName!: string;

  @IsString()
  @MaxLength(150)
  mime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(26_214_400)
  size!: number;
}
