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

### Calculator Enhancements — Complete ✓
- Fixed totals display (changed from fixed-position bar to inline orange card with fallback color)
- Added "Create Measure Job" button that opens customer picker modal
- Customer picker has search filtering and inline add-new-customer form
- Creating a measure job now links the selected customer and sets title from window count

### Quote → Measure Job Auto-Creation — Complete ✓
- When a quote is marked "sent", auto-creates a measure job from quote lines if no linked measure exists
- Creates room "From Quote" with windows pre-filled from quote line items
- Links measure job to quote via linked_measure_id
- Shows schedule prompt with links to open measure job or go to calendar
- Auto-creates follow-up task for next day

### Rearrangeable Homepage — Complete ✓
- 10 extracted widget components in `app/dashboard-widgets.tsx`
- Role-based default layouts (owner, lead_sales, sales, office, scheduler, installer, accounting, warehouse)
- Drag up/down reordering with "⚙ Customize" button in header
- Layout persisted via `zr_layout` cookie
- Reset to role default button

### Stripe SaaS Billing — Complete ✓
- **API routes**: `/api/stripe/checkout`, `/api/stripe/portal`, `/api/stripe/webhook`
- **Billing page**: `/settings/billing` — plan comparison grid, trial countdown, upgrade/manage buttons, FAQ
- **3 tiers**: Starter ($49/mo, 1 user), Professional ($99/mo, 3 users), Business ($199/mo, 5 users)
- **Per-user pricing**: +$25/mo per extra user above plan limit
- **14-day free trial** on first subscription (no trial on re-subscribe)
- **Trial abuse prevention**: card required at checkout, card fingerprint tracked in `trial_cards` table, duplicate cards end trial immediately
- **Device session limiting**: max 3 concurrent devices per user, oldest kicked on overflow, 5-min heartbeat keepalive
- **Webhook handlers**: checkout.session.completed (with card fingerprint check), subscription.updated, subscription.deleted, invoice.payment_failed
- **DB migrations applied**: stripe fields on companies, `user_sessions` table, `trial_cards` table, `pending_approvals` table, `status` column on profiles
- **Vercel env vars set**: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STARTER, STRIPE_PRICE_PROFESSIONAL, STRIPE_PRICE_BUSINESS

### Phase 16 — User Approval Flow — Complete ✓
- **Signup flow**: when someone joins via invite and team is at/over plan user limit, profile gets `status: 'pending'`
- **Pending screen**: pending users see a blocking "Waiting for Approval" screen when they log in, with Check Again and Sign Out buttons
- **Owner approvals**: Settings page shows yellow "Pending Team Requests" section with Approve (+$25/mo) and Deny buttons
- **API route**: `POST /api/team/approve` — owner-only, approves (sets active) or denies (deletes profile + auth user)
- **Under-limit joins**: users joining when team is under the plan limit join freely with no approval needed
- **Team count**: settings team section now only counts active users for billing calculations
- **DB**: `pending_approvals` table with RLS, `profiles.status` column (active/pending)

### Phase 17 — Pay System Enhancements — Complete ✓
- **Toggle-based pay components**: Hourly rate, Commission %, Salary amount, Contractor flag — all toggleable per person
- **Contractor rate cards**: Default 11 service lines (Blind Install, Shutter Install, Shade Install, Motorized Install, etc.) with configurable rates and unit labels
- **Custom rate card services**: "+ Add Custom Service" button for custom line items
- **Rate card preview**: Shows all services with rates in compact view
- **Pay type CHECK constraint**: Fixed to include `contractor` and `mixed` values
- **Trigger fix**: `auto_set_company_id_pay_rates` changed to lookup from `NEW.profile_id` instead of `auth.uid()`

### Phase 18 — Auto-Pay Generation — Complete ✓
- **Commission auto-gen** (`lib/auto-pay.ts`): When quote approved (via status change or signature), looks up salesperson from `customer.assigned_to`, gets their `commission_pct` from `pay_rates`, creates pending commission `pay_entry`. Duplicate-safe.
- **Contractor pay auto-gen** (`lib/auto-pay.ts`): When install marked complete, classifies each window by product type → maps to rate card services → calculates total pay with breakdown. Creates pending job `pay_entry`.
- **Window classifier**: Maps product names to service categories (Blind, Shade, Shutter, Motorized, Cornice) plus add-on flags (takedown, tall ladder, masonry).
- Wired into `quotes/[id]/page.tsx` (both approval paths) and `measure-jobs/[id]/page.tsx` (both completion paths).

