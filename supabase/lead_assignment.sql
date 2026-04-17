-- Lead Assignment Migration
-- Adds assigned_to column to customers for lead assignment
-- Run via Supabase MCP: apply_migration (already applied)

ALTER TABLE customers ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_assigned_to ON customers(assigned_to);
