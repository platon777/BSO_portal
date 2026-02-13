-- Helper + view for business monitoring of agent UPDATE/DELETE actions.
-- Produces a compact "changes" jsonb for UPDATE rows.

CREATE OR REPLACE FUNCTION public.jsonb_diff(old_row jsonb, new_row jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  WITH keys AS (
    SELECT key FROM jsonb_object_keys(COALESCE(old_row, '{}'::jsonb)) AS key
    UNION
    SELECT key FROM jsonb_object_keys(COALESCE(new_row, '{}'::jsonb)) AS key
  ),
  changed AS (
    SELECT
      k.key,
      old_row -> k.key AS from_value,
      new_row -> k.key AS to_value
    FROM keys k
    WHERE (old_row -> k.key) IS DISTINCT FROM (new_row -> k.key)
  )
  SELECT COALESCE(
    jsonb_object_agg(
      key,
      jsonb_build_object('from', from_value, 'to', to_value)
    ),
    '{}'::jsonb
  )
  FROM changed;
$$;

CREATE OR REPLACE VIEW public.v_agent_action_monitoring
WITH (security_invoker = true)
AS
SELECT
  id,
  occurred_at,
  actor_id,
  actor_full_name,
  action,
  target_table,
  target_id,
  scope_type,
  client_id,
  client_full_name,
  client_code,
  no_compte,
  transaction_type,
  grant_id,
  grant_scope_type,
  grant_duration_minutes,
  grant_expires_at,
  admin_id,
  admin_full_name,
  CASE
    WHEN action = 'UPDATE' THEN public.jsonb_diff(before_data, after_data)
    ELSE NULL
  END AS changes,
  before_data,
  after_data
FROM public.agent_action_audit;

