import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Создание заявки (US-4). Файлы не обязательны — они не блокируют отправку. */
export class CreateRequestDto {
  /**
   * Адрес объекта. Обязателен: заявок у клиента может быть несколько, и адрес
   * принадлежит объекту, а не профилю. `users.address` остаётся контактным
   * адресом — форма лишь подставляет его как значение по умолчанию.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsUUID()
  quickEstimateId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}
