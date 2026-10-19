-- RenovateAM — восстановление пароля по ссылке из письма.
--
-- Идёт на боевую базу с существующими пользователями, поэтому не трогает ни
-- одной существующей строки и ни одной существующей колонки: добавляется
-- только одна новая таблица. Каждый шаг идемпотентен (`IF NOT EXISTS`) —
-- раннер `pnpm db:setup` применяет миграцию один раз, но повторный запуск
-- того же файла ничего не ломает.
--
-- Владелец таблицы — модуль `auth` (см. @owner в schema.prisma и
-- scripts/check-module-boundaries.mjs).

-- --------------------------------------------------------------------------
-- Одноразовые ссылки восстановления пароля
-- --------------------------------------------------------------------------
-- Таблица отдельная от "verification_tokens" намеренно: у ссылок разные
-- полномочия. Верификация подтверждает адрес, восстановление меняет пароль и
-- гасит все сессии. В общей таблице забытый фильтр по типу превратил бы
-- ссылку верификации в ссылку смены пароля; разные таблицы делают такую
-- ошибку невозможной, а не маловероятной.
--
-- token_hash — SHA-256 (ровно 64 hex-символа) от токена из письма. Сам токен
-- в базе не хранится: дамп БД не даёт сменить пароль чужому аккаунту.
--
-- expires_at заполняет приложение (сейчас +60 минут, константа
-- PASSWORD_RESET_TTL_MS). Срок лежит в строке, а не вычисляется при чтении:
-- смена TTL не требует миграции и не задевает уже выпущенные ссылки.
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id"         UUID PRIMARY KEY,
    "user_id"    UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at"    TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Поиск по хешу — единственный способ найти запись при проверке ссылки.
-- Уникальность здесь ещё и защита от коллизии выпуска.
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key"
    ON "password_reset_tokens" ("token_hash");

-- Гашение прочих неиспользованных ссылок пользователя при использовании любой
-- из них, плюс диагностика «сколько раз человек запрашивал письмо».
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_created_at_idx"
    ON "password_reset_tokens" ("user_id", "created_at");

-- Чистка просроченных ссылок фоновым заданием.
CREATE INDEX IF NOT EXISTS "password_reset_tokens_expires_at_idx"
    ON "password_reset_tokens" ("expires_at");
