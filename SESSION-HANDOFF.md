# ZeroRemake — Session Handoff

## How to Resume
Start new session with: "continuing ZeroRemake — read SESSION-HANDOFF.md, MASTER-SPEC.md, and MVP-BUILD-PLAN.md before doing anything."
Read this file + MASTER-SPEC.md + MVP-BUILD-PLAN.md before touching any code.

---

## Current Build Status

### Phase 1 — Complete ✓
Measure & Install workflow fully built and deployed.

### Phase 2 (CRM Section 1) — Complete ✓
Full CRM foundation built. See details below.

### Phase 3 — Scheduling — Complete ✓
Full calendar (day/week/month), 7 appointment types, forced outcomes, customer comms (confirmation/reminder/on-my-way via SMS), Google Maps directions.

### Phase 4 — Quoting — Complete ✓
Quote builder, pricing engine, templates, e-signature, PDF print, customer approval link, payments/deposits.

### Phase 14 — Product Catalog + Order/Package Tracking — Complete ✓
Enhanced product catalog with manufacturer fields, CSV import, order PDF upload, package-level tracking. See details below.

### Phase 15 — Permission Guards + Client Setup Guide — Complete ✓
Page-level permission enforcement on all protected routes. Client-facing getting-started guide with step-by-step instructions.

### Phase 5 — Multi-User Auth + Multi-Tenancy + Feature Flags — Complete ✓
Full auth system with Supabase Auth, RLS on all 19 tables, auto-set company_id triggers, subscription plans (trial/basic/pro/enterprise), feature flags with per-company overrides, FeatureGate component. See details below.

### Phase 6 — Full Install Management — Complete ✓
Quote→Install conversion, installer checklist system, materials packing list, customer sign-off with signature, enhanced completion flow. SQL migration run ✓.

