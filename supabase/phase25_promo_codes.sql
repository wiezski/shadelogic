-- ============================================================
-- Phase 25 — Promo Code System
-- Allows owner to create unique codes for select dealers
-- Bypasses Stripe, grants configurable plan + duration
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_codes (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  code            TEXT        NOT NULL UNIQUE,
  label           TEXT,                          -- friendly name, e.g. "Utah Blinds VIP"
  plan            TEXT        NOT NULL DEFAULT 'professional',
  -- which plan to grant: 'starter' | 'professional' | 'business'
  duration        TEXT        NOT NULL DEFAULT 'lifetime',
  -- 'lifetime' | '3mo' | '6mo' | '12mo'
  max_users       INTEGER     NOT NULL DEFAULT 3,
  used_by_company UUID        REFERENCES companies(id),
  used_at         TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,  -- calculated from duration when redeemed
  created_by      TEXT,         -- who created it (e.g. 'admin')
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS promo_codes_code_idx ON promo_codes (code);

-- RLS: only service role should read/write promo codes directly
-- But we need the signup flow to validate codes, so allow select for authenticated + anon
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

-- Anyone can check if a code exists (for validation at signup)
CREATE POLICY promo_codes_select ON promo_codes
  FOR SELECT TO anon, authenticated
  USING (true);

-- Only service role can insert/update/delete (handled via API routes)
