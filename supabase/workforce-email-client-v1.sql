-- Workforce schedule + PTO engine metadata (stored in profiles.metadata JSON).
-- Keys: workforce_schedule_v1, pto_engine_v1, email_client_v1 (per-user).
-- Run optional normalized tables later for reporting at scale.

-- Example future tables (commented — v1 uses profiles.metadata):
-- CREATE TABLE IF NOT EXISTS public.user_work_schedules (...);
-- CREATE TABLE IF NOT EXISTS public.user_pto_policies (...);
-- CREATE TABLE IF NOT EXISTS public.user_pto_requests (...);
-- CREATE TABLE IF NOT EXISTS public.email_client_folders (...);
-- CREATE TABLE IF NOT EXISTS public.email_thread_folder_assignments (...);

COMMENT ON COLUMN public.profiles.metadata IS
  'JSON preferences including om_calendar_policy, email_client_v1, workforce_schedule_v1, pto_engine_v1';