### Phase 19 — Role-Based Calendar + Phone Export — Complete ✓
- **DB**: `assigned_to` column added to `appointments` table (phase21 migration)
- **Person filter**: Dropdown defaults by role — Owner/Admin/Office/Scheduler see everyone; Sales see self + installers; Installers see only their own
- **Assignee on create**: "Assign To" field when creating appointments (defaults to current user)
- **Assignee display**: Shows assigned person name in appointment detail modal
- **.ics export**: "Add to Calendar" toolbar button exports all visible appointments as .ics file (Android/iPhone compatible)
- **Single event export**: "Add to My Phone Calendar" button per appointment in detail modal

### Phase 20 — QuickBooks Export + PO Generation — Complete ✓
- **Payroll export** (`/payroll`): Export dropdown with 3 formats:
  - CSV (Excel/Sheets): full detail + per-person summary
  - QuickBooks IIF: hourly → timesheets, commissions/job pay → general journal entries with debit/credit
  - Payroll Summary: per-person breakdown grouped by pay type with subtotals
- **Invoice export** (`/payments`): Export dropdown with 3 formats:
  - CSV: all invoices with outstanding/collected totals
  - QuickBooks IIF: INVOICE entries (AR debit / Sales credit / Tax splits) + PAYMENT entries
  - A/R Aging Report: outstanding invoices bucketed by Current, 30+, 60+, 90+ days
- **Purchase Order generation** (`/quotes/[id]`): "Generate PO" button on approved quotes, opens print-ready HTML PO with line-by-line products, dimensions, costs, vendor blank. Auto-prints.
- **Job Costing dashboard** (`/analytics`): Per-job profitability analysis — sale price vs material cost + labor + commissions = gross profit/margin. Visual cost breakdown bar, summary cards, exportable CSV.

### Phase 24 — Business Type Presets + Focus Mode Dashboard — Complete ✓

**Business Type Questionnaire** (`/onboarding`):
- 6 presets: Solo Installer, Install Crew, Solopreneur, Sales Only, Small Team, Full-Service Shop
- Each preset configures: hidden nav items, feature overrides, dashboard widget defaults, suggested roles
- Two-step flow: card selection → confirmation screen showing what gets enabled/disabled
- "Skip for now" option, accessible from Settings → Company tab
- Saves `business_type` and `hidden_nav` to companies table

**Focus Mode Dashboard Filtering:**
- Shared config in `lib/focus-modes.ts` — mode labels, icons, nav filters, widget defaults
- Dashboard (`/`) filters visible widgets based on active task mode
- Cross-component sync via 500ms localStorage polling
- Mode widget defaults: Measuring (appointments/queue/ready/actions), Quoting (actions/pipeline/KPIs/queue/revenue), Scheduling (appointments/operations/tasks/queue), Warehouse (ready/shipments/operations)

**Focus Mode Widget Customization** (Settings → My Dashboard):
- `FocusModeWidgetsSection` — tabs for each mode (Measuring/Quoting/Scheduling/Warehouse)
- Toggle switches to show/hide widgets per mode
- "Reset to Default" button per mode
- Overrides saved to localStorage (`zr-mode-widgets` key)

**Nav item filtering** stays hardcoded per mode (not customizable per user request).

DB migration: `phase24_business_type.sql` ✓ (adds business_type TEXT + hidden_nav JSONB to companies)

