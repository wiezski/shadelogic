-- ============================================================
-- ShadeLogic Phase 7 — Customer Tags + Quote Expiry
-- Run this in your Supabase SQL editor
-- ============================================================

-- ── Customer tags ─────────────────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags       TEXT[] DEFAULT '{}';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS lead_source TEXT;
-- 'referral' | 'website' | 'google' | 'facebook' | 'door_hanger' | 'repeat' | 'builder' | 'other'

-- ── Quote expiry ──────────────────────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at    DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_days    INTEGER DEFAULT 30;
