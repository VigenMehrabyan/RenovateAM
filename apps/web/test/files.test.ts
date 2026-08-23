import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FILE_SIZE_BYTES, uploadFile, validateCount, validateFile } from '@/lib/files';

const fetchSpy = vi.fn();

beforeEach(() => {
  fetchSpy.mockReset();
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
});

const file = (name: string, size: number, type: string) => ({ name, size, type });

describe('валидация файлов до сети', () => {
  it('принимает PDF, JPG, PNG и DWG', () => {
    expect(validateFile(file('plan.pdf', 1024, 'application/pdf'))).toEqual({
      ok: true,
      mime: 'application/pdf',
    });
    expect(validateFile(file('photo.jpg', 2048, 'image/jpeg')).ok).toBe(true);
    expect(validateFile(file('photo.png', 2048, 'image/png')).ok).toBe(true);
    // DWG браузер обычно не распознаёт — тип берётся по расширению.
    expect(validateFile(file('scheme.dwg', 4096, ''))).toEqual({ ok: true, mime: 'image/vnd.dwg' });
  });

  it('отклоняет неподдерживаемый формат, не обращаясь к сети', () => {
    expect(validateFile(file('notes.docx', 1024, 'application/msword'))).toEqual({
      ok: false,
      code: 'unsupportedType',
    });
    expect(validateFile(file('archive.zip', 1024, 'application/zip')).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('отклоняет расширение, не совпадающее с типом', () => {
    expect(validateFile(file('plan.pdf', 1024, 'image/png'))).toEqual({
      ok: false,
      code: 'unsupportedType',
    });
  });

  it('отклоняет файл больше 25 МБ, не обращаясь к сети', () => {
    expect(validateFile(file('plan.pdf', MAX_FILE_SIZE_BYTES + 1, 'application/pdf'))).toEqual({
      ok: false,
      code: 'tooLarge',
    });
    expect(validateFile(file('plan.pdf', MAX_FILE_SIZE_BYTES, 'application/pdf')).ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('отклоняет пустой файл', () => {
    expect(validateFile(file('plan.pdf', 0, 'application/pdf'))).toEqual({
      ok: false,
      code: 'empty',
    });
  });

  it('не пускает больше 10 файлов на заявку', () => {
    expect(validateCount(8, 2).ok).toBe(true);
    expect(validateCount(8, 3)).toEqual({ ok: false, code: 'tooMany' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('отмена загрузки', () => {
  it('уже отменённая загрузка не уходит в хранилище', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({
          fileId: 'f1',
          uploadUrl: 'https://storage.example/put',
          expiresAt: '2026-08-23T10:15:00Z',
          requiredHeaders: {},
        }),
    });
    const send = vi.spyOn(XMLHttpRequest.prototype, 'send');

    const controller = new AbortController();
    controller.abort();

    await expect(
      uploadFile({
        file: new File(['x'], 'plan.pdf', { type: 'application/pdf' }),
        kind: 'BTI',
        mime: 'application/pdf',
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(Error);

    // Файл, удалённый из списка до конца загрузки, не должен долиться
    // в хранилище и не должен подтверждаться на сервере.
    expect(send).not.toHaveBeenCalled();
  });
});
