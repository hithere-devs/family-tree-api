-- Remove backfilled user accounts (those with default password hash)
DELETE FROM app_user
WHERE password_hash = '$2a$12$m17ydgL3NpL7FgMKLSwNKeazFHgI2PO7dPpEN2lcmTVRyT73SmtJe';

-- Drop must_change_password column
ALTER TABLE app_user
DROP COLUMN IF EXISTS must_change_password;
