import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { DecisionResult, RejectionReason } from '@db/enums';

/** Решение клиента по смете (US-6). Причина обязательна при отказе. */
export class DecisionDto {
  @IsEnum(DecisionResult)
  result!: DecisionResult;

  @IsOptional()
  @IsEnum(RejectionReason)
  reason?: RejectionReason;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
