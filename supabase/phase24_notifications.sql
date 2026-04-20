-- Create notifications table for in-app notification system
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  icon TEXT,
  link TEXT,
  read BOOLEAN DEFAULT false,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  quote_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_notifications_company_read_created
  ON notifications(company_id, read, created_at DESC);

CREATE INDEX idx_notifications_company_user
  ON notifications(company_id, user_id);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Create RLS policy
CREATE POLICY notifications_select
  ON notifications
  FOR SELECT
  USING (company_id = get_company_id());

CREATE POLICY notifications_insert
  ON notifications
  FOR INSERT
  WITH CHECK (company_id = get_company_id());

CREATE POLICY notifications_update
  ON notifications
  FOR UPDATE
  USING (company_id = get_company_id())
  WITH CHECK (company_id = get_company_id());

CREATE POLICY notifications_delete
  ON notifications
  FOR DELETE
  USING (company_id = get_company_id());
