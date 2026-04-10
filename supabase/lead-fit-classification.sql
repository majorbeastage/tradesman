-- Lead fit (hot / maybe / bad): columns on leads + audit log table.
-- Preferences are stored in profiles.metadata.lead_filter_preferences (JSON); see app code.
-- Run in Supabase SQL editor after leads table exists.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS fit_classification text CHECK (fit_classification IS NULL OR fit_classification IN ('hot', 'maybe', 'bad')),
  ADD COLUMN IF NOT EXISTS fit_confidence double precision,
  ADD COLUMN IF NOT EXISTS fit_reason text,
  ADD COLUMN IF NOT EXISTS fit_source text,
  ADD COLUMN IF NOT EXISTS fit_manually_overridden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fit_evaluated_at timestamptz;

COMMENT ON COLUMN public.leads.fit_classification IS 'Auto or manual fit: hot, maybe, bad (rules-first; never auto-delete leads).';
COMMENT ON COLUMN public.leads.fit_reason IS 'Short explanation shown to the contractor.';
COMMENT ON COLUMN public.leads.fit_source IS 'rules | ai | hybrid | manual';

CREATE TABLE IF NOT EXISTS public.lead_automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action_type text NOT NULL,
  action_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS lead_automation_logs_lead_id_idx ON public.lead_automation_logs(lead_id);
CREATE INDEX IF NOT EXISTS lead_automation_logs_user_id_idx ON public.lead_automation_logs(user_id);

COMMENT ON TABLE public.lead_automation_logs IS 'Audit trail for lead automation (e.g. fit classification runs).';

ALTER TABLE public.lead_automation_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_automation_logs_select_own" ON public.lead_automation_logs;
CREATE POLICY "lead_automation_logs_select_own"
  ON public.lead_automation_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_automation_logs.lead_id AND l.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lead_automation_logs_insert_own" ON public.lead_automation_logs;
CREATE POLICY "lead_automation_logs_insert_own"
  ON public.lead_automation_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_automation_logs.lead_id AND l.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.lead_automation_logs TO authenticated;
