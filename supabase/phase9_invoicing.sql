-- ============================================================
-- ZeroRemake Phase 9 — Invoicing & Payments
-- Proper invoice generation, payment logging, balance tracking.
-- Run this in Supabase SQL Editor.
-- ============================================================

-- ═══════════════════════════════════════════════════════════
-- SECTION 1: Invoices table
-- ═══════════════════════════════════════════════════════════
-- Invoices are generated from approved quotes.
-- A quote can have multiple invoices (deposit + balance).

CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quote_id        UUID REFERENCES quotes(id) ON DELETE SET NULL,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  -- Invoice identity
  invoice_number  TEXT NOT NULL,           -- e.g. "INV-0001", auto-generated per company
  type            TEXT NOT NULL DEFAULT 'full',  -- deposit | balance | full | custom

  -- Amounts
  subtotal        NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_pct         NUMERIC(5,2) DEFAULT 0,
  tax_amount      NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  amount_paid     NUMERIC(10,2) DEFAULT 0,
  amount_due      NUMERIC(10,2) GENERATED ALWAYS AS (total - amount_paid) STORED,

  -- Status + dates
  status          TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | partial | paid | overdue | void
  due_date        DATE,
  sent_at         TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  voided_at       TIMESTAMPTZ,

  -- Notes + memo
  notes           TEXT,                    -- internal notes
  memo            TEXT,                    -- customer-facing memo on invoice

  -- Public access token for customer-facing view
  public_token    TEXT UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),

  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- SECTION 2: Invoice line items
-- ═══════════════════════════════════════════════════════════
-- Copied from quote line items at invoice creation time.
-- This is a snapshot — editing the quote won't change the invoice.

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  description     TEXT NOT NULL,
  quantity        INT DEFAULT 1,
  unit_price      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total           NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order      INT DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- SECTION 3: Payments table
-- ═══════════════════════════════════════════════════════════
-- Individual payment records against invoices.
-- Supports partial payments, multiple methods.

CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,

  amount          NUMERIC(10,2) NOT NULL,
  method          TEXT NOT NULL DEFAULT 'other',  -- cash | check | zelle | venmo | credit_card | debit_card | ach | wire | other
  reference       TEXT,                           -- check #, transaction ID, confirmation #, etc.

  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes           TEXT,
  logged_by       TEXT,                           -- who recorded this payment

  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════
-- SECTION 4: Company invoice settings
-- ═══════════════════════════════════════════════════════════
-- Add invoice-related settings to company_settings

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'INV';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS next_invoice_number INT DEFAULT 1;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS default_payment_terms_days INT DEFAULT 30;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_footer TEXT;  -- e.g. "Thank you for your business!"
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS accepted_payment_methods TEXT[];  -- array of methods the company accepts

-- ═══════════════════════════════════════════════════════════
-- SECTION 5: Enable RLS
-- ═══════════════════════════════════════════════════════════

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Auto-set company_id triggers
DO $$ DECLARE tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY[
    'invoices',
    'invoice_line_items',
    'payments'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %s_auto_set_company_id ON %I', tbl, tbl);
    EXECUTE format('CREATE TRIGGER %s_auto_set_company_id BEFORE INSERT ON %I
      FOR EACH ROW EXECUTE FUNCTION auto_set_company_id()', tbl, tbl);
  END LOOP;
END $$;

-- RLS policies
DO $$ DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'invoices',
    'invoice_line_items',
    'payments'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', t, t);

    EXECUTE format('CREATE POLICY "%s_select" ON %I FOR SELECT TO authenticated
      USING (company_id = get_my_company_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_insert" ON %I FOR INSERT TO authenticated
      WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "%s_update" ON %I FOR UPDATE TO authenticated
      USING (company_id = get_my_company_id())
      WITH CHECK (company_id = get_my_company_id())', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE TO authenticated
      USING (company_id = get_my_company_id())', t, t);
  END LOOP;
END $$;

-- Anonymous access for customer-facing invoice view (like quote approval)
CREATE POLICY "invoices_anon_select" ON invoices
  FOR SELECT TO anon
  USING (public_token IS NOT NULL);

CREATE POLICY "invoice_line_items_anon_select" ON invoice_line_items
  FOR SELECT TO anon
  USING (invoice_id IN (SELECT id FROM invoices WHERE public_token IS NOT NULL));

-- ═══════════════════════════════════════════════════════════
-- SECTION 6: Indexes
-- ═══════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS invoices_company_idx ON invoices(company_id);
CREATE INDEX IF NOT EXISTS invoices_customer_idx ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS invoices_quote_idx ON invoices(quote_id);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
CREATE INDEX IF NOT EXISTS invoices_due_date_idx ON invoices(due_date);
CREATE INDEX IF NOT EXISTS invoices_public_token_idx ON invoices(public_token);
CREATE INDEX IF NOT EXISTS invoices_number_idx ON invoices(company_id, invoice_number);

CREATE INDEX IF NOT EXISTS invoice_line_items_invoice_idx ON invoice_line_items(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_line_items_company_idx ON invoice_line_items(company_id);

CREATE INDEX IF NOT EXISTS payments_company_idx ON payments(company_id);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS payments_customer_idx ON payments(customer_id);
CREATE INDEX IF NOT EXISTS payments_received_idx ON payments(received_at DESC);

-- ═══════════════════════════════════════════════════════════
-- SECTION 7: Updated_at trigger for invoices
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS invoices_updated_at ON invoices;
CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- SUMMARY
-- ═══════════════════════════════════════════════════════════
/*
NEW TABLES:
- invoices: invoice records with amounts, status, due dates, public token
- invoice_line_items: snapshot of line items from quote
- payments: individual payment records with method, reference, amount

ENHANCED TABLES:
- company_settings: +invoice_prefix, +next_invoice_number, +default_payment_terms_days,
                    +invoice_footer, +accepted_payment_methods

FEATURES:
- Auto company_id via trigger on all 3 tables
- RLS on all 3 tables (authenticated users see own company only)
- Anonymous access for customer-facing invoice view via public_token
- Generated column: amount_due = total - amount_paid (always accurate)
- Auto-updated updated_at timestamp on invoices

NEXT STEPS:
1. Run this migration
2. Deploy updated code
3. Generate first invoice from an approved quote
*/
