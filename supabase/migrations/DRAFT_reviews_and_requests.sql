-- DRAFT — REVIEW BEFORE APPLYING
-- ─────────────────────────────────────────────────────────────────────
-- Google Reviews + review requests.
--
-- Currently the /reviews page stores the Place ID in localStorage and
-- logs sent requests to localStorage + `activity_log`. When you're
-- ready to productionize, apply this migration to move both to the
-- database.
--
-- Adds:
--   company_settings.google_place_id — the company's Google Place ID
--   review_requests                 — per-customer request history
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- ── google_place_id on company_settings ─────────────────────────
-- Assumes `company_settings` exists with a `company_id` column.
ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS google_place_id text;

-- ── review_requests ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS review_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id   uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel       text NOT NULL CHECK (channel IN ('text', 'email', 'link_copy')),
  sent_by       uuid REFERENCES auth.users(id),
  sent_at       timestamptz NOT NULL DEFAULT now(),
  responded_at  timestamptz,
  -- Optional: if you later store the response status from Google
  review_rating integer CHECK (review_rating BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_review_requests_company_sent
  ON review_requests (company_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_requests_customer
  ON review_requests (customer_id, sent_at DESC);

ALTER TABLE review_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read review requests"
  ON review_requests FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "company members create review requests"
  ON review_requests FOR INSERT TO authenticated
  WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "company members update review requests"
  ON review_requests FOR UPDATE TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- ── google_reviews (cached) ─────────────────────────────────────
-- Future: once OAuth to Google Business Profile is wired up, cache
-- the actual reviews here so the Reviews page stays fast and works
-- offline.
CREATE TABLE IF NOT EXISTS google_reviews (
  id              text PRIMARY KEY,  -- Google's review ID
  company_id      uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  author_name     text,
  author_photo_url text,
  rating          integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment         text,
  created_time    timestamptz NOT NULL,
  reply_comment   text,
  reply_time      timestamptz,
  last_synced_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_reviews_company_created
  ON google_reviews (company_id, created_time DESC);

ALTER TABLE google_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "company members read google reviews"
  ON google_reviews FOR SELECT TO authenticated
  USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Only owners/admins can write review replies (via server)
CREATE POLICY "owners + admins update google reviews"
  ON google_reviews FOR UPDATE TO authenticated
  USING (
    company_id IN (
      SELECT company_id FROM profiles
      WHERE id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

COMMIT;
