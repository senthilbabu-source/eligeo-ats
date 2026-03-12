-- Migration 024: Atomic stage reorder RPC
-- Replaces the sequential per-stage UPDATE loop in reorderStages() SA (P1-4).
-- Single UPDATE with CASE WHEN ensures all-or-nothing ordering.

CREATE OR REPLACE FUNCTION reorder_pipeline_stages(
  p_pipeline_template_id UUID,
  p_organization_id UUID,
  p_stage_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE pipeline_stages
  SET stage_order = idx.new_order
  FROM (
    SELECT unnest(p_stage_ids) AS stage_id,
           generate_series(0, array_length(p_stage_ids, 1) - 1) AS new_order
  ) AS idx
  WHERE pipeline_stages.id = idx.stage_id
    AND pipeline_stages.pipeline_template_id = p_pipeline_template_id
    AND pipeline_stages.organization_id = p_organization_id
    AND pipeline_stages.deleted_at IS NULL;
END;
$$;