### Phase 25 — SEO Foundation — Complete ✓
- **Expanded root metadata** (`app/layout.tsx`): title template, keywords, metadataBase (NEXT_PUBLIC_SITE_URL or zeroremake.com), openGraph, twitter card, robots directives, canonical, Google verification slot (NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION env var), category, authors/publisher. Moved themeColor into `viewport` export per Next 15+ convention.
- **Sitemap** (`app/sitemap.ts`): auto-generates `/sitemap.xml` with / (priority 1), /signup (0.9), /login (0.5), /forgot-password (0.3).
- **Robots** (`app/robots.ts`): `/robots.txt` allows public marketing pages, disallows /api/, /customers, /quotes, /measure-jobs, /invoices, /payments, /payroll, /analytics, /schedule, /settings, /onboarding, /builders, /manufacturers, /products, /calculator, /intake, /jobs, /setup-guide, and token routes /b/ /i/ /q/. Points to sitemap.
- **Open Graph image** (`app/opengraph-image.tsx`): Next.js edge-rendered 1200×630 branded social card used automatically by Facebook, LinkedIn, iMessage, Twitter (via summary_large_image fallback).
- **JSON-LD structured data** on landing page: Organization + SoftwareApplication (with offers for all 3 plans) + FAQPage (from existing faqs array). Enables Google rich results for pricing and FAQ snippets.
- **manifest.json enhanced**: added categories (business/productivity/utilities), scope, id, lang, longer description.

### Phase 28 — Companies RLS lockdown — Complete ✓
Before: RLS was DISABLED on `companies` — anyone with an authenticated JWT could read/update/delete any tenant's row, including live secrets (`twilio_auth_token`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_connect_account_id`).

After:
- RLS enabled.
- INSERT allowed for any authenticated user (so signup can create their own row).
- SELECT scoped to `id = profile.company_id` for `auth.uid()`.
- UPDATE scoped to own company AND role = 'owner'.
- No DELETE policy (locked).
- Signup flow in `app/signup/page.tsx` refactored to generate the company UUID client-side via `crypto.randomUUID()` so it doesn't need a SELECT-back round-trip. No functional change for users; just avoids a policy conflict on INSERT+SELECT.
- Verified ShadeLogic owner (wiezski@gmail.com) has role='owner' and can still update company settings; staff (office/sales/installer roles) correctly cannot.

`product_changes.product_changes_select` (previously flagged) was audited and left alone — it's a global product-catalog table shared across tenants by design (no `company_id` column).

`company_settings.anon_co` (anon SELECT qual=true) was flagged but deferred. Public quote / invoice / builder pages rely on the anon key to read branding info for rendering. Proper fix: a token-gated RPC or a column-scoped view that exposes only safe branding fields, not the raw `phone`/`email` columns. Tracked as Phase 29 candidate.

Migration: `supabase/phase28_companies_rls_lockdown.sql` ✓ (applied live).

### Phase 27 — EMERGENCY tenant-isolation leak fix — Complete ✓
Caught during live end-to-end signup test. A brand-new signup (Claude Test Co) could read ShadeLogic's customers, measure jobs, rooms, windows, and window_photos. Direct PostgREST call from the new user's JWT returned Johnny Lawrence, Steve Wiezbowski, etc.

Root cause: 5 tables had parallel permissive policies named `"allow all <table>"` with `USING (true) WITH CHECK (true)` granted to `public`. Postgres ORs permissive policies, so the "allow all" silently negated the proper `co` policy that scoped by `company_id = get_company_id()`.

Fix: dropped the 5 offending policies. The `co` policies already existed on each table and now enforce isolation cleanly. Verified: same JWT query now returns `[]`.

Migration: `supabase/phase27_critical_rls_fix.sql` ✓ (applied live).

### Onboarding silent-bail fix — Complete ✓
The onboarding "Set Up My Workspace" button silently did nothing because `applyPreset` early-returned if the AuthProvider's context hadn't finished loading the profile. Fix: resolve `company_id` directly from `supabase.auth.getUser()` → `profiles` lookup inside the handler, wrap in try/catch, show a visible error banner. Commit `bcbb517`.

### Remaining RLS risks (Phase 28 candidates)
- **`companies` table RLS disabled** (flagged earlier). Any authenticated user can UPDATE/DELETE any company row. Needs tenant-scoped policies.
- **`company_settings.anon_co` permits anon SELECT on all rows** including `phone` and `email` columns. Narrow to safe branding columns only, or require a token match.
- **`product_changes.product_changes_select`** lets any authenticated user read product change history across tenants. Scope to `company_id`.

### Phase 26 — Signup flow bugs fix — Complete ✓
Post-launch audit surfaced two bugs that would have bitten real signups:
- Companies got `plan='trial'` but `trial_ends_at=null`. Added column DEFAULT of `now() + 14 days`. Billing-page countdown and trial enforcement now work.
- `promo_codes` had RLS on with only a SELECT policy — the redeem UPDATE in signup was silently blocked. Added `promo_codes_redeem` policy: authenticated users can UPDATE only unused codes, and only when tying them to their own company.
Migration: `supabase/phase26_signup_trial_and_promo_fix.sql` ✓.

