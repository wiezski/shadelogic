-- Phase 24: Business type presets
-- Adds business_type and hidden_nav columns to companies table

ALTER TABLE companies
ADD COLUMN IF NOT EXISTS business_type TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS hidden_nav JSONB DEFAULT '[]'::jsonb;
