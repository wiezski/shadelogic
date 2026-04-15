# ShadeLogic — Session Handoff

## How to Resume
Start new session with: "continuing ShadeLogic" + https://github.com/wiezski/shadelogic
Read: MASTER-SPEC.md (full product vision), MVP-BUILD-PLAN.md (phased build plan)

---

## What's Built (current state of the app)

### Pages
- `/` — Dashboard with 5 clickable stat cards (Measures to Schedule, Measures Done, Installs to Schedule, Installs Scheduled, Open Issues). Each card opens a filtered job list. Overdue + idle flags. Customers tab with add form.
- `/customers/[id]` — Customer detail page. All fields inline-editable (name, split address, phone, email). Auto-saves on blur. Lists measure jobs with create new job button.
- `/measure-jobs/[id]` — Main workhorse page. Two modes toggled at top:
  - **Measure mode**: rooms + windows, all measurement fields, photos, validation, CSV/print/copy summary
  - **Install mode**: unlocked by "Start Install" button. Per-window status (Pending/Done/Issue), issue presets, notes + photo per issue, progress bar
- `/analytics` — Measure vs install job counts, install completion %, issue drill-down (tap issue type → see jobs/rooms/windows/notes), by measurer table, 7-day/30-day/all-time filter

### Database tables (Supabase)
- `customers`: id, first_name, last_name, address (pipe-separated: street|city|state|zip), phone, email
- `measure_jobs`: id, title, customer_id, scheduled_at, measured_by, overall_notes, tallest_window, install_mode (bool), install_scheduled_at
- `rooms`: id, measure_job_id, name, room_notes, sort_order
- `windows`: id, room_id, sort_order, product, lift_system, width, height, mount_type, casing_depth, control_side, hold_downs, metal_or_concrete, over_10_ft, takedown, notes, install_status
- `window_photos`: id, window_id, file_path, caption
- `install_issues`: id, window_id, issue_type, notes, photo_path, created_at
- Storage bucket: `window-photos`

### Key behaviors
- Address stored as `street|city|state|zip` pipe-separated, parsed on display
- Fractions validated to 1/16 increments, invalid values cleared + field refocused
- Enter key submits room name input
- Window notes collapsible on mobile
- Measure jobs start measure-only; "Start Install" button activates install mode (saved to DB)
- Measurement edits NOT yet tracked (future feature)

---

## What's Next (Phase 1 remaining, then Phase 2)

### Still to finish (Phase 1)
- SESSION-HANDOFF.md wasn't committed yet — do that first
- Analytics page had a TypeScript issue with customer_id on JobStat type — may need a clean check

### Phase 2 — CRM Foundation (next major build)
1. Lead pipeline status on customers (New → Contacted → Scheduled → Measured → Quoted → Sold → Installed → Lost)
2. Activity log (timestamped notes, call log, text log)
3. Tasks + follow-ups (due dates, reminders, "next action required")
4. Heat score (Hot/Warm/Cold)
5. Stuck lead detection (no activity in X days)
6. Multiple phone numbers per contact

### Phase 3 — Scheduling
Calendar, appointment types, forced outcome, "on my way" button, reminders

### Phase 4 — Quoting
Room/window quote builder from measurements, pricing engine, PDF, e-signature

---

## Important Context
- Owner: Steve (wiezski@gmail.com), window treatment industry veteran
- Stack: Next.js App Router + TypeScript + Supabase + Vercel + Tailwind
- Deployment: push to GitHub → Vercel auto-deploys
- Git auth: token stored in remote URL (already configured)
- To push: cd ~/shadelogic && git push
- AGENTS.md in repo warns: read node_modules/next/dist/docs/ before writing Next.js code
