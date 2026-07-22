-- Label push tokens by app so Instant Messaging can target Tradesman Messaging.
-- Run in Supabase SQL Editor after deploy.

ALTER TABLE public.user_push_devices
  ADD COLUMN IF NOT EXISTS app_id text NOT NULL DEFAULT 'com.tradesmanus.com';

CREATE INDEX IF NOT EXISTS user_push_devices_user_app_idx
  ON public.user_push_devices (user_id, app_id);

COMMENT ON COLUMN public.user_push_devices.app_id IS
  'Android/iOS application id that registered the token (com.tradesmanus.com = main, com.tradesmanus.messaging = Messaging).';
