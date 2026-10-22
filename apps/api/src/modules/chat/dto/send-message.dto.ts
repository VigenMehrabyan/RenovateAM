import { IsString } from 'class-validator';

/**
 * Сообщение посетителя: POST /chat/sessions/:id/messages.
 *
 * Длина проверяется не здесь, а в сервисе: контракт требует 1–1000 символов
 * ПОСЛЕ `trim` и код `400 VALIDATION_FAILED`, а ValidationPipe отвечает 422
 * и считает длину до обрезки пробелов.
 */
export class SendMessageDto {
  @IsString()
  text!: string;
}
