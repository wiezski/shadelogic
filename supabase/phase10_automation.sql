-- ============================================================
-- ZeroRemake Phase 10 — Automation Engine
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ── automation_rules ────────────────────────────────────────
-- Defines automation rules with triggers and actions
CREATE TABLE IF NOT EXISTS automation_rules (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  description     TEXT,
  enabled         BOOLEAN     NOT NULL DEFAULT TRUE,

  -- Trigger configuration
  trigger_type    TEXT        NOT NULL, -- 'time_elapsed' | 'status_change'
  trigger_conditions JSONB    NOT NULL DEFAULT '{}'::jsonb,

  -- Action configuration
  action_type     TEXT        NOT NULL, -- 'send_email' | 'create_task' | 'update_field' | 'create_activity' | 'send_notification'
  action_config   JSONB       NOT NULL DEFAULT '{}'::jsonb,

  -- Tracking
  last_run_at     TIMESTAMPTZ,
  run_count       INT         NOT NULL DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_rules_company_idx ON automation_rules (company_id, enabled);
CREATE INDEX IF NOT EXISTS automation_rules_trigger_idx ON automation_rules (trigger_type);

-- ── automation_log ────────────────────────────────────────
-- Logs every automation action execution
CREATE TABLE IF NOT EXISTS automation_log (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rule_id         TEXT        NOT NULL,
  rule_name       TEXT        NOT NULL,
  customer_id     UUID        REFERENCES customers(id) ON DELETE CASCADE,
  action_type     TEXT        NOT NULL,
  status          TEXT        NOT NULL, -- 'success' | 'failed' | 'skipped'
  details         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_log_company_idx ON automation_log (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_log_rule_idx ON automation_log (rule_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS automation_log_customer_idx ON automation_log (customer_id, created_at DESC);

-- ── automation_queue ────────────────────────────────────────
-- Optional: queued automations scheduled to fire in the future
CREATE TABLE IF NOT EXISTS automation_queue (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id     UUID        REFERENCES customers(id) ON DELETE CASCADE,
  action_type     TEXT        NOT NULL,
  action_config   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  fire_at         TIMESTAMPTZ NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending', -- 'pending' | 'fired' | 'failed' | 'cancelled'
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS automation_queue_company_idx ON automation_queue (company_id, status, fire_at);
CREATE INDEX IF NOT EXISTS automation_queue_fire_idx ON automation_queue (fire_at) WHERE status = 'pending';

-- ── RLS Policies for automation_rules ────────────────────
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY automation_rules_select ON automation_rules
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY automation_rules_insert ON automation_rules
  FOR INSERT WITH CHECK (company_id = get_my_company_id());

CREATE POLICY automation_rules_update ON automation_rules
  FOR UPDATE USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY automation_rules_delete ON automation_rules
  FOR DELETE USING (company_id = get_my_company_id());

-- ── RLS Policies for automation_log ────────────────────
ALTER TABLE automation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY automation_log_select ON automation_log
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY automation_log_insert ON automation_log
  FOR INSERT WITH CHECK (company_id = get_my_company_id());

-- ── RLS Policies for automation_queue ────────────────────
ALTER TABLE automation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY automation_queue_select ON automation_queue
  FOR SELECT USING (company_id = get_my_company_id());

CREATE POLICY automation_queue_insert ON automation_queue
  FOR INSERT WITH CHECK (company_id = get_my_company_id());

CREATE POLICY automation_queue_update ON automation_queue
  FOR UPDATE USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

-- ── Trigger to set company_id on automation tables ────────
CREATE OR REPLACE FUNCTION auto_set_company_id_automation()
RETURNS TRIGGER AS $$
BEGIN
  NEW.company_id := get_my_company_id();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER automation_rules_set_company BEFORE INSERT ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id_automation();

CREATE TRIGGER automation_log_set_company BEFORE INSERT ON automation_log
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id_automation();

CREATE TRIGGER automation_queue_set_company BEFORE INSERT ON automation_queue
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id_automation();

-- ── Updated_at trigger for automation_rules ────────────────
DROP TRIGGER IF EXISTS automation_rules_updated_at ON automation_rules;
CREATE TRIGGER automation_rules_updated_at
  BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Company settings for automation ────────────────────────
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN DEFAULT true;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS stuck_lead_alerts BOOLEAN DEFAULT true;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS stuck_lead_threshold_hot INT DEFAULT 5;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS stuck_lead_threshold_warm INT DEFAULT 14;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS stuck_lead_threshold_cold INT DEFAULT 30;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_followup_quotes BOOLEAN DEFAULT true;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS auto_followup_quotes_days INT DEFAULT 3;

-- ── Example automation rules (for reference) ────────────────

-- Example 1: Send email to Hot leads inactive 5+ days
-- INSERT INTO automation_rules (company_id, name, trigger_type, trigger_conditions, action_type, action_config, enabled)
-- SELECT
--   id,
--   'Follow up with Hot leads (5+ days)',
--   'time_elapsed',
--   jsonb_build_object(
--     'days_elapsed', 5,
--     'heat_score_filter', jsonb_build_array('Hot'),
--     'exclude_opted_out', true
--   ),
--   'send_email',
--   jsonb_build_object(
--     'template', 'quote_followup',
--     'quoteId', '{{quote_id}}'
--   ),
--   true
-- FROM companies LIMIT 1;

-- Example 2: Create task for any lead stuck in same status 3+ days
-- INSERT INTO automation_rules (company_id, name, trigger_type, trigger_conditions, action_type, action_config, enabled)
-- SELECT
--   id,
--   'Create follow-up task for stuck leads',
--   'status_change',
--   jsonb_build_object(
--     'target_status', 'Quoted',
--     'after_days', 3
--   ),
--   'create_task',
--   jsonb_build_object(
--     'title', 'Follow up: {{customer_name}} stuck {{daysSinceStatusChange}} days in {{leadStatus}}',
--     'due_days', 0
--   ),
--   true
-- FROM companies LIMIT 1;
