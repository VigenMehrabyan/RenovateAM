-- RenovateAM — чат-бот на сайте (docs/CHAT.md §4).
--
-- Миграция добавляет два новых объекта данных и одно перечисление; ни одной
-- существующей таблицы и ни одной существующей колонки не трогает, поэтому
-- безопасна для боевой базы. Каждый шаг идемпотентен — раннер
-- `pnpm --filter @renovateam/api db:setup` применяет файл один раз, но
-- повторный запуск того же SQL ничего не ломает.
--
-- Владелец обеих таблиц — модуль `chat` (см. @owner в schema.prisma и
-- scripts/check-module-boundaries.mjs).

-- --------------------------------------------------------------------------
-- Кто написал сообщение
-- --------------------------------------------------------------------------
-- Ровно два значения: посетитель и бот. Отдельного значения для менеджера нет
-- намеренно — в первой фазе человек в переписку не вмешивается, он звонит.
-- Появится живой ответ менеджера — добавится значение, а не колонка-флаг.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ChatRole') THEN
        CREATE TYPE "ChatRole" AS ENUM ('VISITOR', 'BOT');
    END IF;
END
$$;

-- --------------------------------------------------------------------------
-- Разговор посетителя с ботом
-- --------------------------------------------------------------------------
-- Отдельной таблицы лидов нет: лид — это сессия с заполненными контактами
-- (lead_captured_at IS NOT NULL). Один источник истины, поэтому «разговор»
-- и «заявка на звонок» не могут разойтись.
--
-- user_id nullable и без обязательной связи с заявкой: разговор начинается
-- до любой регистрации, анонимность — нормальный режим, а не исключение.
--
-- Длины полей совпадают с валидацией DTO (имя 120, почта 254, телефон 32):
-- база повторяет ограничение приложения, чтобы кривые данные не доехали
-- даже в обход API.
CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id"                   UUID PRIMARY KEY,
    "locale"               "Locale" NOT NULL,
    "user_id"              UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "contact_name"         VARCHAR(120),
    "contact_email"        VARCHAR(254),
    "contact_phone"        VARCHAR(32),
    "lead_captured_at"     TIMESTAMPTZ(3),
    "handoff_requested_at" TIMESTAMPTZ(3),
    "handled_at"           TIMESTAMPTZ(3),
    "handled_by_id"        UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "page_url"             VARCHAR(500),
    "last_message_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Выборка лидов: «сессии с контактами» — основной фильтр списка в админке.
CREATE INDEX IF NOT EXISTS "chat_sessions_lead_captured_at_idx"
    ON "chat_sessions" ("lead_captured_at");

-- Очередь менеджера: необработанные сверху, внутри — по свежести разговора.
CREATE INDEX IF NOT EXISTS "chat_sessions_handled_at_last_message_at_idx"
    ON "chat_sessions" ("handled_at", "last_message_at");

-- --------------------------------------------------------------------------
-- Одно сообщение в разговоре
-- --------------------------------------------------------------------------
-- entry_id — не внешний ключ: база знаний живёт файлом в репозитории
-- (apps/api/src/modules/chat/knowledge/entries.ts), таблицы тем нет.
-- Строка хранит id темы «как было на момент ответа»: тема может исчезнуть
-- из базы, но история разговора от этого не портится.
CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id"         UUID PRIMARY KEY,
    "session_id" UUID NOT NULL REFERENCES "chat_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "role"       "ChatRole" NOT NULL,
    "text"       VARCHAR(2000) NOT NULL,
    "entry_id"   VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Чтение разговора целиком в хронологическом порядке — единственный способ,
-- которым эта таблица читается.
CREATE INDEX IF NOT EXISTS "chat_messages_session_id_created_at_idx"
    ON "chat_messages" ("session_id", "created_at");
