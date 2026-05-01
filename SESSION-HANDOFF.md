# ZeroRemake — Session Handoff

## How to Resume
Start new session with: "continuing ZeroRemake — read SESSION-HANDOFF.md, MASTER-SPEC.md, MVP-BUILD-PLAN.md, and DESIGN.md before doing anything."
Read all four files before touching any code.

---

## ⚡ Most recent session (Apr 30, 2026) — Audit funnel polish + Stripe live + lead capture

### What shipped (deployed to Vercel)

**Stripe live mode active.** Migrated from test → live, rotated the secret key after it was pasted in chat, added all four price IDs + webhook secret to Vercel, set business identity (sole-prop name, statement descriptor, brand color, logo). First test transaction captured + refunded successfully.

**Audit experience refinements (`/audit`):**
- Score now displays as `X / 100` with new subheadline + trust line
- Post-email submit shows an "inbox confirmation" card instead of dumping straight to results
- All audit CTAs route to `/walkthrough` (not the homepage, not an inline form, not a query param)
- BlockedScanCard rendered when target site returns 4xx/5xx — captures email for manual review with a tag of `BLOCKED_PENDING_MANUAL_REVIEW` instead of pretending to have data
- `BlockedScanError` class in `lib/audit/scanner.ts` distinguishes target-side blocks from server errors; retries once on transient statuses
- Email body de-personalized ("Prepared by ZeroRemake" — no individual name), CTA text updated

**Audit copy rewrite (`lib/audit/checks.ts`):** Replaced absolute claims like "No city pages detected" / "We couldn't find a phone number" with hedged language ("may not be fully leveraged" / "may not be strongly implemented" / "likely limiting performance"). Worst-case AND mid-tier branches both updated for tone consistency. **Structure, function names, severity logic, scoring, and Top-3 selection all unchanged.** TypeScript validates.

**Lead capture funnel — three storage paths now unified:**
| Path | Endpoint | Tag in `audit_requests.error` |
|---|---|---|
| Audit email submit | `/api/audit/unlock` | (none — real audit row) |
| Blocked scan capture | `/api/audit/manual-review` | `BLOCKED_PENDING_MANUAL_REVIEW` |
| `/walkthrough` form | `/api/walkthrough/request` | `WALKTHROUGH_REQUEST` |

All three fire owner alert emails to wiezski@gmail.com. Admin dashboard can filter by the tag to keep walkthrough/blocked rows out of audit metrics.

**New `/walkthrough` page** — minimal form (Name required, Phone + Notes optional), matches `/audit` visual style, captures UTM + referer, owns the booking flow off-ramp from emails and the audit page.

**Guides content** — `/guides/window-treatments-privacy-at-night` rewritten using the GuideBlock structure (h2/h3/p/ul) in `app/guides/_data/guides.ts`.

### Known issue

**heberblinds.com still returns 429 from our Vercel egress.** Their Cloudflare bot protection is the cause — we share egress IPs with other Vercel apps. Northwest Blind Co. and similar sites scan fine. The blocked-scan UX handles this gracefully now (capture email → manual review).

### Next session candidates

1. **Admin dashboard filter chips** — pending-walkthrough vs. blocked vs. completed audits. Tags are already in place.
2. **Manual-review fulfillment flow** — when Steve runs an audit by hand for a blocked-scan capture, a way to push the result back into the lead's email.
3. **Walkthrough scheduling integration** — current flow is a request form; eventually wire to a real calendar (Cal.com or Google Calendar).

---

## ⚡ Previous session (Apr 22, 2026) — UI system lock + field-features build

### What shipped (deployed to Vercel)

**Design system locked** — `DESIGN.md` at the repo root is the canonical UI spec. Every future change must match. Anti-patterns list included (no bordered cards, no `--zr-black` bg, no emoji labels, no radio buttons, no saturated red, no 1px row borders, no long back links).

