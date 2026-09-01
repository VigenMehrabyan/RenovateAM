import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button } from '@/components/ui';
import { filesApi } from '@/lib/api';
import type { FileKind } from '@/lib/api-types';
import { formatFileSize } from '@/lib/format';
import { uploadFile, validateCount, validateFile } from '@/lib/files';
import type { FileRejectionCode } from '@/lib/files';

export interface UploadedItem {
  /** Локальный идентификатор строки списка. */
  localId: string;
  name: string;
  size: number;
  kind: FileKind;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  fileId?: string;
  errorCode?: FileRejectionCode | 'network';
}

let counter = 0;
const nextLocalId = (): string => `f${++counter}`;

/**
 * Раздел загрузки (план БТИ либо желаемый дизайн). Drag-and-drop, прогресс
 * по каждому файлу, удаление до отправки. Валидация типа и размера выполняется
 * до обращения к сети (US-3).
 */
export function FileUploadSection({
  kind,
  title,
  hint,
  items,
  onItemsChange,
  totalCount,
  disabled = false,
}: {
  kind: FileKind;
  title: string;
  hint: string;
  items: UploadedItem[];
  onItemsChange: (updater: (previous: UploadedItem[]) => UploadedItem[]) => void;
  totalCount: number;
  disabled?: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [rejection, setRejection] = useState<FileRejectionCode | null>(null);

  /**
   * Незавершённые загрузки по строкам списка. Без этого удалённый до окончания
   * файл продолжал бы литься в хранилище (и уходить в `confirm`), а уход со
   * страницы оставлял бы висеть запрос на десятки мегабайт.
   */
  const uploads = useRef(new Map<string, AbortController>());

  useEffect(() => {
    const pending = uploads.current;
    return () => {
      for (const controller of pending.values()) controller.abort();
      pending.clear();
    };
  }, []);

  const startUpload = useCallback(
    (item: UploadedItem, file: File, mime: string) => {
      const controller = new AbortController();
      uploads.current.set(item.localId, controller);

      void uploadFile({
        file,
        kind,
        mime,
        signal: controller.signal,
        onProgress: (fraction) =>
          onItemsChange((previous) =>
            previous.map((entry) =>
              entry.localId === item.localId ? { ...entry, progress: fraction } : entry,
            ),
          ),
      })
        .then((handle) => {
          uploads.current.delete(item.localId);
          onItemsChange((previous) =>
            previous.map((entry) =>
              entry.localId === item.localId
                ? { ...entry, status: 'done', progress: 1, fileId: handle.fileId }
                : entry,
            ),
          );
        })
        .catch(() => {
          // Отмена — не ошибка загрузки: строки в списке уже нет.
          if (controller.signal.aborted) return;
          uploads.current.delete(item.localId);
          onItemsChange((previous) =>
            previous.map((entry) =>
              entry.localId === item.localId
                ? { ...entry, status: 'error', errorCode: 'network' }
                : entry,
            ),
          );
        });
    },
    [kind, onItemsChange],
  );

  const accept = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setRejection(null);

      const incoming = Array.from(fileList);
      const countCheck = validateCount(totalCount, incoming.length);
      if (!countCheck.ok) {
        setRejection(countCheck.code);
        return;
      }

      for (const file of incoming) {
        const validation = validateFile(file);
        if (!validation.ok) {
          // Сеть не трогаем: файл отклонён до запроса подписанной ссылки.
          setRejection(validation.code);
          continue;
        }
        const item: UploadedItem = {
          localId: nextLocalId(),
          name: file.name,
          size: file.size,
          kind,
          status: 'uploading',
          progress: 0,
        };
        onItemsChange((previous) => [...previous, item]);
        startUpload(item, file, validation.mime);
      }
    },
    [kind, onItemsChange, startUpload, totalCount],
  );

  const remove = useCallback(
    (item: UploadedItem) => {
      uploads.current.get(item.localId)?.abort();
      uploads.current.delete(item.localId);
      onItemsChange((previous) => previous.filter((entry) => entry.localId !== item.localId));
      if (item.fileId) {
        void filesApi.remove(item.fileId).catch(() => {
          /* черновик подчистит плановое задание на сервере */
        });
      }
    },
    [onItemsChange],
  );

  return (
    <section aria-labelledby={`${inputId}-title`}>
      <h3 className="text-sm font-semibold" id={`${inputId}-title`}>
        {title}
      </h3>
      <p className="mt-0.5 text-sm text-ink-600">{hint}</p>

      <div
        className={`mt-3 rounded border border-dashed p-4 text-center transition-colors ${
          dragActive ? 'border-accent-500 bg-accent-50' : 'border-ink-300 bg-white'
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          if (!disabled) accept(event.dataTransfer.files);
        }}
      >
        <p className="text-sm text-ink-600">{t('request.files.dropzone')}</p>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,.jpg,.jpeg,.png,.dwg,application/pdf,image/jpeg,image/png"
          disabled={disabled}
          // Поле спрятано визуально, но остаётся в дереве доступности: без
          // имени программа чтения объявляла его просто «кнопка выбора файла»,
          // не называя, план это БТИ или дизайн.
          aria-label={title}
          aria-describedby={`${inputId}-formats`}
          onChange={(event) => {
            accept(event.target.files);
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="mt-3"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {t('request.files.browse')}
        </Button>
        <p className="mt-2 text-xs text-ink-500" id={`${inputId}-formats`}>
          {t('request.files.formats')}
        </p>
      </div>

      {rejection ? (
        <Alert tone="danger" className="mt-3">
          {t(`request.files.errors.${rejection}`)}
        </Alert>
      ) : null}

      <ul className="mt-3 divide-y divide-ink-200 border-y border-ink-200">
        {items.length === 0 ? (
          <li className="py-2 text-sm text-ink-500">{t('request.files.empty')}</li>
        ) : null}
        {items.map((item) => (
          <li key={item.localId} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="user-text text-sm text-ink-800">{item.name}</p>
              <p className="tnum text-xs text-ink-500">
                {formatFileSize(item.size)} ·{' '}
                {item.status === 'done'
                  ? t('request.files.uploaded')
                  : item.status === 'error'
                    ? t('request.files.failed')
                    : `${t('request.files.uploading')} ${Math.round(item.progress * 100)}%`}
              </p>
              {item.status === 'uploading' ? (
                <div
                  className="mt-1 h-1 w-full rounded bg-ink-100"
                  role="progressbar"
                  aria-valuenow={Math.round(item.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={item.name}
                >
                  <div
                    className="h-1 rounded bg-accent-500"
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>
              ) : null}
            </div>
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
    </section>
  );
}
