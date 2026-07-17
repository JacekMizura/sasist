-- 025: ensure app_users protection columns (auth-critical for login SELECT)
-- Project uses startup ensure_* (no Alembic). This SQL is for manual/ops apply on PostgreSQL.
-- Safe defaults: false/false/true/true. SUPER_ADMIN rows locked after add.

ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_system_user BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_deletable BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS is_role_changeable BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE app_users
SET is_system_user = TRUE, is_deletable = FALSE, is_role_changeable = FALSE
WHERE lower(role) IN ('super_admin', 'superadmin');
