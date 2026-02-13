-- Create a second monitoring view that exposes extra explicit IDs + changed field list.
-- We keep the original v_agent_action_monitoring stable for backward compatibility.

CREATE OR REPLACE VIEW public.v_agent_action_monitoring_v2
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
  compte_epargne_id,
  compte_credit_id,
  transaction_epargne_id,
  transaction_credit_id,
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
  CASE
    WHEN action = 'UPDATE' THEN (
      SELECT COALESCE(jsonb_agg(k.key ORDER BY k.key), '[]'::jsonb)
      FROM jsonb_object_keys(public.jsonb_diff(before_data, after_data)) AS k(key)
    )
    ELSE NULL
  END AS changed_fields,
  before_data,
  after_data
FROM public.agent_action_audit;

