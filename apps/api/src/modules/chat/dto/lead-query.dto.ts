import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Фильтры списка лидов: GET /admin/chat/sessions (docs/CHAT.md §5.2). */
export class LeadQueryDto {
  /**
   * `true` — только обработанные, `false` — только новые, пусто — все.
   *
   * Строкой, а не boolean: фронт отправляет `handled=` с пустым значением,
   * когда фильтр снят, и приведение к boolean превратило бы это в `false` —
   * то есть в «только новые». Пустая строка здесь разрешена явно.
   */
  @IsOptional()
  @IsIn(['true', 'false', ''])
  handled?: string;

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
  perPage?: number;
}
