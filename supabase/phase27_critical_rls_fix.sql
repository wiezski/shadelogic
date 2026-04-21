-- Phase 27 — EMERGENCY: drop permissive "allow all" policies (tenant-isolation breach)
--
-- Context (2026-04-21, right after launch): running a live signup test surfaced
-- that a brand-new user in a brand-new company could read customers, measure
-- jobs, rooms, windows, and window_photos belonging to *other* tenants.
--
-- Root cause: these 5 tables each had a permissive RLS policy of the form
--   CREATE POLICY "allow all <table>" ON <table> FOR ALL TO public
--     USING (true) WITH CHECK (true);
-- that coexisted with the proper tenant-scoped policy named "co". Postgres
-- RLS ORs permissive policies together, so the "allow all" one silently
-- negated the isolation check. Confirmed by a direct PostgREST query from the
-- new user's JWT returning ShadeLogic customer rows.
--
-- Fix: drop the 5 "allow all" policies. The existing "co" policies on each
-- table already enforce `company_id = get_company_id()` for authenticated
-- users, and the dedicated anon policies (e.g. customers.anon_lead for lead
-- capture, quotes.anon_read/anon_sign for public quote view) stay intact.

DROP POLICY IF EXISTS "allow all customers"      ON customers;
DROP POLICY IF EXISTS "allow all measure_jobs"   ON measure_jobs;
DROP POLICY IF EXISTS "allow all rooms"          ON rooms;
DROP POLICY IF EXISTS "allow all windows"        ON windows;
DROP POLICY IF EXISTS "allow all window_photos"  ON window_photos;
