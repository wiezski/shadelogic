-- Phase 30 — Trial reminder tracking
--
-- Two new timestamptz columns on companies so the daily cron
-- (/api/cron/send-reminders) knows which trial-expiration reminder
-- emails it has already sent. Each reminder fires once per trial.
--
-- - trial_reminder_3d_sent_at: day-3 warning ("3 days left")
-- - trial_reminder_1d_sent_at: day-1 warning ("ends tomorrow")

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS trial_reminder_3d_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS trial_reminder_1d_sent_at timestamptz;
