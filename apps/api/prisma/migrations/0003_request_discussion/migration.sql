-- RenovateAM — обсуждение внутри заявки.
--
-- Идёт на боевую базу с существующими заявками, поэтому не трогает ни одной
-- существующей строки и ни одной существующей колонки: добавляются только две
-- новые таблицы. Каждый шаг идемпотентен (`IF NOT EXISTS`) — раннер
-- `pnpm db:setup` применяет миграцию один раз, но повторный запуск её же
-- файла ничего не ломает.
--
-- Владелец обеих таблиц — модуль `requests`: обсуждение часть заявки,
-- отдельного модуля у него нет (см. @owner в schema.prisma и
-- scripts/check-module-boundaries.mjs).

-- --------------------------------------------------------------------------
-- 1. Сообщения
-- --------------------------------------------------------------------------
-- author_id — SET NULL: отключённая учётная запись не стирает переписку.
-- author_role — снимок роли на момент написания. Он намеренно дублирует
-- users.role: роль пользователя может смениться (сметчик стал админом,
-- сотрудник уволился), а лента обязана и через год показывать, кто говорил
-- как клиент, а кто как сметчик.
CREATE TABLE IF NOT EXISTS "comments" (
    "id"          UUID PRIMARY KEY,
    "request_id"  UUID NOT NULL REFERENCES "requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "author_id"   UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "author_role" "UserRole" NOT NULL,
    "text"        VARCHAR(4000) NOT NULL,
    "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Лента одной заявки в хронологическом порядке — единственный частый запрос.
CREATE INDEX IF NOT EXISTS "comments_request_id_created_at_idx"
    ON "comments" ("request_id", "created_at");
CREATE INDEX IF NOT EXISTS "comments_author_id_created_at_idx"
    ON "comments" ("author_id", "created_at");

-- Правок и удалений у ленты нет ни в API, ни в коде: переписка о деньгах —
-- документ. Ограничение на уровне БД здесь не ставится намеренно — оно
-- закрыло бы и миграции данных; отсутствие эндпоинтов проверяется тестом.

-- --------------------------------------------------------------------------
-- 2. Вложения сообщений
-- --------------------------------------------------------------------------
-- Связь с уже существующей записью в "files" (двухфазная загрузка модуля
-- files), а не копия файла. Пара (comment_id, file_id) — первичный ключ:
-- повторная привязка того же файла к тому же сообщению невозможна.
CREATE TABLE IF NOT EXISTS "comment_files" (
    "comment_id" UUID NOT NULL REFERENCES "comments" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "file_id"    UUID NOT NULL REFERENCES "files" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("comment_id", "file_id")
);

-- «Этот файл пришёл из переписки?» — пометка в общем списке файлов заявки.
CREATE INDEX IF NOT EXISTS "comment_files_file_id_idx" ON "comment_files" ("file_id");
