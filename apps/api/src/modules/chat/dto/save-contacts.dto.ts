import { IsString } from 'class-validator';

/**
 * Контакты посетителя: POST /chat/sessions/:id/contacts.
 *
 * Все три поля проверяет сервис, а не декораторы: контракт требует `400`
 * с перечислением полей в `details`, а ValidationPipe отдаёт 422. Проверка
 * в одном месте ещё и даёт одинаковый формат ошибки для всех трёх полей.
 */
export class SaveContactsDto {
  @IsString()
  name!: string;

  @IsString()
  email!: string;

  @IsString()
  phone!: string;
}
