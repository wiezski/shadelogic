-- ============================================================
-- ZeroRemake Phase 9b — Payment Integrations
-- Stores dealer payment service connections and preferences.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- SECTION 1: Payment integrations table
-- ═══════════════════════════════════════════════════════════
-- Each row = one connected (or pending) payment service per company.
-- A company can have multiple services connected simultaneously.

CREATE TABLE IF NOT EXISTS payment_integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Which service
  provider        TEXT NOT NULL,  -- stripe | square | paypal | quickbooks | xero
  display_name    TEXT NOT NULL,  -- "Stripe", "Square", "PayPal & Venmo", etc.

  -- Connection status
  status          TEXT NOT NULL DEFAULT 'not_connected',  -- not_connected | pending | connected | error
  connected_at    TIMESTAMPTZ,

  -- Credentials / tokens (encrypted or references — never raw secrets)
  account_id      TEXT,           -- external account ID (e.g. Stripe acct_xxx, QB realm ID)
  access_token    TEXT,           -- OAuth access token (will be encrypted in production)
  refresh_token   TEXT,           -- OAuth refresh token
  token_expires_at TIMESTAMPTZ,

  -- Provider-specific settings
  config          JSONB DEFAULT '{}',  -- e.g. { "sandbox": true, "webhook_secret": "..." }

  -- What this integration does
  category        TEXT NOT NULL DEFAULT 'payments',  -- payments | accounting

  -- Whether this is the default for customer-facing invoices
  is_default      BOOLEAN DEFAULT false,

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- SECTION 2: Manual payment methods (dealer toggles)
-- ═══════════════════════════════════════════════════════════
-- Add columns to company_settings for which manual methods
-- the dealer accepts (shown on customer-facing invoices).

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS
  enabled_payment_methods TEXT[] DEFAULT ARRAY['cash','check','zelle','venmo'];

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS
  payment_instructions JSONB DEFAULT '{}';
  -- e.g. { "zelle": "Send to payments@acme.com", "check": "Make payable to Acme Blinds" }

-- ═══════════════════════════════════════════════════════════
-- SECTION 3: Enable RLS
-- ═══════════════════════════════════════════════════════════

ALTER TABLE payment_integrations ENABLE ROW LEVEL SECURITY;

-- Auto-set company_id trigger
DROP TRIGGER IF EXISTS payment_integrations_auto_set_company_id ON payment_integrations;
CREATE TRIGGER payment_integrations_auto_set_company_id
  BEFORE INSERT ON payment_integrations
  FOR EACH ROW EXECUTE FUNCTION auto_set_company_id();

-- RLS policies
DROP POLICY IF EXISTS "payment_integrations_select" ON payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_insert" ON payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_update" ON payment_integrations;
DROP POLICY IF EXISTS "payment_integrations_delete" ON payment_integrations;

CREATE POLICY "payment_integrations_select" ON payment_integrations
  FOR SELECT TO authenticated
  USING (company_id = get_my_company_id());

CREATE POLICY "payment_integrations_insert" ON payment_integrations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "payment_integrations_update" ON payment_integrations
  FOR UPDATE TO authenticated
  USING (company_id = get_my_company_id())
  WITH CHECK (company_id = get_my_company_id());

CREATE POLICY "payment_integrations_delete" ON payment_integrations
  FOR DELETE TO authenticated
  USING (company_id = get_my_company_id());

-- ═══════════════════════════════════════════════════════════
-- SECTION 4: Indexes
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS payment_integrations_company_idx ON payment_integrations(company_id);
CREATE INDEX IF NOT EXISTS payment_integrations_provider_idx ON payment_integrations(company_id, provider);
CREATE INDEX IF NOT EXISTS payment_integrations_status_idx ON payment_integrations(status);

-- ═══════════════════════════════════════════════════════════
-- SECTION 5: Updated_at trigger
-- ═══════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS payment_integrations_updated_at ON payment_integrations;
CREATE TRIGGER payment_integrations_updated_at
  BEFORE UPDATE ON payment_integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- SUMMARY
-- ═══════════════════════════════════════════════════════════
/*
NEW TABLES:
- payment_integrations: stores connected payment services per company
  - provider: stripe, square, paypal, quickbooks, xero
  - category: payments (accept money) or accounting (sync books)
  - status: not_connected, pending, connected, error
  - Supports OAuth tokens, account IDs, provider-specific config
  - is_default flag for customer-facing invoice payment button

ENHANCED TABLES:
- company_settings: +enabled_payment_methods (array of manual methods),
                    +payment_instructions (JSONB with per-method instructions)

NEXT STEPS:
1. Run this migration
2. Deploy updated code with integrations settings page
3. Later: implement actual OAuth flows for each provider
*/
