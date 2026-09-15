import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Alert, Button, Section, TextArea } from '@/components/ui';
import { isStaff, useAuth } from '@/features/auth/auth-context';
import { filesApi, requestsApi } from '@/lib/api';
import { MAX_COMMENT_LENGTH } from '@/lib/api-types';
import type { CommentView, RequestResponse, UserRole } from '@/lib/api-types';
import { openSignedUrl } from '@/lib/download';
import { uploadFile, validateFile } from '@/lib/files';
import type { FileRejectionCode } from '@/lib/files';
import { formatDateTime, formatFileSize } from '@/lib/format';
import { useErrorMessage } from '@/lib/use-error-message';

/** Черновик сообщения переживает обрыв отправки и перезагрузку страницы. */
const draftKey = (requestId: string): string => `renovateam.discussion.${requestId}`;

function readDraft(requestId: string): string {
  try {
    return window.sessionStorage.getItem(draftKey(requestId)) ?? '';
  } catch {
    return '';
  }
}

function writeDraft(requestId: string, value: string): void {
  try {
    if (value) window.sessionStorage.setItem(draftKey(requestId), value);
    else window.sessionStorage.removeItem(draftKey(requestId));
  } catch {
    /* приватный режим без хранилища — черновик просто не переживёт перезагрузку */
  }
}

/** Вложение в процессе загрузки: сообщение не уйдёт, пока файл не долетел. */
interface PendingAttachment {
  localId: string;
  name: string;
  size: number;
  status: 'uploading' | 'done' | 'error';
  fileId?: string;
  errorCode?: FileRejectionCode | 'network';
}

let counter = 0;
const nextLocalId = (): string => `a${++counter}`;

/** Сторона переписки: клиент или компания. Роль автора — снимок, а не текущая. */
function sideOf(role: UserRole): 'CLIENT' | 'STAFF' {
  return role === 'CLIENT' ? 'CLIENT' : 'STAFF';
}

/**
 * Обсуждение внутри заявки.
 *
 * Существует ради одного: чтобы сметчик спросил, а клиент дослал недостающее,
 * не поднимая трубку. Поэтому лента одна и та же и в кабинете, и в карточке
 * сметчика — отвечают оттуда же, где читают.
 *
 * Сообщения не редактируются и не удаляются: переписка о деньгах — документ.
 * Опечатку исправляют следующим сообщением, кнопок правки здесь нет.
 */
export function DiscussionPanel({
  request,
  queryKey,
}: {
  request: RequestResponse;
  /** Ключ запроса карточки — после отправки лента перечитывается. */
  queryKey: readonly unknown[];
}): JSX.Element {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const comments = request.comments ?? [];
  // Своя сторона — справа: у клиента справа его сообщения, у сметчика — свои.
  const mySide = isStaff(user) ? 'STAFF' : 'CLIENT';
  // Отклонённая заявка: лента остаётся, дописывать в неё нечего.
  const readOnly = request.status === 'REJECTED';

  return (
    <Section title={t('discussion.title')} description={t('discussion.lead')} id="discussion">
      <ol className="space-y-3">
        {comments.length === 0 ? (
          <li className="surface p-4 text-sm text-ink-500">
            <p className="font-medium text-ink-700">{t('discussion.empty')}</p>
            <p className="mt-1">{t('discussion.emptyHint')}</p>
          </li>
        ) : null}
        {comments.map((comment) => (
          <Message
            key={comment.id}
            comment={comment}
            mine={sideOf(comment.author.role) === mySide}
            locale={i18n.language}
          />
        ))}
      </ol>

      {readOnly ? (
        <Alert tone="info" className="mt-4">
          {t('discussion.closed')}
        </Alert>
      ) : (
        <Composer requestId={request.id} queryKey={queryKey} />
      )}
    </Section>
  );
}