### Open Security Risks (flag for next session)
- **`companies` table RLS is DISABLED.** Any authenticated user can UPDATE / DELETE any company's row. OK at 1 tenant, not OK at 10. Needs policies for SELECT (own company only), UPDATE (own + owner role), DELETE (owner role). Tricky to enable without breaking signup — the INSERT at signup happens before the profile row exists.
- **Turnstile captcha could silently block signups** if `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set in Vercel but the widget fails to render. Confirm it's either off (delete env var) or tested working.

### Phase 25 — order-documents storage bucket finalized — Complete ✓
- Bucket `order-documents` existed but had no RLS policies (silent upload failures).
- Added 4 policies for `authenticated` role: INSERT / SELECT / UPDATE / DELETE scoped to `bucket_id = 'order-documents'`.
- Data-level tenancy still enforced by `quote_materials` / `quotes` company_id RLS.
- Switched `app/quotes/[id]/page.tsx` order-PDF upload from `window-photos` fallback to the proper `order-documents` bucket, with path `{quoteId}/{materialId}/{ts}-{name}`.
- Migration saved as `supabase/phase25_order_documents_storage.sql` ✓.

### Google Search Console — Set Up ✓
- zeroremake.com verified via DNS TXT (GoDaddy).
- sitemap.xml submitted, 4 URLs discovered.
- Homepage requested for priority indexing.

### Facebook Page Linked ✓
- `sameAs: ["https://www.facebook.com/zeroremake/"]` in Organization JSON-LD on landing page.
- Facebook icon + link added to landing page footer.
- FB Sharing Debugger confirms OG image + all og:* tags render correctly.

### Bing Webmaster Tools — Set Up ✓
- zeroremake.com verified via Google Search Console import.
- Sitemap submitted, 4 URLs discovered, status "Successfully processed".
- Covers Bing + DuckDuckGo + ChatGPT web search.

### Next Up (marketing / analytics quick wins)
- **Google Analytics 4**: tag zeroremake.com (20 min setup). Drop GA4 measurement ID into an env var + `<Script>` tag in layout.
- **Google Business Profile**: for local "blinds installer near me" discovery if doing local installs.
- **Facebook Pixel**: 10 min install, required if running FB ads later.
- **Facebook domain verification**: if doing FB Pixel/ads, add token in `metadata.other["facebook-domain-verification"]` in layout.tsx.
- **NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION** Vercel env var — optional backup verification method.

---

## Proposed Features (scoped, ready to build)

### Feature A — Canvassing Tracker
Biggest product differentiation; no competitor in window-treatment software has this.

**Goal**: Let installers see where they've canvassed (door-to-door / flyer drops), track outcomes per house, and get AI-nudged next-best neighborhoods.

**DB (new tables)**:
- `canvas_territories` — id, company_id, name, geometry (GeoJSON or bounding box), created_by, created_at
- `canvas_visits` — id, company_id, territory_id, address, lat, lng, outcome (`not_home|flyer|conversation|lead`), notes, visited_by, visited_at, customer_id (nullable, links to customers if lead created)
- Both tables need RLS + auto-set `company_id` trigger, following existing Phase 5 pattern

**Pages/components**:
- `/canvas` — main page, split view: map left, visit log right
- `/canvas/new-territory` — draw or address-list to define a territory
- `CanvasMap` component — Mapbox GL JS (~$0 up to 50K loads/mo, free tier fine for a while)
- `VisitLogSheet` — mobile-first, big "I'm here, log visit" button that GPS-stamps lat/lng
- Dashboard widget: "Today's canvassing" summary

**Integrations**:
- Geocoding: Mapbox Geocoding API (free up to 100K/mo) for address → lat/lng
- Address lookup for a drawn territory: OSM Overpass API (free) to get all houses in a polygon
- If visit outcome = "conversation" or "lead" → auto-create customer row with address, link `customer_id` back to visit, prefill `lead_status = 'New'`, create a follow-up task

**Automation**:
- **Next-10 suggestion**: algorithm picks 10 un-visited houses nearest to converted customers (same/adjacent zip, within 500m of a won quote)
- **SMS follow-up**: 1 hour after a "conversation" visit, prompt to send templated SMS ("Nice meeting you — here's my quote link if you're ready")
- **Weekly digest**: Monday email with last week's visit counts + conversion rate by territory + 3 "hot zones" suggested
- **Stuck territory alert**: if territory was 80%+ canvassed and < 2% converted, auto-flag it to be parked

**Scope estimate**: 1-2 sessions for MVP (tables + map + visit log + outcome tracking + customer link). Auto-suggestions + SMS follow-up + digest are Phase 2.

**Libraries to add**: `mapbox-gl` (~200kb), `@types/mapbox-gl`
**Env vars needed**: `NEXT_PUBLIC_MAPBOX_TOKEN`

---

### Feature B — Shipping Stage Automation
~80% already built in Phase 14/23. Tightens up what's there.

**Current state** (works today):
- `quote_materials.status`: ordered / shipped / received, manually flipped
- `material_packages.status`: pending / received, manually checked in
- "Check In All" button, "Stage for Install" workflow, batch receive

**Gaps to close**:

**1. Auto-status transitions** (pure DB logic, no external APIs):
- TRIGGER on `material_packages` — when count(received) == expected_packages, auto-update parent `quote_materials.status = 'received'` + set `received_at`
- TRIGGER on `quote_materials` — when all materials for a quote are `received`, auto-update quote to `ready_for_install` stage + notify
- TRIGGER on tracking_number set → `status = 'shipped'` if status was `ordered`

**2. Customer shipping notifications** (uses existing Resend + Twilio):
- On `material_packages.status` → `shipped` with tracking_number: email + SMS customer "Your blinds shipped! Tracking: XYZ, ETA Wed"
- On all materials `received` (ready for install): email customer "Your order is in — let's schedule your install"
- Uses existing `useSMS()` hook + existing email template pattern

**3. Carrier tracking auto-lookup**:
- Nightly cron hits tracking APIs for each in-transit package, updates `eta` and transitions to `shipped`/`received` automatically
- USPS: free API (https://www.usps.com/business/web-tools-apis/), register for USERID
- UPS: OAuth app (https://developer.ups.com/), free tier
- FedEx: OAuth app (https://developer.fedex.com/), free tier
- Auto-detect carrier from tracking number format (regex)
- New `lib/carrier-lookup.ts` with a unified `getShipmentStatus(trackingNumber)` function

**4. "What's stuck" dashboard widget**:
- Lists materials ordered > 14 days ago still not shipped
- Quote → material → vendor with one-click "Email vendor for update" (templated)

**Scope estimate**: 1 session for auto-transitions + notifications (no external APIs). +1 session for carrier lookups (requires you to register for USPS/UPS/FedEx dev accounts, provision OAuth credentials).

**Env vars needed**: `USPS_USERID`, `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`
**Migration needed**: `phase26_shipping_auto_transitions.sql` (triggers)

---

### Feature C — Stripe Connect Live Payments (finish)
Scaffolded in Phase 21. Needs end-to-end testing.

**What exists**:
- `/api/stripe/connect/onboard` — creates Express Connect account, redirects to Stripe onboarding
- `/api/stripe/connect/payment-intent` — creates PaymentIntent on connected account with 1% platform fee
- Webhook handlers: `account.updated`, `payment_intent.succeeded`
- Settings toggle: `live_payments_enabled`, `stripe_connect_account_id`, `stripe_connect_onboarded`
- Public customer invoice view should be able to pay via Stripe

**What needs doing**:
1. Verify STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set in Vercel (they already are per handoff line 130)
2. As Steve, go through Settings → Integrations → Stripe Connect → "Connect Stripe account" → complete onboarding flow on live Stripe
3. Create a test invoice, open public view at `/i/[token]`, pay with a real card (use your own Stripe account so the fee lands in your account)
4. Verify webhook fires and invoice `status` transitions to `paid` with `amount_paid` populated
5. Test failure paths: card declined, 3DS challenge, partial refund
6. Audit UI: does the "Pay Now" button appear only when `live_payments_enabled = true` AND `stripe_connect_onboarded = true`?

**Likely bugs to find**: webhook signature verification, connected account ID not being passed to PaymentIntent creation, customer invoice view not detecting whether live payments are available.

**Scope estimate**: 1 session (1-2 hours). Mostly testing + bug fixing, minimal new code.

---

### Feature D — QuickBooks Online Direct API Sync
Replaces manual IIF export with real-time bi-directional sync.

**Prerequisites (Steve does first)**:
- Create QuickBooks Developer account at https://developer.intuit.com
- Create a new app, get `CLIENT_ID` and `CLIENT_SECRET`
- Add Vercel env vars: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`

