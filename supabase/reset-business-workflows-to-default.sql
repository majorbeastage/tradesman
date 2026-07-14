-- ============================================================
-- Reset ALL accounts' Business Workflow charts to the default
-- 7-step customer job lifecycle (same as signup seed).
--
-- Does NOT change Organization Chart (organization_chart_v1).
-- Run in Supabase SQL Editor.
-- ============================================================

DO $$
DECLARE
  now_iso text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  default_workflow jsonb;
BEGIN
  default_workflow := jsonb_build_object(
    'v', 1,
    'title', 'Customer job lifecycle',
    'updated_at', now_iso,
    'nodes', jsonb_build_array(
      jsonb_build_object('id', 'default-step-1', 'label', 'Customer Intake', 'x', 40, 'y', 24, 'order', 0, 'boxColor', 'blue'),
      jsonb_build_object('id', 'default-step-2', 'label', 'Build Estimate', 'x', 230, 'y', 96, 'order', 1, 'boxColor', 'default'),
      jsonb_build_object('id', 'default-step-3', 'label', 'Customer Approves', 'x', 40, 'y', 168, 'order', 2, 'boxColor', 'teal'),
      jsonb_build_object('id', 'default-step-4', 'label', 'Schedule Job', 'x', 230, 'y', 240, 'order', 3, 'boxColor', 'purple'),
      jsonb_build_object('id', 'default-step-5', 'label', 'Complete Calendar Event', 'x', 40, 'y', 312, 'order', 4, 'boxColor', 'purple'),
      jsonb_build_object('id', 'default-step-6', 'label', 'Customer Payment Received', 'x', 230, 'y', 384, 'order', 5, 'boxColor', 'teal'),
      jsonb_build_object('id', 'default-step-7', 'label', 'Send Receipt', 'x', 40, 'y', 456, 'order', 6, 'boxColor', 'green')
    ),
    'edges', jsonb_build_array(
      jsonb_build_object('id', 'edge-default-step-1-default-step-2', 'fromId', 'default-step-1', 'toId', 'default-step-2', 'approval', 'approved'),
      jsonb_build_object('id', 'edge-default-step-2-default-step-3', 'fromId', 'default-step-2', 'toId', 'default-step-3', 'approval', 'approved'),
      jsonb_build_object('id', 'edge-default-step-3-default-step-4', 'fromId', 'default-step-3', 'toId', 'default-step-4', 'approval', 'approved'),
      jsonb_build_object('id', 'edge-default-step-4-default-step-5', 'fromId', 'default-step-4', 'toId', 'default-step-5', 'approval', 'approved'),
      jsonb_build_object('id', 'edge-default-step-5-default-step-6', 'fromId', 'default-step-5', 'toId', 'default-step-6', 'approval', 'approved'),
      jsonb_build_object('id', 'edge-default-step-6-default-step-7', 'fromId', 'default-step-6', 'toId', 'default-step-7', 'approval', 'approved')
    )
  );

  UPDATE public.profiles
  SET
    metadata = jsonb_set(
      COALESCE(metadata, '{}'::jsonb),
      '{business_workflow_v1}',
      default_workflow,
      true
    ),
    updated_at = now()
  WHERE id IS NOT NULL;

  RAISE NOTICE 'Reset business_workflow_v1 to default 7-step lifecycle on all profiles.';
END $$;
