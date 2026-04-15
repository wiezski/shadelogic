-- ============================================================
-- ShadeLogic Phase 10 — Auth & Multi-Tenant Foundation
-- Run this in your Supabase SQL editor
-- ============================================================

-- ── Companies (one row per business) ─────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  plan       TEXT NOT NULL DEFAULT 'trial',
  -- 'trial' | 'basic' | 'pro'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── User profiles (one row per user, links to auth.users) ────
CREATE TABLE IF NOT EXISTS profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id),
  full_name  TEXT,
  role       TEXT NOT NULL DEFAULT 'owner',
  -- 'owner' | 'sales' | 'installer' | 'office'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow users to read their own profile
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- ── IMPORTANT ────────────────────────────────────────────────
-- After running this SQL:
-- 1. Go to Supabase Dashboard → Authentication → Settings
-- 2. Under Email, turn OFF "Confirm email" (for easier signup)
-- 3. Then sign up at /signup on your app
-- 4. Run the migration below to attach existing data to your new company
--
-- After you sign up, get your company_id from:
--   SELECT id FROM companies ORDER BY created_at DESC LIMIT 1;
-- Then run:
--   UPDATE customers       SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE measure_jobs    SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE quotes          SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE appointments    SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE tasks           SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE activity_log    SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE customer_phones SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE product_catalog SET company_id = 'YOUR_COMPANY_ID' WHERE company_id IS NULL;
--   UPDATE company_settings SET id = id WHERE TRUE; -- (already single-company)
