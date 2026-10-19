import { IsString, Length, Matches } from 'class-validator';
import { PASSWORD_RULE } from './register.dto';

/**
 * Установка нового пароля по ссылке из письма. Правила пароля — те же, что при
 * регистрации: одно регулярное выражение PASSWORD_RULE на оба потока, чтобы
 * восстановление не стало способом завести пароль слабее разрешённого.
 */
export class ResetPasswordDto {
  @IsString()
  @Length(10, 200)
  token!: string;

  @Matches(PASSWORD_RULE, {
    message: 'password must be at least 8 characters and contain a letter and a digit',
  })
  password!: string;
}