**Build scope** (broken into 3 phases):

**D1 — OAuth + company connection** (1 session)
- `/api/qbo/connect` — kicks off OAuth 2.0 authorization code flow
- `/api/qbo/callback` — handles redirect, stores access_token, refresh_token, realm_id per company
- DB: add `qbo_access_token`, `qbo_refresh_token`, `qbo_realm_id`, `qbo_expires_at`, `qbo_connected_at` to `companies` table (migration)
- Settings page: "Connect QuickBooks" button in Integrations tab, status indicator when connected, disconnect button
- Token refresh helper in `lib/qbo.ts` with automatic refresh on 401

**D2 — Invoice + payment sync** (1 session)
- Map ZeroRemake `invoices` → QBO `Invoice` entity (line items, customer, tax)
- Map ZeroRemake `customers` → QBO `Customer` entity (create if not exists, update if changed)
- Map ZeroRemake `payments` → QBO `Payment` entity (apply to invoice)
- Sync direction: ZeroRemake → QBO only (one-way initially, avoid conflict hell)
- New `qbo_sync_log` table — tracks every sync attempt, success/failure, QBO entity ID
- Sync triggers: immediately on invoice create/update/delete, payment record; retry queue for failures

**D3 — Bi-directional + expense + payroll** (1 session)
- Pull QBO invoices created outside ZeroRemake back in (check for updates every 4 hrs via cron)
- Push `pay_entries` → QBO `JournalEntry` or `Bill` (for contractors)
- Push vendor bills (material orders from Phase 14) → QBO `Bill`
- Conflict resolution: "last edited wins" with user-facing conflict badge

