import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, Max, Min } from 'class-validator';
import {
  CeilingHeight,
  FinishPackage,
  Locale,
  ObjectType,
  PropertyCondition,
  WorkScope,
} from '@db/enums';
import { MAX_AREA_SQM, MIN_AREA_SQM } from '@renovateam/pricing-core';

/** Вход быстрого расчёта (US-1, максимум 6 полей). */
export class EstimateDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(MIN_AREA_SQM)
  @Max(MAX_AREA_SQM)
  areaSqm!: number;

  @IsEnum(ObjectType)
  objectType!: ObjectType;

  @IsEnum(WorkScope)
  workScope!: WorkScope;

  @IsEnum(FinishPackage)
  finishPackage!: FinishPackage;

  @IsEnum(PropertyCondition)
  condition!: PropertyCondition;

  @IsEnum(CeilingHeight)
  ceilingHeight!: CeilingHeight;

  @IsOptional()
  @IsIn(Object.values(Locale))
  locale?: Locale;
}
