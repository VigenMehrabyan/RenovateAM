import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Locale } from '@db/enums';

/** Открытие разговора: POST /chat/sessions (docs/CHAT.md §5.1). */
export class CreateSessionDto {
  /**
   * Язык интерфейса сайта, с которым открыли виджет. Он же `fallback`
   * для определения языка сообщений: пока посетитель ничего не написал,
   * догадываться больше не из чего.
   */
  @IsEnum(Locale)
  locale!: Locale;

  /**
   * Страница, с которой начат разговор. Нужна, чтобы понимать контекст
   * вопроса: «а сколько это стоит?» со страницы услуги и с главной —
   * разные вопросы.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pageUrl?: string;
}
