-- Expand the status CHECK constraint on relationship to include 'divorced'
ALTER TABLE relationship DROP CONSTRAINT IF EXISTS relationship_status_check;
ALTER TABLE relationship ADD CONSTRAINT relationship_status_check
  CHECK (status IN ('confirmed', 'pending', 'divorced'));
