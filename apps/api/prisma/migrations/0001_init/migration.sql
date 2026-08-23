-- RenovateAM — начальная схема.
--
-- Миграция написана вручную и применяется скриптом `pnpm db:setup`.
-- Причина: в среде разработки недоступен schema-engine Prisma (загрузка
-- бинарников с binaries.prisma.sh заблокирована), поэтому `prisma migrate`
-- не используется. Плюс здесь живут ограничения, которые Prisma не выражает
-- декларативно: частичные уникальные индексы и CHECK-constraint'ы.

-- --------------------------------------------------------------------------
-- Enum-ы
-- --------------------------------------------------------------------------
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'ESTIMATOR', 'ADMIN');
CREATE TYPE "Locale" AS ENUM ('RU', 'HY', 'EN');
CREATE TYPE "ObjectType" AS ENUM ('APARTMENT', 'HOUSE');
CREATE TYPE "WorkScope" AS ENUM ('TURNKEY', 'FINISHING', 'ROUGH');
CREATE TYPE "FinishPackage" AS ENUM ('STANDARD', 'DESIGNER');
CREATE TYPE "PropertyCondition" AS ENUM ('NEW_BUILDING', 'SECONDARY_WITH_DEMOLITION');
CREATE TYPE "CeilingHeight" AS ENUM ('UP_TO_3M', 'FROM_3M');
CREATE TYPE "RequestStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'NEEDS_INFO', 'QUOTE_READY', 'ACCEPTED', 'REJECTED');
CREATE TYPE "FileKind" AS ENUM ('BTI', 'DESIGN');
CREATE TYPE "DecisionResult" AS ENUM ('ACCEPTED', 'REJECTED');
CREATE TYPE "RejectionReason" AS ENUM ('TOO_EXPENSIVE', 'TOO_LONG', 'CHOSE_ANOTHER_CONTRACTOR', 'POSTPONED', 'OTHER');

