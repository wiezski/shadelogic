-- Phase 16: User Approval Flow for Over-Limit Signups
-- When a new user joins via invite and the company is at/over its plan user limit,
-- their profile is set to 'pending' status. The owner must approve or deny.

-- Add status column to profiles (active = normal, pending = awaiting approval)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Add index for querying pending members
CREATE INDEX IF NOT EXISTS idx_profiles_company_status ON profiles(company_id, status);

-- Create pending_approvals table for tracking approval requests
CREATE TABLE IF NOT EXISTS pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES profiles(id),
  resolution text, -- 'approved' or 'denied'
  UNIQUE(profile_id)
);

-- RLS for pending_approvals
ALTER TABLE pending_approvals ENABLE ROW LEVEL SECURITY;

-- Owners can see pending approvals for their company
CREATE POLICY "Company members can view pending approvals"
  ON pending_approvals FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Owners can update (approve/deny) pending approvals
CREATE POLICY "Owners can update pending approvals"
  ON pending_approvals FOR UPDATE
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'owner'));

-- Users can insert their own pending approval
CREATE POLICY "Users can insert own pending approval"
  ON pending_approvals FOR INSERT
  WITH CHECK (profile_id = auth.uid());

-- Set all existing profiles to 'active'
UPDATE profiles SET status = 'active' WHERE status IS NULL OR status = '';
