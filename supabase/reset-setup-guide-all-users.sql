-- One-off: clear Setup Guide completion for every profile so the initial wizard shows again.
-- Run in Supabase SQL Editor, then hard-refresh the app.
-- Safe to re-run; only removes setup-guide keys from metadata.

UPDATE profiles
SET metadata = COALESCE(metadata, '{}'::jsonb)
  - 'setup_guide_completed_at'
  - 'setup_guide_progress'
WHERE metadata IS NOT NULL;

-- Optional: verify (should return 0 rows with a completion timestamp left)
-- SELECT id, metadata->>'setup_guide_completed_at' AS completed
-- FROM profiles
-- WHERE metadata ? 'setup_guide_completed_at';