**Scope estimate**: 3 sessions total. D1 + D2 give ~80% of user value (auto-push invoices and payments). D3 is nice-to-have.

**Libraries**: `intuit-oauth` for OAuth flow, `node-quickbooks` for API client.

**DO NOT** start D2 until D1 is fully tested with your own QBO account, otherwise you'll have half-formed sync logic polluting real data.

---

### Feature E — UX Improvements Pack (~0.5 session)

Small-but-high-impact polish pulled from user feedback.

**E1 — In-app back/forward navigation**
- Problem: when ZeroRemake is "installed" to a phone home screen as a PWA, there's no browser chrome, so no back button. Users get stuck deep in a flow (e.g. inside a quote → material → package detail).
- Fix: add a persistent back arrow in the top-left of `NavBar` that uses `router.back()` (Next.js App Router). Forward arrow optional — `router.forward()` works but most mobile apps skip it.
- Hide on top-level pages (`/`, `/schedule`, `/warehouse`, `/settings`) since there's nowhere to go back to.
- Consider also: breadcrumb trail on deep pages (Quote #123 → Material → Package 2/4).

**E2 — Warehouse "Set Location" one-tap fix**
- Problem: `/warehouse` requires picking location from dropdown THEN clicking Set Location (two taps for one action). Confusing UX — button is visually disabled until dropdown changes.
- Fix: remove the Set Location button. On dropdown change, auto-save via the existing `updateLocation(materialId, location)` function. Show a brief toast ("Saved to Shelf A") for confirmation.
- File: `app/warehouse/page.tsx` lines ~370-380.

**E3 — Stage-for-Install confirmation**
- Today: clicking "Stage for Install" flips the material silently. Easy to misclick on mobile.
- Fix: wrap in a confirm() modal: "Stage [product] for install?" with Cancel / Confirm.
- Optional: add an "undo" toast for 10s after staging (revert `status` back to `received`, clear `staged_at`).

**E4 — Empty location label**
- Today: "No location" is shown even when the dropdown is the picker. Makes the Set Location button look like it's doing nothing.
- Fix: change dropdown placeholder to "— Select a location —" and make the selected value visible inline after pick.

Scope: all four are small. Would ship together in a half session.

---

## What's Built

### Dashboard (`/`)
- **Rearrangeable widgets** — 10 widget components, role-based defaults, drag reorder, cookie persistence
- Widgets: Quick Actions, KPI Strip, Revenue Chart, Today's Focus, Sales Pipeline, Operations, Work Queue, Ready to Install, Today's Appointments, Tasks Due
- "⚙ Customize" button in header, reset to role default
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
- **Pay Rates tab**: toggle-based (hourly/commission/salary/contractor), contractor rate cards with custom services, shows all team members
- **Payroll Runs tab**: create pay periods, finalize → mark paid
- **Add Entry modal**: auto-calculates from configured rate
- **Auto-pay**: commissions auto-create on quote approval, contractor pay auto-creates on install completion
- **Export dropdown**: CSV (Excel/Sheets), QuickBooks IIF (timesheets + journal entries), Payroll Summary (for accountant)
- Supports: hourly, per-job, per-window, salary, commission-only, contractor, and hybrid pay

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
- **Generate PO** button: creates print-ready purchase order with all line items, dimensions, costs, vendor blank
- **Storage location tracking**: per-package and per-material location (Warehouse/Garage/Shelf/Truck/etc)
- **Batch check-in**: "Check In All" button for receiving entire shipments at once
- **Stage for Install**: marks received materials as staged/loaded, with timestamps
- **Job Materials Checklist**: cross-references measured → sold → ordered → received with match status per line item

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
- **Job Costing**: per-job profitability (sale vs material + labor + commission costs), visual cost breakdown bar, margin %, CSV export

### Email Order Tracking (`/api/email-inbound`)
- Postmark inbound webhook, PDF attachment parsing, package-level auto-updates

### Automated Email Outreach
- Resend integration, 6 templates (+ password reset), daily cron reminders

### Manufacturer Spec Library (`/manufacturers`)
- 18 products from 5 brands (Hunter Douglas, Norman, Graber, Levolor, Alta)
- Search, filter by manufacturer/category, expandable product cards
- Company-level manufacturer accounts (account #, rep info, discount %)

### SMS Integration (Twilio)
- Server-side SMS via Twilio when enabled, graceful fallback to native `sms:` links
- Toggle + credential config in Settings, off by default

### Stripe Connect (Live Payments)
- Express onboarding, payment intent creation, webhook-driven invoice updates
- Toggle in Settings, off by default, 1% platform fee

### Payments & Invoicing (`/payments` and `/invoices/[id]`)
- Invoice generation from quotes, payment recording, public invoice view (`/i/[token]`)
- **Export dropdown**: CSV, QuickBooks IIF (invoices + payments), A/R Aging Report (by age bucket)

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
- `manufacturer_specs`, `company_manufacturers`
- `app_feedback`

### Auth & billing tables
- `companies`: plan, features, brand_*, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, sms_enabled, live_payments_enabled, twilio_*, stripe_connect_*
- `profiles`: id (= auth.users.id), company_id, full_name, role, permissions JSONB, status (active/pending)
- `company_settings`: invoice_prefix, next_invoice_number, default_payment_terms_days, etc.
- `user_sessions`: device session tracking (user_id, device_id, device_label, last_active)
- `trial_cards`: card fingerprint tracking for trial abuse prevention
- `pending_approvals`: tracks over-limit signup approval requests (profile_id, company_id, resolution)

### SQL migrations applied
- phase2_crm.sql ✓, phase2_crm_v2.sql ✓, phase5_auth_multitenancy.sql ✓
- phase6_install_management.sql ✓, phase7_whitelabel.sql ✓, phase8_email_outreach.sql ✓
- phase8_builder_portal.sql ✓, phase9_invoicing.sql ✓, phase9_payroll.sql ✓
- lead_assignment.sql ✓, phase15_session_tracking.sql ✓, phase16_user_approval_flow.sql ✓
- phase19_fix_pay_rates_trigger.sql ✓, phase20_fix_pay_type_constraint.sql ✓
- phase21_appointments_assigned_to.sql ✓
- phase22_manufacturer_specs.sql ✓
- phase23_warehouse_tracking.sql ✓

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

### Stripe SaaS Billing (`/settings/billing`)
- Plan comparison grid: Starter ($49/1 user), Professional ($99/3 users), Business ($199/5 users)
- Per-user add-on: +$25/mo per extra user above plan limit
- Current plan card with status badge, trial countdown, team size info
- Feature checklists per plan
- Upgrade → Stripe Checkout (card required, 14-day trial on first sub), Manage → Stripe Customer Portal
- Webhook-driven plan updates with trial abuse prevention (card fingerprinting)
- Device session limiting: max 3 concurrent devices per user
- User approval flow: over-limit signups go to pending, owner approves/denies from Settings

### Calculator (`/calculator`)
- Blind cost calculator with product selection, measurements, quantity
- Inline orange totals card
- "Create Measure Job" with customer picker modal (search + add new customer)

### Phase 21 — Password Reset + Manufacturer Specs + SMS + Stripe Connect — Complete ✓

**Password Reset Email** (via Resend):
- Custom branded password reset email template (matches existing email design)
- `/api/auth/reset-password` API route: generates recovery link via Supabase admin, sends via Resend
- Forgot-password page updated to use our API instead of Supabase's default email
- Prevents email enumeration (always returns success)

**Manufacturer Spec Library** (`/manufacturers`):
- `manufacturer_specs` table with 18 seeded products from 5 brands: Hunter Douglas, Norman, Graber, Levolor, Alta
- Product specs include: size ranges, lead times, warranty, colors, materials, features, pricing/ordering notes
- `company_manufacturers` table for per-company account details (account #, rep contact, discount %)
- Full search/filter UI by manufacturer, category (blind/shade/shutter/motorization)
- Expandable product detail cards with all spec data
- "My Accounts" section for owner/admin to save rep info and dealer account numbers
- "Specs" nav link visible to anyone with `create_quotes` permission

**Twilio SMS Integration** (toggle-controlled):
- `/api/sms` route: sends via Twilio REST API (no SDK), falls back to native `sms:` link when disabled
- `useSMS()` client hook: tries API first, auto-falls back to native messaging
- Integration toggle in Settings → Company tab with credential fields (Account SID, Auth Token, Phone #)
- `sms_enabled` flag on companies table (default: false)
- SMS logged to activity_log

**Stripe Connect Live Payments** (toggle-controlled):
- `/api/stripe/connect/onboard` — creates Express Connect account, redirects to Stripe onboarding
- `/api/stripe/connect/payment-intent` — creates Payment Intent on connected account with 1% platform fee
- Webhook handling: `account.updated` (marks onboarding complete), `payment_intent.succeeded` (records payment on invoice)
- Integration toggle in Settings with Stripe Connect button
- `live_payments_enabled`, `stripe_connect_account_id`, `stripe_connect_onboarded` on companies table (default: false)

SQL migration: `phase22_manufacturer_specs.sql` ✓

### Phase 23 — Warehouse Tracking + Job Materials Checklist — Complete ✓

**Storage Location Tracking:**
- `storage_location` field on both `material_packages` and `quote_materials`
- Quick-set location dropdown (Warehouse, Garage, Shelf A/B/C, Shop, Truck, Job Site, Other)
- Location shows on material row header and individual package rows
- Location auto-propagates from material to packages on check-in

**Batch Package Check-In:**
- "Check In All" button for materials with pending packages
- Sets all pending packages to received in one click
- Auto-applies storage location when set

**Stage for Install Workflow:**
- "Stage for Install" button on received materials
- "Stage All for Install" button when all materials received
- Staged status with timestamp tracks when material was pulled for loading
- `staged_at`, `staged_by` fields on quote_materials

**Job Materials Checklist:**
- Collapsible grid view on quote detail: Product → Measured Size → Quote Details → Order Status → Location → Match
- Cross-references quote line items against tracked materials
- Shows match status (OK/Pending/Not tracked) per line item
- Summary footer with total counts and "Ready for install" indicator

SQL migration: `phase23_warehouse_tracking.sql` ✓

---

## Backlog (not yet scheduled)
- Manufacturer API integrations (EDI / direct catalog feeds)
- Direct QuickBooks Online API integration (OAuth + real-time sync)
- React Native mobile app + offline mode
- Google/Apple Calendar two-way sync (currently one-way .ics export)
- AI features: auto-quote from photos, product suggestions, close probability
