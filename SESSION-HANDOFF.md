# ShadeLogic — Session Handoff

## How to Resume
Start new session with: "continuing ShadeLogic" + https://github.com/wiezski/shadelogic
Read: MASTER-SPEC.md (full product vision), MVP-BUILD-PLAN.md (phased build plan)

---

## What's Built (current state of the app)

### Pages
- `/` — Dashboard with 5 clickable stat cards (Measures to Schedule, Measures Done, Installs to Schedule, Installs Scheduled, Open Issues). Each card opens a filtered job list. Overdue + idle flags. Tasks Due widget shows overdue/due-today tasks across all customers. Customers tab with add form — shows heat score + lead status badges.
- `/customers/[id]` — Full CRM customer card:
  - Lead pipeline strip (New → Contacted → Scheduled → Measured → Quoted → Sold → Installed → Lost), one-tap stage changes
  - Heat score toggle (Hot / Warm / Cold)
  - Stuck lead warning (no activity in 5/14/30 days based on heat score)
  - Tap-to-call (auto-logs Call activity), tap-to-text (inline composer, stage-aware preset, fully editable, logs as Text), tap-to-email (inline composer with subject + body, fully editable, logs as Email)
  - Activity log: log calls, texts, emails, notes, visits — timestamped, deletable
  - Tasks / follow-ups: add with optional due date, check off, delete. Overdue = red, today = amber. Completed tasks collapse.
  - Two phone fields (phone, phone2)
  - All fields inline-editable, auto-save on blur
  - last_activity_at updates automatically on every log entry
- `/measure-jobs/[id]` — Main workhorse page. Two modes toggled at top:
  - **Measure mode**: rooms + windows, all measurement fields, photos, validation, CSV/print/copy summary
  - **Install mode**: unlocked by "Start Install" button. Per-window status (Pending/Done/Issue), issue presets, notes + photo per issue, progress bar
- `/analytics` — Sectioned by module:
  - **Operations**: 5 dashboard-category stats, install completion %, issues drill-down (tap → see jobs), by measurer table, recent jobs
  - **CRM**: lead pipeline funnel with % bars, close rate, heat score breakdown, stuck leads count, outreach activity by type (Calls/Texts/Emails/Notes/Visits)

### Database tables (Supabase)
- `customers`: id, first_name, last_name, address (pipe-separated: street|city|state|zip), phone, phone2, email, lead_status, heat_score, lead_source, last_activity_at, company_id
- `measure_jobs`: id, title, customer_id, scheduled_at, measured_by, overall_notes, tallest_window, install_mode (bool), install_scheduled_at, company_id
- `rooms`: id, measure_job_id, name, room_notes, sort_order, company_id
- `windows`: id, room_id, sort_order, product, lift_system, width, height, mount_type, casing_depth, control_side, hold_downs, metal_or_concrete, over_10_ft, takedown, notes, install_status, company_id
- `window_photos`: id, window_id, file_path, caption, company_id
- `install_issues`: id, window_id, issue_type, notes, photo_path, created_at, company_id
- `activity_log`: id, customer_id, type (call/text/email/note/visit), notes, created_by, created_at, company_id
- `tasks`: id, customer_id, title, due_date, completed, completed_at, created_by, created_at, company_id
- Storage bucket: `window-photos`

### Key behaviors
- Address stored as `street|city|state|zip` pipe-separated, parsed on display
- Fractions validated to 1/16 increments, invalid values cleared + field refocused
- Enter key submits room name input
- Window notes collapsible on mobile
- Measure jobs start measure-only; "Start Install" button activates install mode (saved to DB)
- Smart Invert / inverted-colors CSS fix in globals.css
- company_id stubbed on all tables (nullable) — for future multi-tenancy

---

## What's Next

### Phase 3 — Scheduling
Calendar, appointment types, forced outcome, "on my way" button, reminders (Twilio for SMS automation)

### Phase 4 — Quoting
Room/window quote builder from measurements, pricing engine, PDF, e-signature

### Backlog (not yet scheduled)
- Multi-tenancy + auth: wire up Supabase auth (login page, sessions), enforce company_id with Row Level Security
- Feature flags: read features JSONB from companies table to show/hide modules in UI + analytics
- Personal branding per company (logo, colors, company name config table)
- Pricing intelligence: scrape retail sites (Blinds.com, SelectBlinds) for price anchors — no dealer login needed
- Product spec scraping: pull product names/specs from manufacturer sites into ShadeLogic dropdowns
- Automated SMS reminders (Twilio ~$0.01/msg) — Phase 3 natural fit
- Automated email (Resend, generous free tier)

---

## Important Context
- Owner: Steve (wiezski@gmail.com), window treatment industry veteran
- Stack: Next.js App Router + TypeScript + Supabase + Vercel + Tailwind
- Deployment: push to GitHub → Vercel auto-deploys
- Git auth: token stored in remote URL (already configured)
- To push: cd ~/shadelogic && git push
- AGENTS.md in repo warns: read node_modules/next/dist/docs/ before writing Next.js code
- Analytics page is sectioned (Operations / CRM / future: Scheduling, Quoting) — gated by features flags when multi-tenancy ships
