import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { RequestStatus } from '@db/enums';

/** Фильтры очереди сметчика (US-5). */
export class QueueQueryDto {
  @IsOptional()
  @IsEnum(RequestStatus)
  status?: RequestStatus;

  @IsOptional()
  @Matches(/^\+374\d{8}$/, { message: 'phone must match +374XXXXXXXX' })
  phone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsIn(['createdAt:asc', 'createdAt:desc'])
  sort?: 'createdAt:asc' | 'createdAt:desc';
}
