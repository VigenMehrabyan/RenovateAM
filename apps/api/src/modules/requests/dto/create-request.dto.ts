import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Создание заявки (US-4). Файлы не обязательны — они не блокируют отправку. */
export class CreateRequestDto {
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
