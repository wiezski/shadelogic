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

### Phase 14 — Product Catalog + Order/Package Tracking — Complete ✓ (NEW)
Enhanced product catalog with manufacturer fields, CSV import, order PDF upload, package-level tracking. See details below.

### Phase 15 — Permission Guards + Client Setup Guide — Complete ✓
Page-level permission enforcement on all protected routes. Client-facing getting-started guide with step-by-step instructions.

### Phase 5 — Multi-User Auth + Multi-Tenancy + Feature Flags — Complete ✓
Full auth system with Supabase Auth, RLS on all 19 tables, auto-set company_id triggers, subscription plans (trial/basic/pro/enterprise), feature flags with per-company overrides, FeatureGate component. See details below.

### Phase 6 — Full Install Management — Complete ✓
Quote→Install conversion, installer checklist system, materials packing list, customer sign-off with signature, enhanced completion flow. See details below.

### Phase 7 — Rebrand to ZeroRemake + White-Label — Complete ✓ (NEW)
Full rebrand from ShadeLogic to ZeroRemake. Dark theme with orange primary (#e63000), Figtree font, SVG logo component. White-label infrastructure: per-tenant branding via CSS custom properties, runtime injection from companies table, Settings UI for brand customization. See details below.

### Next Up
- Run `supabase/phase6_install_management.sql` in Supabase SQL editor
- Run `supabase/phase7_whitelabel.sql` in Supabase SQL editor
- Go to Settings → Install Checklist → "Load Default Checklist" to seed your checklist items
- `npm install pdf-parse` (required for server-side PDF parsing of order confirmations)
- Create `order-documents` storage bucket in Supabase
- Set up Postmark inbound email when ready to go live with email tracking

---

## What's Built

### Dashboard (`/`)
- 5 stat cards (Measures to Schedule, Measures Done, Installs to Schedule, Installs Scheduled, Open Issues) — each clickable, opens filtered job list with overdue/idle flags
- **Work Queue** — auto-prioritized list of customers needing action:
  - Priority 1 "Now": overdue tasks, Hot leads stuck 5+ days
  - Priority 2 "Today": new leads never contacted, quoted leads 3+ days no follow-up
  - Priority 3 "Soon": warm/cold leads past stuck threshold (14/30 days)
  - Each item shows reason, heat badge, stage badge, next action if set
- **Tasks Due** widget — overdue + due-today tasks across all customers
- Customers tab — list with heat score + lead status badges, add customer form

### Customer Detail (`/customers/[id]`)
- **Next Action Required** — amber card at top, shows in work queue
- **Lead pipeline** — 10 stages: New → Contacted → Scheduled → Measured → Quoted → Sold → Installed → Lost → On Hold → Waiting. One-tap changes, color coded
- **Heat score** — Hot / Warm / Cold toggle
- **Stuck lead warning** — appears in header when no activity past threshold (5/14/30 days by heat score). Excludes Installed + Lost
- **Speed-to-lead timer** — shows in header how quickly first contact happened after lead was created (green <1h, amber <24h, red longer)
- **Multi-phone system** — unlimited phones per customer via `customer_phones` table:
  - Label selector: Mobile, Home, Work, Spouse, Builder, Designer
  - Primary indicator (blue dot)
  - Call button (auto-logs Call activity, opens tel: link)
  - Text button (opens inline SMS composer, logs as Text activity)
  - Auto-migrates legacy `phone` field on first load
- **Preferred contact method** — free-text field (e.g. "Text only", "Call evenings", "Contact spouse first")
- **Email** with inline composer
- **Outreach composers** (SMS + Email):
  - Stage-aware presets for all 10 stages, fully editable/customizable
  - Logs activity automatically on send
  - Updates last_activity_at
- **Activity log** — Call, Text, Email, Note, Visit. Timestamped, deletable
  - **Voice-to-text** mic button on notes textarea (uses browser Speech API)
- **Tasks** — add with due date, check off, delete. Overdue = red, today = amber, completed collapse
- **Measure Jobs** — list with mode badge, create new job button
- All fields inline-editable, auto-save on blur

### Measure Job (`/measure-jobs/[id]`)
- Measure mode: rooms, windows, all measurement fields, photo upload, fraction validation (1/16"), CSV export, print/copy summary
- Install mode: per-window status (Pending/Done/Issue), issue presets, photo per issue, progress bar

### Product Catalog (`/products`) — ENHANCED
- Full CRUD for products with manufacturer fields: name, category, manufacturer, SKU, cost, multiplier, size limits (min/max width/height), lead time, color options
- **CSV Import**: upload manufacturer price sheets, auto-maps column names, preview before import, downloadable template
- Search + filter by category or text (name, manufacturer, SKU)
- Stats bar showing product count, manufacturer count
- Live margin preview on add/edit
- Expandable specs section (size limits, lead time, colors)
- Import source badge (CSV, manual)
- Archive/restore functionality

### Quote Detail (`/quotes/[id]`) — ENHANCED
- **Materials & Orders section** (appears when quote is approved):
  - Add materials manually with description, vendor, order #, expected package count
  - Generate materials from quote lines (one click)
  - **Order PDF upload**: upload manufacturer order confirmation PDF per material
    - Auto-extracts: order number, vendor, expected packages, ETA
    - Stores PDF in Supabase storage + extracted text for email matching
  - **Package-level tracking**:
    - Set expected package count per material
    - Visual progress bar: "4/12 pkgs" with colored fill
    - Expand any material to see individual packages
    - Check in packages one by one (green checkmark)
    - Undo check-in if needed
    - Add packages manually with optional tracking # and description
    - Auto-creates package slots when expected count is set
  - Status dropdown per material (Not Ordered → Ordered → Shipped → Received → Staged)
  - "All materials received" green banner triggers ready-to-install flow
  - ETA display from email or PDF

### Permission Guards (NEW)
- `PermissionGate` component wraps every protected page
- If user doesn't have the required permission, shows "Access Restricted" screen with back link
- Owner role always has full access regardless of individual permissions
- Supports single permission or array (any match grants access)
- Pages guarded: analytics (view_reports), payments (view_financials), products (access_settings), settings (access_settings), schedule (manage_schedule OR complete_installs), customers (view_customers), quotes (create_quotes OR view_pricing), measure-jobs (view_customers)
- Nav bar continues to hide links without permission (defense in depth)

### Setup Guide (`/setup-guide`) (NEW)
- Step-by-step getting-started guide for new clients
- 8 steps: Add Products, First Customer, Measure Job, Build Quote, Schedule, Order Tracking (email forwarding), Invite Team, Company Settings
- Each step expandable with detailed instructions
- Checkable progress tracking with visual progress bar
- Email forwarding instructions for Gmail and Outlook with company's unique email token
- Role quick-reference table
- FAQ section with 5 common questions
- Visible in nav for users with access_settings or manage_team permission
- Celebration screen when all steps marked done

### Auth + Multi-Tenancy (NEW)
- **Supabase Auth**: login/signup pages, email+password, session management
- **Profiles table**: id (= auth uid), company_id, full_name, role, permissions JSONB
- **Companies table**: name, plan (trial/basic/pro/enterprise), features JSONB, trial_ends_at
- **RLS on all 19 tables**: every table has SELECT/INSERT/UPDATE/DELETE policies filtered by company_id
- **Auto-set company_id trigger**: `auto_set_company_id()` function runs BEFORE INSERT on every business table — front-end INSERTs don't need to pass company_id
- **Helper functions**: `get_my_company_id()` (used in all RLS policies), `user_has_role()`
- **Anonymous access**: public quote approval page (/q/[id]) and intake form (/intake) work without auth
- **Team management**: invite via link (?company=id), role selector, per-user permission toggles in settings
- **Feature flags**: 7 features (crm, scheduling, quoting, inventory, analytics, builder_portal, automation)
- **Plan-based feature gating**: trial (all features 14 days), basic (measure+scheduling), pro (full), enterprise (everything)
- **FeatureGate component**: wraps pages, shows "Feature Not Available" with plan info when disabled
- **Plan management UI**: in Settings page — plan selector, trial countdown, feature toggle overrides for owners
- **Nav bar**: hides links based on BOTH feature flags AND permissions (defense in depth)
- **Pages with FeatureGate**: analytics (analytics), schedule (scheduling), products (inventory), payments (quoting)

### Full Install Management (NEW)
- **Quote→Install conversion**: button on approved quotes creates install job with all windows from line items, stamps checklist
- **Install checklist system**:
  - Company-defined checklist items (Settings → Install Checklist)
  - Default template with 10 items (load with one click)
  - Required/optional per item
  - Stamped onto each install job at creation
  - Installer checks off items as they go
  - Required items must be completed before marking job done
- **Materials packing list**:
  - Auto-loaded from quote materials when install job has a quote_id
  - Shows each material with status badge, vendor, package counts
  - "Confirm Materials Loaded" button before heading to job
- **Customer sign-off**:
  - Signature canvas (touch + mouse support) with customer name
  - Captures signature as base64 data URL
  - Stores signed_off_at timestamp and signed_off_name
  - Two completion paths: "Complete with Sign-Off" and "Complete (No Sign-Off)"
  - Sign-off auto-updates customer status to Installed
- **Enhanced completion flow**:
  - Checks all required checklist items before allowing completion
  - "Needs Rework" creates tasks for each issue window
  - Post-completion: review request text, follow-up text, view customer link
- **Settings → Install Checklist**: owner can add/remove items, toggle required, load defaults
- **Nav bar**: hides links based on BOTH feature flags AND permissions (defense in depth)
- **Pages with FeatureGate**: analytics (analytics), schedule (scheduling), products (inventory), payments (quoting)

### ZeroRemake Rebrand + White-Label (NEW)
- **Full rebrand**: all references to "ShadeLogic" replaced with "ZeroRemake" across entire codebase
- **Design system**: dark theme (#0c0c0c bg), orange primary (#e63000), Figtree font, DM Mono for labels
- **CSS variables**: complete variable system (--zr-*) in globals.css — colors, surfaces, typography, spacing, radius, shadows
- **SVG logo component**: `ZRLogo` component at 3 sizes (sm/md/lg) with "Z" mark + wordmark
- **Login/signup pages**: rebranded with dark theme, ZeroRemake logo, orange CTA buttons
- **Nav bar**: uses ZRLogo, dark theme surfaces, --zr-* colors
- **White-label infrastructure**:
  - Companies table: brand_slug, brand_primary_color, brand_primary_hover, brand_dark_color, brand_font, brand_logo_url, brand_logo_mark
  - Auth-provider: loads branding on login, injects `data-tenant` attribute + --tenant-* CSS vars on `<html>`
  - CSS: `[data-tenant]` rule in globals.css picks up --tenant-* vars and overrides --zr-* defaults
  - Custom Google Font loading at runtime
  - ZRLogo: auto-swaps to tenant logo image when brand_logo_url is set
  - Settings → Branding: owner can set slug, colors (with color picker), font, logo URL, logo mark
  - Preview swatch in settings shows color on dark background
  - Default: no branding = ZeroRemake orange/dark theme
- **SQL migration**: `supabase/phase7_whitelabel.sql` adds branding columns to companies table

### Analytics (`/analytics`)
- **Operations section**: 5 category stats, install completion %, issues drill-down (tap to see jobs), by measurer table, recent jobs
- **CRM section**: lead pipeline funnel with % bars + close rate, heat score counts, stuck leads count, outreach activity by type (date range aware)
- Date range filter: 7 days / 30 days / All time
- Architecture: sections gated by feature flags

### Email Order Tracking (`/api/email-inbound`) — ENHANCED
- Postmark inbound webhook receives forwarded emails from manufacturers
- **Enhanced parsing**: extracts order numbers, multiple tracking numbers, package counts ("package 2 of 5"), ETA
- **Package-level auto-updates**: each tracking number matched/created as individual package
  - Assigns tracking to pending packages without tracking numbers
  - Creates new packages if no pending slots available
  - Auto-marks packages as received when delivery detected
  - Recounts received packages and updates material status
- Matches against order_number, description, AND order_pdf_text (from uploaded PDF)
- Activity log entries with package info
- Unmatched emails stored in `email_order_inbox` for manual review

### Order PDF Parser (`/api/parse-order-pdf`)
- Server-side PDF text extraction (requires `pdf-parse` npm package)
- Extracts: order number, expected package count, ETA, vendor (knows window treatment manufacturers), line items
- Falls back gracefully if pdf-parse not installed
- Used by Materials tab PDF upload feature

---

## Database Schema (Supabase)

### Existing tables
- `customers`: id, first_name, last_name, address (pipe-separated: `street|city|state|zip`), phone (legacy), email, lead_status, heat_score, lead_source, last_activity_at, preferred_contact, next_action, company_id, created_at
- `measure_jobs`: id, title, customer_id, scheduled_at, measured_by, overall_notes, tallest_window, install_mode, install_scheduled_at, **quote_id, customer_signature, signed_off_at, signed_off_name, installed_by, install_started_at, install_completed_at, install_status, materials_confirmed, materials_confirmed_at, materials_confirmed_by**, company_id
- `rooms`: id, measure_job_id, name, room_notes, sort_order, company_id
- `windows`: id, room_id, sort_order, product, lift_system, width, height, mount_type, casing_depth, control_side, hold_downs, metal_or_concrete, over_10_ft, takedown, notes, install_status, company_id
- `window_photos`: id, window_id, file_path, caption, company_id
- `install_issues`: id, window_id, issue_type, notes, photo_path, created_at, company_id
- `activity_log`: id, customer_id, type, notes, created_by, created_at, company_id
- `tasks`: id, customer_id, title, due_date, completed, completed_at, created_by, created_at, company_id
- `customer_phones`: id, customer_id, phone, label, is_primary, created_at, company_id
- `product_catalog`: id, name, category, default_cost, default_multiplier, notes, active, **manufacturer, sku, min_width, max_width, min_height, max_height, lead_time_days, color_options, imported_from**, company_id
- `quote_materials`: id, quote_id, description, status, vendor, order_number, tracking_number, ordered_at, shipped_at, received_at, notes, auto_updated, last_email_at, last_email_subject, **expected_packages, received_packages, order_pdf_path, order_pdf_text, eta**, company_id
- `material_packages` (NEW): id, material_id, tracking_number, status (pending/shipped/received), description, received_at, received_by, notes, company_id
- `email_order_inbox`: id, company_id, from_email, subject, order_number, tracking_number, detected_status, email_body, reviewed, matched_material
- `install_checklist_items` (NEW): id, company_id, label, sort_order, required, locked, active, created_at
- `install_checklist_completions` (NEW): id, job_id, checklist_item_id, label, required, completed, completed_at, completed_by, sort_order, company_id

### Storage
- Bucket: `window-photos` (also stores order PDFs at `orders/{quoteId}/{materialId}/`)
- Future: dedicated `order-documents` bucket

### Auth tables (NEW)
- `companies`: id, name, **plan** (trial/basic/pro/enterprise), **features** (JSONB), **trial_ends_at**, created_at
- `profiles`: id (= auth.users.id), company_id, full_name, role, **permissions** (JSONB), **email**, **invited_by**, created_at
- `company_settings`: id, name, phone, email, address, city, state, zip, website, license_number, tagline, google_review_link, default_deposit_pct, default_markup, default_quote_days, notify_on_shipped, notify_on_delivered, notify_channel, **company_id** (FK to companies)

### SQL migrations run
- `supabase/phase2_crm.sql` — activity_log, tasks, CRM columns on customers, company_id stubs
- `supabase/phase2_crm_v2.sql` — customer_phones table, preferred_contact + next_action on customers
- `supabase/phase14_product_orders.sql` — manufacturer fields on product_catalog, package tracking fields on quote_materials, material_packages table (PENDING — needs to be run)
- `supabase/phase5_auth_multitenancy.sql` — companies enhancements (plan, features, trial_ends_at), profiles enhancements (email, invited_by), company_settings company_id FK, RLS on all 19 tables, auto_set_company_id trigger, get_my_company_id() helper, anonymous access policies, performance indexes ✓
- `supabase/phase6_install_management.sql` — install_checklist_items + install_checklist_completions tables, measure_jobs enhancements (quote_id, signature, install status, materials confirmation), quotes install_job_id back-link, RLS + triggers + indexes **(PENDING — needs to be run)**
- `supabase/phase7_whitelabel.sql` — branding columns on companies table (brand_slug, brand_primary_color, brand_primary_hover, brand_dark_color, brand_font, brand_logo_url, brand_logo_mark) **(PENDING — needs to be run)**

---

## Key Behaviors / Gotchas
- Address stored as `street|city|state|zip` pipe-separated, parsed on display
- Fractions validated to 1/16" increments — invalid values cleared + field refocused
- `company_id` on all tables — auto-set by database trigger on INSERT, enforced by RLS on SELECT/UPDATE/DELETE
- After running phase5 SQL, must backfill existing data with correct company_id (see SQL file comments)
- RLS uses `get_my_company_id()` SECURITY DEFINER function — looks up company_id from profiles via auth.uid()
- Feature flags resolved from plan defaults + per-company overrides in `features` JSONB
- Smart Invert CSS fix in `globals.css` (inverted-colors media query)
- Measure jobs start measure-only; "Start Install" unlocks install mode
- Voice-to-text uses browser Speech API — works on mobile Chrome/Safari, uses `any` cast to avoid TS issues
- PDF parsing requires `pdf-parse` npm package — route gracefully fails without it
- Email webhook now extracts MULTIPLE tracking numbers per email and handles package-level tracking
- Package check-in: when all packages for a material are received, material auto-updates to "received" status

---

## Architecture Decisions
- All pages are `"use client"` components — no server components yet
- Supabase client-side (anon key) with RLS enforced — all data access filtered by company_id automatically
- Multi-tenancy: RLS + auto_set_company_id trigger handles isolation; front-end doesn't need to pass company_id on inserts
- Feature flags: `features` JSONB on `companies` table, resolved via plan defaults + overrides, exposed via AuthContext
- Subscription plans: trial (14 days, all features) → basic → pro → enterprise — managed in Settings page
- FeatureGate component wraps pages; PermissionGate wraps within that (double layer: feature + permission)
- Analytics page: sectioned (Operations / CRM / Scheduling / Quoting), sections appear as modules are subscribed to
- Outreach (call/text/email) is Level 1 only (user-initiated, opens native apps) — Level 2 automated (Twilio/Resend) planned
- Postmark: one account owned by ZeroRemake, each client company gets unique inbound email address (token from company_id)
- CSV import uses browser-native FileReader — no additional npm package needed
- Product catalog CSV column mapping is flexible — handles common naming variations

---

## Deployment
- Stack: Next.js 16 App Router + TypeScript + Supabase + Vercel + Tailwind CSS 4
- Push to GitHub → Vercel auto-deploys
- Git auth: token stored in remote URL (already configured)
- To push: `cd ~/zeroremake && git push`
- **AGENTS.md warning**: read `node_modules/next/dist/docs/` before writing any new Next.js code

---

## Setup Steps for This Session's Changes
1. Run `supabase/phase6_install_management.sql` in Supabase SQL editor
2. Run `supabase/phase7_whitelabel.sql` in Supabase SQL editor
3. Go to Settings → Install Checklist → click "Load Default Checklist" to seed checklist items
4. `npm install pdf-parse` on your local machine (if not already done)
5. Push to GitHub: `cd ~/shadelogic && git add -A && git commit -m "Phase 7: ZeroRemake rebrand + white-label" && git push`

---

## Backlog (not yet scheduled)
- Automated SMS (Twilio ~$0.01/msg)
- Automated email (Resend, free tier) — appointment confirmations, reminders
- Pricing intelligence: scrape Blinds.com, SelectBlinds for retail price anchors
- Product/spec scraping from manufacturer sites → populate product dropdowns
- Lead assignment (assigned_to field, filter work queue by user)
- Follow-up sequences (auto-prepare next outreach, user approve/edit/send)
- Manufacturer API integrations (when available)
- Stripe/payment integration for actual plan billing
- Password reset flow
