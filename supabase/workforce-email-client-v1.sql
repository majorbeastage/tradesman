-- Workforce schedule, PTO engine, and email client metadata (v1 stored in profiles.metadata).
-- Keys: workforce_schedule_v1, pto_engine_v1, email_client_v1 (per-user on profiles).
-- Run in Supabase SQL Editor. Metadata remains the runtime source of truth; tables below
-- support reporting, sync jobs, and future migration off JSON blobs.

COMMENT ON COLUMN public.profiles.metadata IS
  'JSON preferences including om_calendar_policy, email_client_v1, workforce_schedule_v1, pto_engine_v1, organization_chart_v1';

-- Weekly work schedule per employee (mirrors workforce_schedule_v1.schedules[userId]).
CREATE TABLE IF NOT EXISTS public.user_work_schedules (
  account_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  days JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_user_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_work_schedules_user ON public.user_work_schedules (user_id);

-- Late-punch alert config per employee (mirrors workforce_schedule_v1.latePunchByUser[userId]).
CREATE TABLE IF NOT EXISTS public.user_late_punch_config (
  account_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  grace_minutes INT NOT NULL DEFAULT 5 CHECK (grace_minutes >= 0),
  notify_manager_user_ids UUID[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_user_id, user_id)
);

-- PTO accrual policy per employee (mirrors pto_engine_v1.policies[userId]).
CREATE TABLE IF NOT EXISTS public.user_pto_policies (
  account_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accrual_rate_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  accrual_period TEXT NOT NULL DEFAULT 'month' CHECK (accrual_period IN ('week', 'month', 'year')),
  adjustment_hours NUMERIC(8, 2) NOT NULL DEFAULT 0,
  max_balance_hours NUMERIC(8, 2),
  carryover_allowed BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_user_id, user_id)
);

-- PTO requests (mirrors pto_engine_v1.requests[]).
CREATE TABLE IF NOT EXISTS public.user_pto_requests (
  id TEXT PRIMARY KEY,
  account_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  hours_requested NUMERIC(8, 2) NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),
  approver_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  assigned_approver_user_ids UUID[] NOT NULL DEFAULT '{}',
  create_out_of_office_email BOOLEAN NOT NULL DEFAULT false,
  calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_pto_requests_account_status
  ON public.user_pto_requests (account_user_id, status);

CREATE INDEX IF NOT EXISTS idx_user_pto_requests_user
  ON public.user_pto_requests (user_id, status);

-- Email client OOO snapshot (optional sync from profiles.metadata.email_client_v1.outOfOffice).
CREATE TABLE IF NOT EXISTS public.email_client_out_of_office (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  message TEXT NOT NULL DEFAULT '',
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  share_with_org BOOLEAN NOT NULL DEFAULT false,
  sync_calendar BOOLEAN NOT NULL DEFAULT true,
  calendar_event_id UUID REFERENCES public.calendar_events(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_work_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_late_punch_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_pto_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_pto_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_client_out_of_office ENABLE ROW LEVEL SECURITY;

-- Account owner and linked team members may read/write org workforce rows.
DROP POLICY IF EXISTS "workforce schedules account access" ON public.user_work_schedules;
CREATE POLICY "workforce schedules account access"
  ON public.user_work_schedules FOR ALL TO authenticated
  USING (auth.uid() = account_user_id OR auth.uid() = user_id)
  WITH CHECK (auth.uid() = account_user_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "late punch config account access" ON public.user_late_punch_config;
CREATE POLICY "late punch config account access"
  ON public.user_late_punch_config FOR ALL TO authenticated
  USING (auth.uid() = account_user_id OR auth.uid() = user_id)
  WITH CHECK (auth.uid() = account_user_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "pto policies account access" ON public.user_pto_policies;
CREATE POLICY "pto policies account access"
  ON public.user_pto_policies FOR ALL TO authenticated
  USING (auth.uid() = account_user_id OR auth.uid() = user_id)
  WITH CHECK (auth.uid() = account_user_id OR auth.uid() = user_id);

DROP POLICY IF EXISTS "pto requests account access" ON public.user_pto_requests;
CREATE POLICY "pto requests account access"
  ON public.user_pto_requests FOR ALL TO authenticated
  USING (
    auth.uid() = account_user_id
    OR auth.uid() = user_id
    OR auth.uid() = ANY (assigned_approver_user_ids)
    OR auth.uid() = approver_user_id
  )
  WITH CHECK (auth.uid() = account_user_id OR auth.uid() = user_id OR auth.uid() = ANY (assigned_approver_user_ids));

DROP POLICY IF EXISTS "email ooo self access" ON public.email_client_out_of_office;
CREATE POLICY "email ooo self access"
  ON public.email_client_out_of_office FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
