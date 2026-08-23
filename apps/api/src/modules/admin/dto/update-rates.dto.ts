import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Новая версия набора ставок (US-7). */
export class UpdateRatesDto {
  @IsObject()
  rates!: Record<string, number>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
