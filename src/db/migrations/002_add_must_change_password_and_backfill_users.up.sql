-- Add must_change_password flag to app_user
ALTER TABLE app_user
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true;

-- Backfill user accounts for all existing persons that don't have one.
-- Uses first_name (lowercase, alphanumeric) as username.
-- Default password hash = bcrypt("login123", 12 rounds).
-- Pre-computed hash so this stays pure SQL.
-- $2a$12$m17ydgL3NpL7FgMKLSwNKeazFHgI2PO7dPpEN2lcmTVRyT73SmtJe = "login123"

INSERT INTO app_user (username, password_hash, role, must_change_password, person_id)
SELECT
  -- Build a unique username: lowercase first_name stripped of non-alnum,
  -- appended with a row_number suffix when there are duplicates.
  CASE
    WHEN dup.rn = 1 THEN dup.base_name
    ELSE dup.base_name || (dup.rn - 1)::TEXT
  END AS username,
  '$2a$12$m17ydgL3NpL7FgMKLSwNKeazFHgI2PO7dPpEN2lcmTVRyT73SmtJe' AS password_hash,
  'member' AS role,
  true AS must_change_password,
  dup.id AS person_id
FROM (
  SELECT
    p.id,
    COALESCE(NULLIF(LOWER(REGEXP_REPLACE(p.first_name, '[^a-zA-Z0-9]', '', 'g')), ''), 'user') AS base_name,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(NULLIF(LOWER(REGEXP_REPLACE(p.first_name, '[^a-zA-Z0-9]', '', 'g')), ''), 'user')
      ORDER BY p.created_at
    ) AS rn
  FROM person p
  LEFT JOIN app_user u ON u.person_id = p.id
  WHERE p.is_deleted = false
    AND u.id IS NULL
) dup
ON CONFLICT (person_id) DO NOTHING;
