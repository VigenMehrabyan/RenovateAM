import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/** Загрузка сметы: сумма в целых драмах (US-5). */
export class UploadQuoteDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalAmount!: number;
}
