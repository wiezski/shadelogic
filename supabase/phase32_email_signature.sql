-- Phase 32 — Per-company email signature.
-- Owners can set a signature block that gets appended to customer-facing
-- emails (quote delivery, appointment reminders, install follow-ups, etc.).
-- Kept as plain text with basic line breaks — converted to HTML when
-- injecting into emails via sendEmail(). Capped at 2000 chars in the UI.

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS email_signature text;
