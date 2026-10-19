import { IsEmail, MaxLength } from 'class-validator';

/**
 * Запрос письма со ссылкой восстановления. Проверяется только форма адреса:
 * существует он или нет — ответ одинаков (ARCHITECTURE §6.5), иначе эндпоинт
 * работал бы перечислителем аккаунтов.
 */
export class ForgotPasswordDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
