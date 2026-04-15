# ShadeLogic — Session Handoff

## How to Resume
Start new session with: "continuing ShadeLogic — https://github.com/wiezski/shadelogic"
Read this file + MASTER-SPEC.md + MVP-BUILD-PLAN.md before touching any code.

---

## Current Build Status

### Phase 1 — Complete ✓
Measure & Install workflow fully built and deployed.

### Phase 2 (CRM Section 1) — Complete ✓
Full CRM foundation built. See details below.

### Phase 3 — Scheduling (next)
See MASTER-SPEC.md and the spec Steve shared for Section 2 detail.

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

### Analytics (`/analytics`)
- **Operations section**: 5 category stats, install completion %, issues drill-down (tap to see jobs), by measurer table, recent jobs
- **CRM section**: lead pipeline funnel with % bars + close rate, heat score counts, stuck leads count, outreach activity by type (date range aware)
- Date range filter: 7 days / 30 days / All time
- Architecture: sections gated by feature flags when multi-tenancy ships

---

## Database Schema (Supabase)

### Existing tables
- `customers`: id, first_name, last_name, address (pipe-separated: `street|city|state|zip`), phone (legacy), email, lead_status, heat_score, lead_source, last_activity_at, preferred_contact, next_action, company_id, created_at
- `measure_jobs`: id, title, customer_id, scheduled_at, measured_by, overall_notes, tallest_window, install_mode, install_scheduled_at, company_id
- `rooms`: id, measure_job_id, name, room_notes, sort_order, company_id
- `windows`: id, room_id, sort_order, product, lift_system, width, height, mount_type, casing_depth, control_side, hold_downs, metal_or_concrete, over_10_ft, takedown, notes, install_status, company_id
- `window_photos`: id, window_id, file_path, caption, company_id
- `install_issues`: id, window_id, issue_type, notes, photo_path, created_at, company_id
- `activity_log`: id, customer_id, type, notes, created_by, created_at, company_id
- `tasks`: id, customer_id, title, due_date, completed, completed_at, created_by, created_at, company_id
- `customer_phones`: id, customer_id, phone, label, is_primary, created_at, company_id

### Storage
- Bucket: `window-photos`

### SQL migrations run
- `supabase/phase2_crm.sql` — activity_log, tasks, CRM columns on customers, company_id stubs
- `supabase/phase2_crm_v2.sql` — customer_phones table, preferred_contact + next_action on customers

---

## Key Behaviors / Gotchas
- Address stored as `street|city|state|zip` pipe-separated, parsed on display
- Fractions validated to 1/16" increments — invalid values cleared + field refocused
- `company_id` is nullable on all tables — for future multi-tenancy, no current enforcement
- Smart Invert CSS fix in `globals.css` (inverted-colors media query)
- Measure jobs start measure-only; "Start Install" unlocks install mode
- Voice-to-text uses browser Speech API — works on mobile Chrome/Safari, uses `any` cast to avoid TS issues

---

## Architecture Decisions
- All pages are `"use client"` components — no server components yet
- Supabase client-side only (anon key) — RLS not enforced yet
- Multi-tenancy: `company_id` stubbed everywhere, feature flags (`features` JSONB) planned on `companies` table
- Analytics page: sectioned (Operations / CRM / Scheduling / Quoting), sections appear as modules are subscribed to
- Outreach (call/text/email) is Level 1 only (user-initiated, opens native apps) — Level 2 automated (Twilio/Resend) planned for Phase 3

---

## Deployment
- Stack: Next.js 16 App Router + TypeScript + Supabase + Vercel + Tailwind CSS 4
- Push to GitHub → Vercel auto-deploys
- Git auth: token stored in remote URL (already configured)
- To push: `cd ~/shadelogic && git push`
- **AGENTS.md warning**: read `node_modules/next/dist/docs/` before writing any new Next.js code

---

## Backlog (not yet scheduled)
- Multi-tenancy + auth (Supabase Auth, login page, RLS policies, company onboarding)
- Feature flags UI (admin toggle per company for CRM, Scheduling, Quoting)
- Personal branding per company (logo, colors, name)
- Automated SMS (Twilio ~$0.01/msg) — fits naturally in Phase 3 Scheduling
- Automated email (Resend, free tier) — appointment confirmations, reminders
- Pricing intelligence: scrape Blinds.com, SelectBlinds for retail price anchors
- Product/spec scraping from manufacturer sites → populate product dropdowns
- Lead assignment (assigned_to field, filter work queue by user)
- Follow-up sequences (auto-prepare next outreach, user approve/edit/send)
