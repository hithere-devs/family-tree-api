-- First update any divorced rows back to confirmed so constraint doesn't fail
UPDATE relationship SET status = 'confirmed' WHERE status = 'divorced';

-- Restore original constraint
ALTER TABLE relationship DROP CONSTRAINT IF EXISTS relationship_status_check;
ALTER TABLE relationship ADD CONSTRAINT relationship_status_check
  CHECK (status IN ('confirmed', 'pending'));
