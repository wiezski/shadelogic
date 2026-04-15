-- ============================================================
-- ShadeLogic Phase 8 — Digital Signature
-- Run this in your Supabase SQL editor
-- ============================================================

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signature_data TEXT;        -- base64 PNG of signature
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_at      TIMESTAMPTZ; -- when they signed
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_name    TEXT;         -- typed name confirmation
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_ip      TEXT;         -- IP address for record
