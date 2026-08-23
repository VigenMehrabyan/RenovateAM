/**
 * Загрузка файлов: валидация до сети и двухфазный поток
 * (`upload-url` → прямой PUT в R2 → `confirm`), см. ARCHITECTURE §7.1.
 */
import { filesApi } from './api';
import type { FileKind } from './api-types';
import { ApiError } from './http';

/** 25 МБ (MVP US-3). */
export const MAX_FILE_SIZE_BYTES = 26_214_400;

/** Не больше 10 файлов на заявку. */
export const MAX_FILES_PER_REQUEST = 10;

/** Белый список MIME (ARCHITECTURE §7.2). */
export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/vnd.dwg',
  'application/acad',
] as const;

const EXTENSION_TO_MIME: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  dwg: 'image/vnd.dwg',
};

/** Ключ i18n-сообщения об отклонённом файле. */
export type FileRejectionCode = 'unsupportedType' | 'tooLarge' | 'tooMany' | 'empty';

export interface FileValidationOk {
  ok: true;
  /** MIME, который уйдёт в `upload-url`: браузер не всегда его определяет. */
  mime: string;
}

export interface FileValidationFail {
  ok: false;
  code: FileRejectionCode;
}

export type FileValidationResult = FileValidationOk | FileValidationFail;

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Проверяет один файл **до** обращения к сети: тип, соответствие расширения
 * типу и размер. Сеть не трогается ни при одной из этих ошибок (US-3).
 */
export function validateFile(file: {
  name: string;
  size: number;
  type: string;
}): FileValidationResult {
  const extension = extensionOf(file.name);
  const mimeByExtension = EXTENSION_TO_MIME[extension];

  // DWG браузеры отдают как '' или application/octet-stream — доверяем расширению.
  const declared = file.type;
  const known = (ALLOWED_MIME_TYPES as readonly string[]).includes(declared);

  if (!mimeByExtension) return { ok: false, code: 'unsupportedType' };
  if (declared && known && declared !== mimeByExtension && !isDwgPair(declared, mimeByExtension)) {
    return { ok: false, code: 'unsupportedType' };
  }
  if (declared && !known && !isOpaque(declared)) return { ok: false, code: 'unsupportedType' };

  if (file.size <= 0) return { ok: false, code: 'empty' };
  if (file.size > MAX_FILE_SIZE_BYTES) return { ok: false, code: 'tooLarge' };

  return { ok: true, mime: known ? declared : mimeByExtension };
}

function isDwgPair(declared: string, byExtension: string): boolean {
  const dwg = ['image/vnd.dwg', 'application/acad'];
  return dwg.includes(declared) && dwg.includes(byExtension);
}

/** Типы, которые браузер выдаёт, когда не смог определить формат. */
function isOpaque(mime: string): boolean {
  return mime === 'application/octet-stream' || mime === '';
}

/** Проверяет, что общее число файлов не превысит лимит заявки. */
export function validateCount(current: number, incoming: number): FileValidationResult {
  if (current + incoming > MAX_FILES_PER_REQUEST) return { ok: false, code: 'tooMany' };
  return { ok: true, mime: '' };
}

/* --------------------------------------------------------------------------- */
/* Двухфазная загрузка                                                         */
/* --------------------------------------------------------------------------- */

export interface UploadHandle {
  fileId: string;
  size: number;
}

/**
 * Загружает файл: подписанная ссылка → PUT напрямую в хранилище → подтверждение.
 * Прогресс отдаётся через `onProgress` (0..1) — используется XHR, потому что
 * fetch не умеет прогресс отправки.
 */
export async function uploadFile(params: {
  file: File;
  kind: FileKind;
  mime: string;
  requestId?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<UploadHandle> {
  const { file, kind, mime, requestId, onProgress, signal } = params;

  const ticket = await filesApi.uploadUrl(
    {
      ...(requestId ? { requestId } : {}),
      kind,
      originalName: file.name,
      mime,
      size: file.size,
    },
    signal,
  );

  await putToStorage({
    url: ticket.uploadUrl,
    file,
    headers: { 'Content-Type': mime, ...ticket.requiredHeaders },
    ...(onProgress ? { onProgress } : {}),
    ...(signal ? { signal } : {}),
  });

  const confirmed = await filesApi.confirm(ticket.fileId, signal);
  onProgress?.(1);
  return { fileId: ticket.fileId, size: confirmed.size };
}

function putToStorage(params: {
  url: string;
  file: File;
  headers: Record<string, string>;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { url, file, headers, onProgress, signal } = params;

  return new Promise<void>((resolve, reject) => {
    // Сигнал мог быть отменён ещё до отправки — тогда слушатель ниже уже
    // не сработает, и файл ушёл бы в хранилище после удаления из списка.
    if (signal?.aborted) {
      reject(new ApiError({ code: 'NETWORK', status: 0 }));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    for (const [key, value] of Object.entries(headers)) {
      // Content-Length браузер выставляет сам и запрещает менять.
      if (key.toLowerCase() === 'content-length') continue;
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new ApiError({ code: 'UPLOAD_NOT_FOUND', status: xhr.status }));
    };
    xhr.onerror = () => reject(new ApiError({ code: 'NETWORK', status: 0 }));
    xhr.onabort = () => reject(new ApiError({ code: 'NETWORK', status: 0 }));

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}