### Phase 7 — Rebrand to ZeroRemake + White-Label — Complete ✓
Full rebrand from ShadeLogic to ZeroRemake. Light mode with orange primary (#e63000), Figtree font, SVG logo component. White-label infrastructure: per-tenant branding via CSS custom properties, runtime injection from companies table, Settings UI for brand customization. SQL migration run ✓.

### Phase 7.5 — Light Mode Fix — Complete ✓
**Root cause found and fixed**: Turbopack cached old dark-theme CSS chunks that overrode light values. Also, Vercel's GitHub webhook was disconnected (not auto-deploying). Fix involved:
- `globals.css`: Changed `:root` to `html:root` (higher CSS specificity beats cached `:root`)
- Added `color-scheme: light` to CSS and `<html>` element
- Added `!important` safety net block at bottom of globals.css for all light color values
- Fixed `[data-tenant]` fallback for `--zr-dark` from `#1a1a1a` to `#f8f9fa`
- Added `rm -rf .next/cache` to build script to prevent stale CSS
- Deployed via `npx vercel --prod` CLI (GitHub webhook was broken)
- Changed cron schedule from every-4-hours to daily (Hobby plan limit)
- Vercel CLI linked to project (`.vercel` directory created on user's machine)

### Phase 8 — Automated Email Outreach with Resend — Complete ✓
Transactional email system using Resend (free tier: 100/day). SQL migration run ✓.

### Phase 9 — Enhanced Payments/Invoicing System — Complete ✓
Professional invoicing system built on top of approved quotes. See details below.

### Phase 9b — Payment Integrations & Customer Invoice View — Complete ✓
Payment connections settings page and public customer-facing invoice page. See details below.

### Phase 10 — Automation Engine — Complete ✓
Full if/then automation system with daily cron processing. See details below.

### Phase 11 — Advanced Analytics — Complete ✓
Enhanced analytics page with Revenue Forecast, Close Rate by Lead Source, Installer Performance, Measurement Accuracy.

### Phase 12 — Manufacturer Library + Enhanced Imports — Complete ✓
PDF parsing, manufacturer library, product change detection. See details below.

### CRM Enhancements — Complete ✓
- **Lead Assignment**: `assigned_to` column on customers, team member dropdown on customer detail, "Mine/All" filter on dashboard work queue, assignee badges
- **Smart Follow-Ups**: `saveLeadStatus()` auto-sets next_action based on stage, logs stage transitions as activity, quick-action buttons (Schedule Consult, Schedule Measure, Create Quote, Mark as Sold, Schedule Install, Mark Complete)

### Phase 8b — Builder Portal — Complete ✓
- **Database**: builder_contacts, builder_projects, builder_project_quotes, builder_messages tables (phase8_builder_portal.sql)
- **Internal page** (`/builders`): two-panel layout with builder list + detail/projects, add builder form, copyable portal link, project management
- **Public portal** (`/b/[token]`): no-auth access via portal_token, company branding header, project list, linked quotes, message thread
- **Nav bar**: Builders link gated by `features.builder_portal && permissions.view_customers`
- **Auth**: `/b/` added to PUBLIC_ROUTES

### Phase 9c — Payroll & Commissions — Complete ✓
- **Database**: pay_rates, pay_entries, payroll_runs, app_feedback tables (phase9_payroll.sql)
  - pay_rates: profile_id, pay_type, rate, commission_pct, active
  - pay_entries: profile_id, entry_type (hours/job/commission/bonus/deduction), hours, hourly_rate, job_rate, per_window_rate, sale_amount, commission_pct, amount, description, work_date, status (pending/approved/paid)
  - payroll_runs: period_start, period_end, status (draft/finalized/paid), total_amount, finalized_at, paid_at
- **Payroll page** (`/payroll`): three tabs — Pay Entries, Pay Rates, Payroll Runs
  - Pay Entries: table with date, person, type, details, amount, status; approve/mark-paid buttons; per-person summary cards; filter by team member and date range (7d/30d/90d/all)
  - Pay Rates: per-person rate cards showing type + rate + commission %; form to set new rates (deactivates old)
  - Payroll Runs: create periods, finalize, mark paid
  - Add Entry modal: auto-calculates amount from configured rate (hours × hourly_rate, sale × commission_pct)
- **Nav bar**: Payroll link gated by `permissions.view_financials`
- **Feedback widget**: floating chat bubble on every page, star rating (1-5), category selector (bug/feature/improvement/praise/other), message textarea, saves to app_feedback table with page_url

### Test Data Seeded
- **3 dummy team members** (with auth.users + profiles):
  - Mike Torres (installer) — hourly $28/hr, 3 pay entries ($602 total)
  - Jessica Nguyen (sales) — commission only 12%, 3 commission entries ($1,098 total)
  - Carlos Rivera (lead_sales) — hybrid salary $3,500 + 8% commission, 3 entries ($4,236 total)
- **1 dummy builder**: Apex Custom Homes (Danny Kowalski), 2 projects
  - Portal link: `/b/bbbbbbbb-0001-4000-8000-000000000001`
- Test user passwords: `TestPass123!` (mike.test@example.com, jessica.test@example.com, carlos.test@example.com)

### Next Up
- **User needs to `git push`** — 4 commits ahead of origin (builder portal, payroll, schema fix)
- Blind cost calculator feature
- Rearrangeable homepage with role-based defaults
- Stripe SaaS billing for plan subscriptions (per-user pricing)
- SMS cost strategy (built-in vs. add-on)
- Still pending: `npm install pdf-parse`, create `order-documents` storage bucket in Supabase
- Still pending: Set up Postmark inbound email for order tracking
- Future: Wire up actual Stripe Connect / PayPal / QuickBooks OAuth flows for live payments

---

## What's Built

### Dashboard (`/`)
- 5 stat cards (Measures to Schedule, Measures Done, Installs to Schedule, Installs Scheduled, Open Issues) — each clickable, opens filtered job list with overdue/idle flags
- **Work Queue** — auto-prioritized list of customers needing action:
  - Priority 1 "Now": overdue tasks, Hot leads stuck 5+ days
  - Priority 2 "Today": new leads never contacted, quoted leads 3+ days no follow-up
  - Priority 3 "Soon": warm/cold leads past stuck threshold (14/30 days)
  - Each item shows reason, heat badge, stage badge, next action if set
  - **Mine/All toggle** — filters work queue by assigned_to
- **Tasks Due** widget — overdue + due-today tasks across all customers
- Customers tab — list with heat score + lead status badges, add customer form, assignee badges

### Customer Detail (`/customers/[id]`)
- **Next Action Required** — amber card at top, shows in work queue
- **Lead pipeline** — 10 stages: New → Contacted → Scheduled → Measured → Quoted → Sold → Installed → Lost → On Hold → Waiting. One-tap changes, color coded
- **Smart follow-ups** — stage changes auto-set next_action, log activity, quick-action buttons
- **Assigned To** dropdown — assign team member, shows in work queue
- **Heat score** — Hot / Warm / Cold toggle
- **Stuck lead warning** — appears in header when no activity past threshold (5/14/30 days by heat score)
- **Speed-to-lead timer** — shows how quickly first contact happened
- **Multi-phone system** — unlimited phones per customer via `customer_phones` table
- **Outreach composers** (SMS + Email) — stage-aware presets
- **Activity log** — Call, Text, Email, Note, Visit. Voice-to-text mic button
- **Tasks** — add with due date, check off, delete
- **Measure Jobs** — list with mode badge, create new job button
- All fields inline-editable, auto-save on blur

### Payroll & Commissions (`/payroll`)
- **Pay Entries tab**: table of all entries with approve/mark-paid workflow, per-person summaries, date range + person filters
- **Pay Rates tab**: per-person rate cards, set new rates (deactivates old)
- **Payroll Runs tab**: create pay periods, finalize → mark paid
- **Add Entry modal**: auto-calculates from configured rate
- Supports: hourly, per-job, per-window, salary, commission-only, and hybrid pay

### Builder Portal
- **Internal** (`/builders`): manage builder contacts, projects, portal links
- **Public** (`/b/[token]`): builder views projects, quotes, sends messages — no login needed

### Feedback Widget
- Floating chat bubble (bottom-right), star rating, category, message
- Saves to `app_feedback` table with page_url and user_agent

### Measure Job (`/measure-jobs/[id]`)
- Measure mode: rooms, windows, all measurement fields, photo upload, fraction validation (1/16"), CSV export, print/copy summary
- Install mode: per-window status (Pending/Done/Issue), issue presets, photo per issue, progress bar

### Product Catalog (`/products`) — ENHANCED
- Full CRUD, CSV import, search/filter, manufacturer library (`/products/library`)

### Quote Detail (`/quotes/[id]`) — ENHANCED
- Materials & Orders section with package-level tracking, order PDF upload

### Permission Guards
- `PermissionGate` + `FeatureGate` double layer on all protected pages

### Setup Guide (`/setup-guide`)
- 8-step getting-started guide with progress tracking

### Auth + Multi-Tenancy
- Supabase Auth, RLS on all tables, auto-set company_id triggers, subscription plans, feature flags

### Full Install Management
- Quote→Install conversion, installer checklist, materials packing list, customer sign-off

### ZeroRemake Rebrand + White-Label
- Light mode, orange primary, Figtree font, per-tenant CSS vars, custom logo/font/color

### Analytics (`/analytics`)
- Operations, CRM, Revenue Forecast, Close Rate by Lead Source, Installer Performance, Measurement Accuracy

### Email Order Tracking (`/api/email-inbound`)
- Postmark inbound webhook, PDF attachment parsing, package-level auto-updates

### Automated Email Outreach
- Resend integration, 5 templates, daily cron reminders

### Payments & Invoicing (`/payments` and `/invoices/[id]`)
- Invoice generation from quotes, payment recording, public invoice view (`/i/[token]`)

### Automation Engine
- IF/THEN rules, daily cron, 5 presets, Settings UI

---

## Database Schema (Supabase)

### Core tables
- `customers`, `measure_jobs`, `rooms`, `windows`, `window_photos`, `install_issues`
- `activity_log`, `tasks`, `customer_phones`
- `product_catalog`, `quote_materials`, `material_packages`
- `email_order_inbox`, `email_log`
- `install_checklist_items`, `install_checklist_completions`
- `invoices`, `invoice_line_items`, `payments`
- `automation_rules`, `automation_log`, `automation_queue`
- `builder_contacts`, `builder_projects`, `builder_project_quotes`, `builder_messages`
- `pay_rates`, `pay_entries`, `payroll_runs`
- `app_feedback`

### Auth tables
- `companies`: plan, features, brand_*, trial_ends_at
- `profiles`: id (= auth.users.id), company_id, full_name, role, permissions JSONB
- `company_settings`: invoice_prefix, next_invoice_number, default_payment_terms_days, etc.

### SQL migrations applied
- phase2_crm.sql ✓, phase2_crm_v2.sql ✓, phase5_auth_multitenancy.sql ✓
- phase6_install_management.sql ✓, phase7_whitelabel.sql ✓, phase8_email_outreach.sql ✓
- phase8_builder_portal.sql ✓, phase9_invoicing.sql ✓, phase9_payroll.sql ✓
- lead_assignment.sql ✓

---

## Key Behaviors / Gotchas
- Address stored as `street|city|state|zip` pipe-separated
- `company_id` auto-set by trigger on INSERT, enforced by RLS
- Light mode enforced via `html:root` + `color-scheme: light` + `!important`
- Build script: `rm -rf .next/cache && next build`
- pay_rates schema: single `rate` field + `commission_pct` (NOT separate hourly_rate/per_job_rate columns)
- pay_entries: `work_date` (not entry_date), `description` (not customer_name), `sale_amount` (not commission_base)
- pay_entries entry_type CHECK constraint: hours, job, commission, bonus, deduction (no "salary" or "windows")
- Salary-type entries should use "bonus" entry_type
- Test users are in auth.users + profiles but can't actually log in via the app's signup flow (created via SQL)

---

## Architecture Decisions
- All pages are `"use client"` components — no server components yet
- Supabase client-side (anon key) with RLS enforced
- Feature flags: `features` JSONB on `companies` table
- FeatureGate + PermissionGate double layer
- Postmark: one account, per-company unique inbound email
- **thriftflow/ subfolder**: belongs to another Cowork session — DO NOT TOUCH

---

## Deployment
- Stack: Next.js 16 App Router + TypeScript + Supabase + Vercel + Tailwind CSS 4
- **Vercel CLI deploy**: `cd ~/shadelogic && npx vercel --prod`
- **GitHub auto-deploy**: Connected ✓ (wiezski/shadelogic)
- Git remote: `https://github.com/wiezski/shadelogic.git`
- Local project path: `~/shadelogic`
- Cron: daily at 8am UTC (Hobby plan limit)

---

## Backlog (not yet scheduled)
- Blind cost calculator
- Rearrangeable homepage with role-based defaults
- Stripe SaaS billing (tiered plans, per-user pricing)
- SMS strategy (built-in vs. add-on, Twilio ~$0.01/msg)
- Pricing intelligence: scrape Blinds.com, SelectBlinds
- Manufacturer API integrations
- Password reset flow (pages exist, need email delivery)
