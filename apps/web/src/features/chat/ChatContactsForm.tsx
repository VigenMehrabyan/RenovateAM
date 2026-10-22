/**
 * Форма контактов — ВНУТРИ ленты сообщений, не модальным окном (§7.3).
 *
 * Появляется после первого ответа бота, когда сервер вернул
 * `needsContacts: true`. Поля — имя, телефон, почта; ошибки показываются
 * под полями (`Field` из общего набора примитивов, те же классы, что
 * во всех формах сайта), тексты — из i18n.
 *
 * Проверка идёт на клиенте до запроса: человек видит опечатку сразу, а
 * сервер получает уже нормализованный номер (§5.1). Это не замена серверной
 * проверке — если она откажет, отказ покажется обычным сообщением об ошибке.
 */
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button, Field, TextInput, describedBy } from '@/components/ui';
import { chatContactsSchema } from './contacts';
import type { ChatContactsValues } from './contacts';

export function ChatContactsForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  /** `true` — контакты приняты; `false` — отказ сервера, форма остаётся. */
  onSubmit: (values: ChatContactsValues) => Promise<boolean>;
}): JSX.Element {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ChatContactsValues>({
    resolver: zodResolver(chatContactsSchema),
    defaultValues: { name: '', phone: '', email: '' },
  });

  const fieldError = (name: keyof ChatContactsValues): string | undefined => {
    const message = errors[name]?.message;
    return message ? t(message) : undefined;
  };

  const submit = handleSubmit(async (values) => {
    const accepted = await onSubmit(values);
    if (accepted) reset();
  });

  return (
    <li>
      <form
        className="chat-contacts"
        onSubmit={submit}
        noValidate
        aria-labelledby="chat-contacts-title"
      >
        <p className="text-sm font-semibold text-ink-800" id="chat-contacts-title">
          {t('chat.contacts.title')}
        </p>
        <p className="mt-1 text-sm text-ink-600">{t('chat.contacts.lead')}</p>

        <div className="mt-3 grid gap-3">
          <Field id="chat-name" label={t('chat.contacts.name')} error={fieldError('name')}>
            <TextInput
              id="chat-name"
              autoComplete="name"
              aria-invalid={Boolean(fieldError('name'))}
              aria-describedby={describedBy('chat-name', undefined, fieldError('name'))}
              {...register('name')}
            />
          </Field>

          <Field
            id="chat-phone"
            label={t('chat.contacts.phone')}
            hint={t('chat.contacts.phoneHint')}
            error={fieldError('phone')}
          >
            <TextInput
              id="chat-phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              aria-invalid={Boolean(fieldError('phone'))}
              aria-describedby={describedBy(
                'chat-phone',
                t('chat.contacts.phoneHint'),
                fieldError('phone'),
              )}
              {...register('phone')}
            />
          </Field>

          <Field id="chat-email" label={t('chat.contacts.email')} error={fieldError('email')}>
            <TextInput
              id="chat-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              aria-invalid={Boolean(fieldError('email'))}
              aria-describedby={describedBy('chat-email', undefined, fieldError('email'))}
              {...register('email')}
            />
          </Field>
        </div>

        <Button type="submit" className="mt-3 w-full" disabled={disabled || isSubmitting}>
          {isSubmitting ? t('common.sending') : t('chat.contacts.submit')}
        </Button>
      </form>
    </li>
  );
}