**UI refactor sweep** — every major surface brought onto the system:
- Dashboard widgets (KPI Strip, Shipments, Today's Focus, Quick Actions, Sales Pipeline, Operations)
- Top nav + Focus Mode overlay + Notifications panel (text-only, underline-tab active state)
- Customer detail page (header, Next Action contextual bar, Lead Status chips, Contact Info)
- Measure jobs page (iOS back, Apple title, Add Room pill, segmented Inside/Outside mount type)
- Quote detail page (status segmented control, Request Signature primary, Send-to-customer share-sheet)
- Schedule page (pill segmented Day/Week/Month, softened calendar hairlines)
- Analytics, Payments, Warehouse, Products, Library, Specs, Canvas — all flattened
- All modals → iOS sheets (rounded-top 20pt, backdrop blur)
- Phone row in Customer > Contact Info — Call/Text buttons no longer clip on mobile
- Reminders page — computed "Happening now" feed (upcoming appointments + signature prompts) with Text/Directions quick actions

**New field features:**
- `/measure-jobs/new` — blank-measure quick-start (type a name, start measuring; finish-guard blocks Submit without customer name)
- Contract Installer role tuned: nav filtered (Canvas/Builders hidden, Specs visible), dashboard trimmed to field widgets, Quick Action first tile becomes "New measure"
- `/reviews` — Google review request scaffolding (Place ID input, Text/Email composer, request history; DB-first with localStorage fallback)
- Web Push stack — service worker, `lib/push.ts` client helper, `/api/push/{subscribe,unsubscribe,test}`, `supabase/functions/send-pushes` edge function, `scheduled_pushes` queue with 30-min-before-appt + signature prompt triggers
- Settings → Notifications toggle with "Send test push" button
- Settings → Job Duration Estimator rules CRUD (per_product_type / fixed_if_flag / setup_time)
- Global `overflow-x: hidden` safety net on `<html>` and `<body>`

### Left for next session (still applicable)

1. **Estimator wire-through** — `lib/estimator.ts` has `computeEstimate()` ready. Wire up when you want: on appointment create for install/measure, pull the customer's latest quote line items, group by product category, call estimator, suggest a duration in the modal.
2. **Google Business Profile OAuth** — `/reviews` page integration points are commented. Swap localStorage + message-templating for real review fetching + server-side auto-send when ready.

---

## Pending User Actions

### Web Push activation (~20 min) — see `SETUP-WEB-PUSH.md`
Web Push is fully coded but inert until:
1. Generate VAPID keys: `npx web-push generate-vapid-keys`
2. Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` to Vercel env
3. Apply `supabase/migrations/phase43_push_notifications.sql`
4. Deploy edge function: `supabase functions deploy send-pushes`
5. Test via Settings → Notifications → "Send test push"

The app works fine without these — every DB-dependent feature shows a graceful "not configured yet" state.

### Migration drafts awaiting decision (in `supabase/migrations/DRAFT_*.sql`)
| File | Status |
|---|---|
| `phase43_push_notifications.sql` | Required for Web Push |
| `phase44_job_duration_estimator.sql` | Optional — settings UI graceful-detects |
| `phase45_reviews_and_requests.sql` | Optional — `/reviews` graceful-detects |
| `DRAFT_blank_measure_flow.sql.removed` | Superseded — not needed (app-only approach used) |

All three remaining DRAFTs are safe: new tables only, no changes to existing data, RLS + rollback blocks included.

### Open security risks
- **`company_settings.anon_co`** lets anon SELECT full row including `phone`/`email`. Public quote/invoice/builder pages need this for branding — proper fix is a token-gated RPC or column-scoped view that exposes only safe branding fields.
- **`product_changes.product_changes_select`** lets any authenticated user read product change history across tenants. Scope to `company_id`. (Currently shared by design — global product catalog.)
- **Turnstile captcha** could silently block signups if `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set in Vercel but the widget fails to render. Confirm it's either off (delete env var) or working.

### Marketing quick wins (still on the to-do list)
- **Google Analytics 4** — drop GA4 measurement ID into a Vercel env var + `<Script>` in layout (~20 min)
- **Google Business Profile** — for local "blinds installer near me" discovery (only relevant if Steve does local installs)
- **Facebook Pixel** — required if running FB ads later (~10 min install)
- **Facebook domain verification** — if doing Pixel/ads, add token in `metadata.other["facebook-domain-verification"]` in layout.tsx
- **NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION** Vercel env var — optional backup verification method

---

## Build Phases — Complete

A compact ledger of what's shipped. Code in the repo is the source of truth; migrations are in `supabase/`. Detailed mechanics live in the code, not here.

| Phase | Scope | Migration |
|---|---|---|
| 1 | Measure & Install workflow | — |
| 2 | CRM foundation (customers, activity log, tasks, phones, 10-stage lead pipeline) | `phase2_crm.sql`, `phase2_crm_v2.sql` |
| 3 | Scheduling — calendar (day/week/month), 7 appointment types, customer SMS comms (confirm/remind/on-my-way) | — |
| 4 | Quoting — builder, pricing engine, templates, e-signature, public approval link, deposits | — |
| 5 | Multi-user auth + RLS on 19 tables + plans (trial/basic/pro/enterprise) + feature flags + FeatureGate | `phase5_auth_multitenancy.sql` |
| 6 | Quote→Install conversion, installer checklist, materials packing, customer sign-off | `phase6_install_management.sql` |
| 7 | Rebrand to ZeroRemake + white-label (per-tenant CSS vars, runtime injection) | `phase7_whitelabel.sql` |
| 7.5 | Light-mode hot-fix (Turbopack cache + `html:root` specificity + `color-scheme: light`) | — |
| 8 | Resend transactional email + 6 templates + daily cron reminders | `phase8_email_outreach.sql` |
| 8b | Builder Portal (internal `/builders` + public no-auth `/b/[token]`) | `phase8_builder_portal.sql` |
| 9 | Enhanced invoicing (generation, recording, public `/i/[token]`) | `phase9_invoicing.sql` |
| 9b | Payment connections settings + customer-facing invoice view | — |
| 9c | Payroll + commissions (rates, entries, runs, contractor rate cards) | `phase9_payroll.sql` |
| 10 | Automation engine (IF/THEN, daily cron, 5 presets, settings UI) | — |
| 11 | Advanced analytics (Revenue Forecast, Close Rate by Lead Source, Installer Performance, Measurement Accuracy) | — |
| 12 | Manufacturer library + PDF parsing + product change detection | — |
| 14 | Product catalog + order/package tracking + CSV import | — |
| 15 | Permission guards on all protected routes + client setup guide | — |
| 16 | User approval flow (over-limit signups → pending → owner approves) | `phase16_user_approval_flow.sql` |
| 17 | Pay system enhancements (toggle components, contractor rate cards, custom services) | `phase19/20` fixes |
| 18 | Auto-pay generation (commission on quote approval, contractor pay on install completion) | — |
| 19 | Role-based calendar + .ics phone export | `phase21_appointments_assigned_to.sql` |
| 20 | QuickBooks IIF export + PO generation + job-costing dashboard | — |
| 21 | Password reset (Resend) + manufacturer specs + Twilio SMS + Stripe Connect scaffold | `phase22_manufacturer_specs.sql` |
| 23 | Warehouse tracking + batch check-in + stage-for-install + job materials checklist | `phase23_warehouse_tracking.sql` |
| 24 | Business-type presets (6 archetypes) + focus-mode dashboard filtering | `phase24_business_type.sql` |
| 25 | SEO foundation (metadata, sitemap, robots, OG image, JSON-LD, Bing/GSC) | — |
| 25b | order-documents storage bucket policies | `phase25_order_documents_storage.sql` |
| 26 | Signup flow bug fixes (trial_ends_at default, promo_codes RLS) | `phase26_signup_trial_and_promo_fix.sql` |
| 27 | EMERGENCY tenant-isolation leak fix (5 "allow all" policies dropped) | `phase27_critical_rls_fix.sql` |
| 28 | Companies RLS lockdown (was DISABLED, now scoped + owner-only update) | `phase28_companies_rls_lockdown.sql` |
| 29 | Invite over-limit gate fix (SECURITY DEFINER RPC `check_invite_capacity`) | `phase29_invite_capacity_rpc.sql` |
| Stripe SaaS billing | 3 tiers ($49/$99/$199), 14-day trial, card-fingerprint abuse prevention, 3-device session limit, full webhook stack | env vars set in Vercel |
| Lead assignment + smart follow-ups | `assigned_to` on customers, stage transitions auto-set next_action, quick-action buttons | `lead_assignment.sql` |
| Calculator | Blind cost calc → measure-job creation flow with customer picker | — |
| Quote → Measure Job auto-create | When quote sent, auto-creates measure job from quote lines | — |
| Rearrangeable homepage | 10 widget components, role-based defaults, drag reorder, cookie persistence | — |
| Apr 22 — UI system lock | DESIGN.md canonical, full Apple-style refactor across all surfaces | — |
| Apr 30 — Audit funnel polish | Stripe live, audit copy rewrite, lead capture funnel, /walkthrough page | — |

### Test data seeded
- **3 dummy team members** (auth.users + profiles): Mike Torres (installer, hourly $28/hr, 3 entries $602), Jessica Nguyen (sales, 12% commission, 3 entries $1,098), Carlos Rivera (lead_sales, hybrid $3,500 + 8%, 3 entries $4,236).
- **1 dummy builder**: Apex Custom Homes (Danny Kowalski), 2 projects, portal link `/b/bbbbbbbb-0001-4000-8000-000000000001`.
- **Test passwords**: `TestPass123!` for `mike.test@example.com`, `jessica.test@example.com`, `carlos.test@example.com`. Created via SQL — can't actually log in via the app's signup flow.

---

## Proposed Features (scoped, ready to build)

### Feature A — Canvassing Tracker
Biggest product differentiation; no competitor in window-treatment software has this. **Note: a working v1 of canvassing already shipped** (see Apr 22 session — `Canvas v2/v3/v4` with assignees, GPS, sweep mode, SMS sharing, archive). The detailed spec below is from before that work landed; revisit it to see what's still aspirational versus already built.

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

**Libraries**: `mapbox-gl` (~200kb), `@types/mapbox-gl`. **Env vars**: `NEXT_PUBLIC_MAPBOX_TOKEN`.

---

### Feature B — Shipping Stage Automation
~80% already built in Phase 14/23. Tightens up what's there.

**Current state** (works today): `quote_materials.status` (ordered/shipped/received) manually flipped, `material_packages.status` (pending/received) manually checked in, "Check In All" button, "Stage for Install" workflow, batch receive.

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

**4. "What's stuck" dashboard widget**: lists materials ordered > 14 days ago still not shipped; one-click "Email vendor for update" (templated).

**Scope**: 1 session for auto-transitions + notifications (no external APIs). +1 session for carrier lookups (requires USPS/UPS/FedEx dev accounts).

**Env vars needed**: `USPS_USERID`, `UPS_CLIENT_ID`, `UPS_CLIENT_SECRET`, `FEDEX_CLIENT_ID`, `FEDEX_CLIENT_SECRET`. **Migration**: `phase26_shipping_auto_transitions.sql` (triggers).

---

### Feature C — Stripe Connect Live Payments (finish)
Scaffolded in Phase 21. Needs end-to-end testing.

**What exists**: `/api/stripe/connect/onboard`, `/api/stripe/connect/payment-intent`, webhooks (`account.updated`, `payment_intent.succeeded`), Settings toggle (`live_payments_enabled`, `stripe_connect_account_id`, `stripe_connect_onboarded`). Public customer invoice view should be able to pay via Stripe.

**What needs doing**:
1. Verify `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are set in Vercel (they are)
2. As Steve, go through Settings → Integrations → Stripe Connect → "Connect Stripe account" → complete onboarding flow on live Stripe
3. Create a test invoice, open public view at `/i/[token]`, pay with a real card
4. Verify webhook fires and invoice `status` transitions to `paid` with `amount_paid` populated
5. Test failure paths: card declined, 3DS challenge, partial refund
6. Audit UI: does the "Pay Now" button appear only when `live_payments_enabled = true` AND `stripe_connect_onboarded = true`?

**Likely bugs to find**: webhook signature verification, connected account ID not being passed to PaymentIntent creation, customer invoice view not detecting whether live payments are available.

**Scope**: 1 session (1-2 hours). Mostly testing + bug fixing, minimal new code.

---

### Feature D — QuickBooks Online Direct API Sync
Replaces manual IIF export with real-time bi-directional sync.

**Prerequisites (Steve does first)**:
- Create QuickBooks Developer account at https://developer.intuit.com
- Create a new app, get `CLIENT_ID` and `CLIENT_SECRET`
- Add Vercel env vars: `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`

**D1 — OAuth + company connection** (1 session):
- `/api/qbo/connect` — kicks off OAuth 2.0 authorization code flow
- `/api/qbo/callback` — handles redirect, stores access_token, refresh_token, realm_id per company
- DB: add `qbo_access_token`, `qbo_refresh_token`, `qbo_realm_id`, `qbo_expires_at`, `qbo_connected_at` to `companies` table (migration)
- Settings page: "Connect QuickBooks" button in Integrations tab, status indicator when connected, disconnect button
- Token refresh helper in `lib/qbo.ts` with automatic refresh on 401

**D2 — Invoice + payment sync** (1 session):
- Map ZeroRemake `invoices` → QBO `Invoice` entity (line items, customer, tax)
- Map ZeroRemake `customers` → QBO `Customer` entity
- Map ZeroRemake `payments` → QBO `Payment` entity (apply to invoice)
- One-way only initially (avoid conflict hell)
- New `qbo_sync_log` table — every sync attempt, success/failure, QBO entity ID
- Sync triggers: immediately on invoice create/update/delete, payment record; retry queue for failures

**D3 — Bi-directional + expense + payroll** (1 session):
- Pull QBO invoices created outside ZeroRemake back in (cron every 4 hrs)
- Push `pay_entries` → QBO `JournalEntry` or `Bill` (for contractors)
- Push vendor bills (material orders from Phase 14) → QBO `Bill`
- Conflict resolution: "last edited wins" with user-facing conflict badge

**Libraries**: `intuit-oauth`, `node-quickbooks`. **DO NOT** start D2 until D1 is fully tested with a real QBO account, otherwise half-formed sync logic pollutes real data.

---

### Feature E — UX Improvements Pack (~0.5 session)
Small-but-high-impact polish pulled from user feedback.

**E1 — In-app back/forward navigation**: when ZeroRemake is installed as a PWA, no browser chrome means no back button. Add a persistent back arrow in the top-left of `NavBar` that uses `router.back()`. Hide on top-level pages. Optional: breadcrumb trail on deep pages.

**E2 — Warehouse "Set Location" one-tap fix**: `/warehouse` requires picking location from dropdown THEN clicking Set Location (two taps for one action). Remove the button — auto-save on dropdown change via existing `updateLocation(materialId, location)`. Show a brief toast.

**E3 — Stage-for-Install confirmation**: "Stage for Install" flips silently today; easy to misclick. Wrap in a confirm() modal. Optional: 10s undo toast that reverts `status` and clears `staged_at`.

**E4 — Empty location label**: change dropdown placeholder from "No location" to "— Select a location —" and make the selected value visible inline after pick.

---

## What's Built — Top-Level Tour

### Dashboard (`/`)
Rearrangeable widgets (10 components — Quick Actions, KPI Strip, Revenue Chart, Today's Focus, Sales Pipeline, Operations, Work Queue, Ready to Install, Today's Appointments, Tasks Due). Role-based defaults, drag reorder, cookie persistence. Customers tab with heat score + lead status badges + assignee badges.

### Customer Detail (`/customers/[id]`)
Next-action card, 10-stage lead pipeline, smart follow-ups, assigned-to dropdown, heat score (Hot/Warm/Cold), stuck-lead warning, speed-to-lead timer, multi-phone (`customer_phones`), SMS/Email composers (stage-aware), activity log (Call/Text/Email/Note/Visit + voice-to-text), tasks, measure jobs, all fields inline-editable with auto-save on blur.

### Measure Job (`/measure-jobs/[id]`)
Measure mode: rooms, windows, photos, fraction validation (1/16"), CSV/print/copy. Install mode: per-window status (Pending/Done/Issue), issue presets, photo per issue, progress bar.

### Quote Detail (`/quotes/[id]`)
Materials & Orders with package-level tracking + order PDF upload. **Generate PO** (print-ready). **Storage location tracking** (per-package + per-material). **Batch check-in**. **Stage for Install** with timestamps. **Job Materials Checklist** cross-references measured → sold → ordered → received.

### Payroll (`/payroll`)
Three tabs (Pay Entries / Pay Rates / Payroll Runs). Auto-pay (commission on quote approval, contractor on install completion). Export dropdown: CSV, QuickBooks IIF, Payroll Summary. Supports hourly, per-job, per-window, salary, commission-only, contractor, hybrid.

### Builder Portal
Internal (`/builders`) + public no-auth (`/b/[token]`).

### Analytics (`/analytics`)
Operations, CRM, Revenue Forecast, Close Rate by Lead Source, Installer Performance, Measurement Accuracy. **Job Costing** (per-job profitability, visual cost breakdown, margin %, CSV export).

### Payments (`/payments` + `/invoices/[id]` + `/i/[token]`)
Invoice generation from approved quotes, payment recording, public customer view. Export: CSV, QuickBooks IIF, A/R Aging.

### Field features
Web Push stack (inert until VAPID keys + migration applied). `/reviews` Google review request (DB-first with localStorage fallback). `/measure-jobs/new` blank-measure quick-start. Contract Installer role tuned. Canvas (territories + GPS visit log + sweep mode + SMS share).

### Marketing site
zeroremake.com on Vercel. `/audit` lead capture — three storage paths (audit unlock, blocked-scan manual review, /walkthrough request) all into `audit_requests` with tags. Owner alerts via Resend. Google Search Console verified, sitemap submitted (4 URLs). Bing Webmaster Tools verified via GSC import. Facebook Page linked + sameAs JSON-LD.

### Other
Manufacturer specs library (`/manufacturers` — 18 products, 5 brands), automation engine, Twilio SMS (`/api/sms` + `useSMS()` hook), Stripe Connect scaffold, feedback widget (floating chat bubble), Stripe SaaS billing, business-type presets (6 archetypes), Focus Mode dashboard filtering, Setup Guide (`/setup-guide`).

---

## Database Schema (Supabase)

### Core tables
`customers`, `measure_jobs`, `rooms`, `windows`, `window_photos`, `install_issues`, `activity_log`, `tasks`, `customer_phones`, `product_catalog`, `quote_materials`, `material_packages`, `email_order_inbox`, `email_log`, `install_checklist_items`, `install_checklist_completions`, `invoices`, `invoice_line_items`, `payments`, `automation_rules`, `automation_log`, `automation_queue`, `builder_contacts`, `builder_projects`, `builder_project_quotes`, `builder_messages`, `pay_rates`, `pay_entries`, `payroll_runs`, `manufacturer_specs`, `company_manufacturers`, `app_feedback`.

### Auth & billing tables
- `companies`: plan, features, brand_*, trial_ends_at, stripe_customer_id, stripe_subscription_id, subscription_status, current_period_end, sms_enabled, live_payments_enabled, twilio_*, stripe_connect_*, business_type, hidden_nav
- `profiles`: id (= auth.users.id), company_id, full_name, role, permissions JSONB, status (active/pending)
- `company_settings`: invoice_prefix, next_invoice_number, default_payment_terms_days, etc.
- `user_sessions`: device session tracking (user_id, device_id, device_label, last_active)
- `trial_cards`: card fingerprint tracking for trial abuse prevention
- `pending_approvals`: tracks over-limit signup approval requests
- `audit_requests`: lead capture from `/audit`, `/api/audit/manual-review`, `/api/walkthrough/request` (filtered by `error` tag)

---

## Key Behaviors / Gotchas
- Address stored as `street|city|state|zip` pipe-separated
- `company_id` auto-set by trigger on INSERT, enforced by RLS
- Light mode enforced via `html:root` + `color-scheme: light` + `!important`
- Build script: `rm -rf .next/cache && next build`
- `pay_rates` schema: single `rate` field + `commission_pct` (NOT separate hourly_rate / per_job_rate columns)
- `pay_entries`: `work_date` (not entry_date), `description` (not customer_name), `sale_amount` (not commission_base)
- `pay_entries.entry_type` CHECK: `hours`, `job`, `commission`, `bonus`, `deduction` (no `salary` or `windows`) — salary entries should use `bonus`
- Test users live in auth.users + profiles but can't actually log in via signup flow (created via SQL)
- **`thriftflow/` subfolder belongs to another Cowork session — DO NOT TOUCH**
- Audit tool uses STATIC hand-written text (no LLM in the loop) — text lives in `lib/audit/checks.ts`
- Two-Cowork-session conflict: when work happens in parallel chats, they'll both push to `main`. Pull before pushing if there's any chance the other session has been active.

---

## Architecture Decisions
- All pages are `"use client"` components — no server components yet
- Supabase client-side (anon key) with RLS enforced
- Feature flags: `features` JSONB on `companies` table
- FeatureGate + PermissionGate double layer
- Postmark for email order inbound (one account, per-company unique inbound email)
- Resend for transactional outbound email

---

## Deployment
- Stack: Next.js 16 App Router + TypeScript + Supabase + Vercel + Tailwind CSS 4
- **Vercel CLI deploy**: `cd ~/shadelogic && npx vercel --prod`
- **GitHub auto-deploy**: connected ✓ (wiezski/shadelogic, webhook fixed Phase 7.5)
- Git remote: `https://github.com/wiezski/shadelogic.git`
- Local project path: `~/shadelogic`
- Cron: daily at 8am UTC (Hobby plan limit)
- Stripe live keys + 4 price IDs + webhook secret all in Vercel env (Apr 30 session)

---

## Backlog (not yet scheduled)
- Manufacturer API integrations (EDI / direct catalog feeds)
- Direct QuickBooks Online API integration (OAuth + real-time sync) — see Feature D
- React Native mobile app + offline mode
- Google/Apple Calendar two-way sync (currently one-way .ics export)
- AI features: auto-quote from photos, product suggestions, close probability
