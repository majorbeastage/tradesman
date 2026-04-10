-- User portal settings blobs: leadsSettingsValues, conversationsAutomaticRepliesValues,
-- estimate_template_use_ai, receipt_template_use_ai, etc. (merged read/write in app code).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.profiles.metadata IS 'JSON: portal-related profile state (e.g. leadsSettingsValues, lead_filter_preferences, conversationsAutomaticRepliesValues, template AI flags).';