/** Одно сообщение: сторона задаётся выравниванием, автор и роль — подписью. */
function Message({
  comment,
  mine,
  locale,
}: {
  comment: CommentView;
  mine: boolean;
  locale: string;
}): JSX.Element {
  const { t } = useTranslation();
  const staff = sideOf(comment.author.role) === 'STAFF';

  return (
    <li className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`min-w-0 max-w-[min(34rem,88%)] rounded-xl border px-4 py-3 ${
          staff ? 'border-accent-200 bg-accent-50' : 'border-ink-200 bg-white'
        }`}
      >
        <p className="text-xs text-ink-500">
          <span className="font-semibold text-ink-700">
            {comment.author.name ?? t('discussion.deletedAuthor')}
          </span>
          {' · '}
          <span>{t(`discussion.roles.${comment.author.role}`)}</span>
          {' · '}
          <span className="tnum">{formatDateTime(comment.createdAt, locale)}</span>
        </p>
        {comment.text ? (
          <p className="user-text mt-1 whitespace-pre-wrap text-sm text-ink-900">{comment.text}</p>
        ) : null}
        {comment.files.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {comment.files.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-2">
                <span className="user-text min-w-0 text-sm text-ink-700">{file.originalName}</span>
                <AttachmentDownload fileId={file.id} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}

function AttachmentDownload({ fileId }: { fileId: string }): JSX.Element {
  const { t } = useTranslation();
  const toMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);

  const open = async (): Promise<void> => {
    setError(null);
    try {
      await openSignedUrl(() => filesApi.downloadUrl(fileId));
    } catch (caught) {
      setError(toMessage(caught));
    }
  };

  return (
    <span className="shrink-0">
      <Button variant="ghost" onClick={() => void open()}>
        {t('common.download')}
      </Button>
      {error ? (
        <span className="field-error block text-right" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Поле ввода с вложениями.
 *
 * Счётчик символов виден заранее, а не появляется на 3999-м знаке. Кнопка
 * отправки заблокирована, пока вложение не долетело: сообщение «вот чертёж»
 * без чертежа бессмысленно. Текст при неудачной отправке не теряется —
 * он остаётся в поле и в черновике сессии.
 */
function Composer({
  requestId,
  queryKey,
}: {
  requestId: string;
  queryKey: readonly unknown[];
}): JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toMessage = useErrorMessage();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => readDraft(requestId));
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [rejection, setRejection] = useState<FileRejectionCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Незавершённые загрузки: уход со страницы не должен оставить висящий PUT. */
  const uploads = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const pending = uploads.current;
    return () => {
      for (const controller of pending.values()) controller.abort();
      pending.clear();
    };
  }, []);

  const mutation = useMutation({
    mutationFn: (payload: { text: string; fileIds?: string[] }) =>
      requestsApi.addComment(requestId, payload),
    onSuccess: () => {
      setText('');
      writeDraft(requestId, '');
      setAttachments([]);
      setError(null);
      void queryClient.invalidateQueries({ queryKey });
    },
    // Текст остаётся в поле: при обрыве терять написанное нельзя.
    onError: (caught) => setError(toMessage(caught)),
  });

  const accept = useCallback((fileList: FileList | null): void => {
    if (!fileList || fileList.length === 0) return;
    setRejection(null);

    for (const file of Array.from(fileList)) {
      const validation = validateFile(file);
      if (!validation.ok) {
        // Сеть не трогаем: файл отклонён до запроса подписанной ссылки.
        setRejection(validation.code);
        continue;
      }
      const item: PendingAttachment = {
        localId: nextLocalId(),
        name: file.name,
        size: file.size,
        status: 'uploading',
      };
      setAttachments((previous) => [...previous, item]);

      const controller = new AbortController();
      uploads.current.set(item.localId, controller);
      void uploadFile({ file, kind: 'BTI', mime: validation.mime, signal: controller.signal })
        .then((handle) => {
          uploads.current.delete(item.localId);
          setAttachments((previous) =>
            previous.map((entry) =>
              entry.localId === item.localId
                ? { ...entry, status: 'done', fileId: handle.fileId }
                : entry,
            ),
          );
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          uploads.current.delete(item.localId);
          setAttachments((previous) =>
            previous.map((entry) =>
              entry.localId === item.localId
                ? { ...entry, status: 'error', errorCode: 'network' }
                : entry,
            ),
          );
        });
    }
  }, []);

  const remove = useCallback((item: PendingAttachment): void => {
    uploads.current.get(item.localId)?.abort();
    uploads.current.delete(item.localId);
    setAttachments((previous) => previous.filter((entry) => entry.localId !== item.localId));
    if (item.fileId) {
      void filesApi.remove(item.fileId).catch(() => {
        /* черновик подчистит плановое задание на сервере */
      });
    }
  }, []);

  const uploading = attachments.some((item) => item.status === 'uploading');
  const ready = attachments.filter((item) => item.status === 'done');
  const empty = text.trim().length === 0 && ready.length === 0;

  const submit = (): void => {
    if (uploading || empty || mutation.isPending) return;
    setError(null);
    mutation.mutate({
      text: text.trim(),
      ...(ready.length > 0 ? { fileIds: ready.map((item) => item.fileId as string) } : {}),
    });
  };

  return (
    <div className="mt-4">
      <label className="field-label" htmlFor="discussion-text">
        {t('discussion.label')}
      </label>
      <TextArea
        id="discussion-text"
        rows={3}
        maxLength={MAX_COMMENT_LENGTH}
        placeholder={t('discussion.placeholder')}
        aria-describedby="discussion-counter"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          writeDraft(requestId, event.target.value);
        }}
      />
      {/* Счётчик виден всегда, а не появляется у самого предела. */}
      <p className="tnum mt-1 text-xs text-ink-500" id="discussion-counter">
        {t('discussion.counter', { current: text.length, max: MAX_COMMENT_LENGTH })}
      </p>

      {attachments.length > 0 ? (
        <ul className="mt-2 space-y-1" aria-label={t('discussion.attachmentsLabel')}>
          {attachments.map((item) => (
            <li key={item.localId} className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className="user-text block text-sm text-ink-800">{item.name}</span>
                <span className="tnum block text-xs text-ink-500">
                  {formatFileSize(item.size)} ·{' '}
                  {item.status === 'done'
                    ? t('request.files.uploaded')
                    : item.status === 'error'
                      ? t('discussion.uploadFailed')
                      : t('discussion.uploading')}
                </span>
              </span>
              <Button
                type="button"
                variant="ghost"
                aria-label={t('request.files.removeFile', { name: item.name })}
                onClick={() => remove(item)}
              >
                {t('common.remove')}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {rejection ? (
        <Alert tone="danger" className="mt-3">
          {t(`request.files.errors.${rejection}`)}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" className="mt-3" title={t('errors.title')}>
          {error}
        </Alert>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id="discussion-file"
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,.jpg,.jpeg,.png,.dwg,application/pdf,image/jpeg,image/png"
          aria-label={t('discussion.attach')}
          onChange={(event) => {
            accept(event.target.files);
            event.target.value = '';
          }}
        />
        <Button type="button" variant="secondary" onClick={() => inputRef.current?.click()}>
          {t('discussion.attach')}
        </Button>
        <Button type="button" disabled={empty || uploading || mutation.isPending} onClick={submit}>
          {mutation.isPending ? t('common.sending') : t('discussion.send')}
        </Button>
        {uploading ? (
          <span className="text-xs text-ink-500">{t('discussion.waitUpload')}</span>
        ) : null}
      </div>
      <p className="mt-2 text-xs text-ink-500">{t('request.files.formats')}</p>
    </div>
  );
}
