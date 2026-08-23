import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RequestStatus } from '@db/enums';

/** Смена статуса сметчиком (US-5). Комментарий обязателен для NEEDS_INFO. */
export class ChangeStatusDto {
  @IsEnum(RequestStatus)
  to!: RequestStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
