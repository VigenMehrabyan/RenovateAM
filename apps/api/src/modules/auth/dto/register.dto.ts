import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Locale } from '@db/enums';

/** Телефон Армении: +374 и 8 цифр (US-2). Подтверждение телефона не требуется. */
export const ARMENIAN_PHONE = /^\+374\d{8}$/;
/** Пароль: не короче 8 символов, минимум одна буква и одна цифра (US-2). */
export const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

export class RegisterDto {
  @IsString()
  @Length(2, 200)
  fullName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @Matches(ARMENIAN_PHONE, { message: 'phone must match +374XXXXXXXX' })
  phone!: string;

  @IsString()
  @Length(5, 500)
  address!: string;

  @Matches(PASSWORD_RULE, {
    message: 'password must be at least 8 characters and contain a letter and a digit',
  })
  password!: string;

  @IsOptional()
  @IsEnum(Locale)
  locale?: Locale;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  quickEstimateIds?: string[];
}