-- --------------------------------------------------------------------------
-- auth
-- --------------------------------------------------------------------------
CREATE TABLE "users" (
    "id"                UUID PRIMARY KEY,
    "full_name"         VARCHAR(200) NOT NULL,
    "email"             VARCHAR(320) NOT NULL,
    "email_verified_at" TIMESTAMPTZ(3),
    "phone"             VARCHAR(20) NOT NULL,
    "address"           VARCHAR(500) NOT NULL,
    "password_hash"     VARCHAR(72) NOT NULL,
    "role"              "UserRole" NOT NULL DEFAULT 'CLIENT',
    "locale"            "Locale" NOT NULL DEFAULT 'RU',
    "created_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
CREATE INDEX "users_phone_idx" ON "users" ("phone");
CREATE INDEX "users_role_idx" ON "users" ("role");

CREATE TABLE "verification_tokens" (
    "id"         UUID PRIMARY KEY,
    "user_id"    UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at"    TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "verification_tokens_token_hash_key" ON "verification_tokens" ("token_hash");
CREATE INDEX "verification_tokens_user_id_created_at_idx" ON "verification_tokens" ("user_id", "created_at");
CREATE INDEX "verification_tokens_expires_at_idx" ON "verification_tokens" ("expires_at");

CREATE TABLE "refresh_tokens" (
    "id"         UUID PRIMARY KEY,
    "user_id"    UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "token_hash" CHAR(64) NOT NULL,
    "family_id"  UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" VARCHAR(300),
    "ip"         VARCHAR(45),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens" ("token_hash");
CREATE INDEX "refresh_tokens_user_id_revoked_at_idx" ON "refresh_tokens" ("user_id", "revoked_at");
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" ("family_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" ("expires_at");

-- --------------------------------------------------------------------------
-- pricing
-- --------------------------------------------------------------------------
CREATE TABLE "rate_versions" (
    "id"         UUID PRIMARY KEY,
    "created_by" UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "note"       VARCHAR(500),
    "is_active"  BOOLEAN NOT NULL DEFAULT FALSE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "rate_versions_is_active_created_at_idx" ON "rate_versions" ("is_active", "created_at");
CREATE INDEX "rate_versions_created_at_idx" ON "rate_versions" ("created_at");
-- Инвариант: активная версия ставок ровно одна.
CREATE UNIQUE INDEX "rate_versions_single_active" ON "rate_versions" ("is_active") WHERE "is_active" = TRUE;

CREATE TABLE "pricing_rates" (
    "id"         UUID PRIMARY KEY,
    "version_id" UUID NOT NULL REFERENCES "rate_versions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "key"        VARCHAR(64) NOT NULL,
    "value"      DECIMAL(14, 4) NOT NULL
);
CREATE UNIQUE INDEX "pricing_rates_version_id_key_key" ON "pricing_rates" ("version_id", "key");
CREATE INDEX "pricing_rates_version_id_idx" ON "pricing_rates" ("version_id");

CREATE TABLE "quick_estimates" (
    "id"              UUID PRIMARY KEY,
    "user_id"         UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "area_sqm"        DECIMAL(7, 2) NOT NULL,
    "object_type"     "ObjectType" NOT NULL,
    "work_scope"      "WorkScope" NOT NULL,
    "finish_package"  "FinishPackage" NOT NULL,
    "condition"       "PropertyCondition" NOT NULL,
    "ceiling_height"  "CeilingHeight" NOT NULL,
    "amount_min"      INTEGER,
    "amount_max"      INTEGER,
    "amount_base"     INTEGER,
    "needs_manual"    BOOLEAN NOT NULL DEFAULT FALSE,
    "rate_version_id" UUID NOT NULL REFERENCES "rate_versions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "expires_at"      TIMESTAMPTZ(3) NOT NULL,
    "locale"          "Locale" NOT NULL DEFAULT 'RU',
    "created_at"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "quick_estimates_user_id_created_at_idx" ON "quick_estimates" ("user_id", "created_at");
CREATE INDEX "quick_estimates_created_at_idx" ON "quick_estimates" ("created_at");
CREATE INDEX "quick_estimates_rate_version_id_idx" ON "quick_estimates" ("rate_version_id");
-- Дизайнерский пакет не имеет сумм — инвариант закреплён в БД.
ALTER TABLE "quick_estimates" ADD CONSTRAINT "quick_estimates_designer_has_no_amounts"
    CHECK ("finish_package" <> 'DESIGNER'
        OR ("amount_min" IS NULL AND "amount_max" IS NULL AND "amount_base" IS NULL));

-- --------------------------------------------------------------------------
-- requests
-- --------------------------------------------------------------------------
CREATE TABLE "requests" (
    "id"                UUID PRIMARY KEY,
    "number"            SERIAL NOT NULL,
    "user_id"           UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "quick_estimate_id" UUID REFERENCES "quick_estimates" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "status"            "RequestStatus" NOT NULL DEFAULT 'NEW',
    "needs_manual"      BOOLEAN NOT NULL DEFAULT FALSE,
    "comment"           VARCHAR(2000),
    "created_at"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMPTZ(3) NOT NULL
);
CREATE UNIQUE INDEX "requests_number_key" ON "requests" ("number");
CREATE UNIQUE INDEX "requests_quick_estimate_id_key" ON "requests" ("quick_estimate_id");
CREATE INDEX "requests_status_created_at_idx" ON "requests" ("status", "created_at");
CREATE INDEX "requests_user_id_created_at_idx" ON "requests" ("user_id", "created_at");
-- Инвариант: у клиента не больше одной активной заявки.
CREATE UNIQUE INDEX "requests_one_active_per_user" ON "requests" ("user_id")
    WHERE "status" IN ('NEW', 'IN_PROGRESS', 'NEEDS_INFO', 'QUOTE_READY');

CREATE TABLE "status_log" (
    "id"          UUID PRIMARY KEY,
    "request_id"  UUID NOT NULL REFERENCES "requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "from_status" "RequestStatus",
    "to_status"   "RequestStatus" NOT NULL,
    "actor_id"    UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "comment"     VARCHAR(2000),
    "created_at"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "status_log_request_id_created_at_idx" ON "status_log" ("request_id", "created_at");
CREATE INDEX "status_log_actor_id_created_at_idx" ON "status_log" ("actor_id", "created_at");

CREATE TABLE "decisions" (
    "id"         UUID PRIMARY KEY,
    "request_id" UUID NOT NULL REFERENCES "requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "result"     "DecisionResult" NOT NULL,
    "reason"     "RejectionReason",
    "comment"    VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "decisions_request_id_key" ON "decisions" ("request_id");
CREATE INDEX "decisions_result_created_at_idx" ON "decisions" ("result", "created_at");
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_reason_required"
    CHECK ("result" <> 'REJECTED' OR "reason" IS NOT NULL);
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_other_comment_required"
    CHECK ("reason" IS DISTINCT FROM 'OTHER' OR ("comment" IS NOT NULL AND length(btrim("comment")) > 0));

-- --------------------------------------------------------------------------
-- files
-- --------------------------------------------------------------------------
CREATE TABLE "files" (
    "id"            UUID PRIMARY KEY,
    "user_id"       UUID NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "request_id"    UUID REFERENCES "requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "kind"          "FileKind" NOT NULL,
    "original_name" VARCHAR(300) NOT NULL,
    "storage_key"   VARCHAR(500) NOT NULL,
    "mime"          VARCHAR(150) NOT NULL,
    "size"          INTEGER NOT NULL,
    "uploaded_at"   TIMESTAMPTZ(3),
    "created_at"    TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "files_storage_key_key" ON "files" ("storage_key");
CREATE INDEX "files_request_id_kind_idx" ON "files" ("request_id", "kind");
CREATE INDEX "files_user_id_request_id_idx" ON "files" ("user_id", "request_id");
CREATE INDEX "files_uploaded_at_idx" ON "files" ("uploaded_at");

-- --------------------------------------------------------------------------
-- admin
-- --------------------------------------------------------------------------
CREATE TABLE "quotes" (
    "id"           UUID PRIMARY KEY,
    "request_id"   UUID NOT NULL REFERENCES "requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "author_id"    UUID REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "file_key"     VARCHAR(500) NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "is_current"   BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at"   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "quotes_file_key_key" ON "quotes" ("file_key");
CREATE INDEX "quotes_request_id_created_at_idx" ON "quotes" ("request_id", "created_at");
CREATE INDEX "quotes_author_id_idx" ON "quotes" ("author_id");
-- Инвариант: у заявки не больше одной актуальной сметы.
CREATE UNIQUE INDEX "quotes_one_current_per_request" ON "quotes" ("request_id") WHERE "is_current" = TRUE;
