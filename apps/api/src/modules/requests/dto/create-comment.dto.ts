import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Максимальная длина сообщения. Тот же предел показывает счётчик в UI. */
export const MAX_COMMENT_LENGTH = 4000;

/**
 * Новое сообщение в обсуждении заявки.
 *
 * Правки и удаления нет: DTO ровно одна, эндпоинтов PATCH/DELETE не
 * существует. Опечатка исправляется следующим сообщением.
 */
export class CreateCommentDto {
  /**
   * Текст. Может быть пустым, если приложены файлы: «вот чертёж» без слов —
   * нормальное сообщение. Оба пустыми быть не могут, это проверяет сервис.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(MAX_COMMENT_LENGTH)
  text!: string;

  /** Вложения: уже загруженные через двухфазный поток модуля files. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  fileIds?: string[];
}
