# ShadeLogic — Master Product Spec

## What This Is
A modular SaaS platform for window treatment companies (sales, install, or both).
One app, features enabled per role/subscription. Built mobile-first for field use.

## Your Competitive Edge
- Prewire + motorization planning (no one else does this cleanly)
- Real-world install workflow built by someone who's done it
- Fast quoting in the home
- Builder relationships + portal
- Measurement system that prevents mistakes

## Target User
Window treatment dealers, installers, sales reps, office staff, builders/contractors.
First target: Aspen Blinds (Orem) — needs a measure system, paid $7K for a bad one.

## Business Model
Modular SaaS. Sell measure system first, expand from there.
- Tier 1: Measure + scheduling (~$29-49/user/month)
- Tier 2: + CRM + quoting
- Tier 3: + install + inventory + automation
Same app, different access per subscription.

---

## Modules (all built into one app, toggled per company)

### 1. CRM / Leads
- Pipeline: New → Contacted → Scheduled → Measured → Quoted → Sold → Installed → Lost/On Hold
- Each status triggers its own follow-up sequence
- Hybrid automation: system drafts follow-ups, user approves before sending
- User sees all pending automations (not silent)
- Multiple phone numbers per contact (mobile, spouse, builder, custom labels)
- Preferred contact method notes ("text only", "call evenings", "talk to wife first")
- One-tap call logging, voice-to-text notes
- "Next action required" field — leads with no next action get flagged
- Heat score: Hot / Warm / Cold
- Stuck lead detection (no activity in X days)
- Speed-to-lead timer
- Tags: Builder, High-end, Motorized candidate, Retrofit, New construction
- Estimated deal value per lead → pipeline total view

### 2. Scheduling / Calendar
- Appointment types: Measure, Install, Sales consult, Service, Builder walk, Punch/completion, Follow-up
- Each type has default duration, color, checklist
- Day / week / list views
- Google + Apple calendar sync
- Forced outcome after every appointment (Measured / Sold / Needs quote / Follow up / No sale / Needs second visit)
- "Needs second visit" requires: reason, what needs to happen, creates new appointment
- Customer comms: confirmation, reminder, "on my way" (manual trigger only), "running late" button
- Hybrid: auto-generate messages, user approves before sending
- Route optimization / area grouping (Provo day, SLC day, etc.)
- Duration suggestions based on job size (customizable per company, minimum enforced)
- Team scheduling: assign to installer/crew, avoid double booking
- Installer check-in/check-out
- Daily dashboard: today's jobs, route, follow-ups due, alerts

### 3. Quoting / Estimating
- Room-by-room, window-by-window quote builder
- Pulls from existing measurements (no retyping)
- Product selection per window (roller, zebra, shutters, drapery, etc.)
- Pricing engine: cost, retail, margin auto-calculated
- Motorization add-ons
- Good / Better / Best comparison options (side-by-side)
- Live selling mode: tap to switch products/options during sales conversation
- Smart warnings: "IM depth too shallow for shutter", "exceeds max width", "motorization unavailable in this size"
- PDF quote generation (clean, branded)
- Quote status: Sent / Viewed / Approved / Rejected
- E-signature approval (legally binding: name, timestamp, IP, agreement checkbox)
- Auto follow-up sequence on unsold quotes
- Manufacturer database (you manage specs/restrictions — this is your lock-in)

### 4. Measurement Tools (CORE — already partially built)
- Room → Windows structure
- Required per window: width, height, mount type (IM/OM), casing depth (if IM), product type
- Fraction validation: only standard 1/16 increments, clear on invalid entry, refocus
- Duplicate window, apply to room, templates
- Photo capture per window (multiple)
- Quick notes: "tile", "tight", "high", "handle left"
- Prewire/motorization fields per window: motorized? power source (battery/plug/hardwired) → flags for prewire
- Completion check before leaving job
- Measure → Quote flow (no retyping)
- Quote → Measure flow (auto-sync)

### 5. Install Management
- Convert measure job to install job with one button
- Installer sees: customer, address, rooms/windows, product per window, notes, photos — NO pricing
- Custom install checklist (company-defined, lockable by owner)
- Per-window status: Pending / Complete / Issue
- Issue logging: preset buttons (customizable per company) + notes + photo
- One-tap issue buttons trigger: flag job, create task, notify office, create reorder task
- Before/after photos
- Measurement edit tracking: original preserved, edits logged (who/when/what)
- Completion flow: optional customer sign-off, triggers review request + follow-up
- Install duration tracking (estimated vs actual → feeds scheduling)
- Future: AI-powered workflow buttons ("when installer taps X, do this automatically")

### 6. Inventory / Materials
- Material list auto-generated from quote
- Order status per item: Not ordered → Ordered → Shipped → Received → Staged → Ready
- Supplier tracking (vendor, order #, tracking #, expected delivery)
- Check-in system (mark items received, partial receiving, photo)
- Warehouse location per item (shelf/bin/truck/job-staged — simple, expandable later)
- "Job ready" vs "missing items" flag
- Installer packing list + "materials loaded" confirmation
- Missing item flow: one tap → flags job, creates reorder task, notifies office
- Smart order suggestions based on quote
- Low voltage materials tracking: 16/4 wire, Cat6, smart switches (your niche)
- PO system optional per company
- Future: API/email parsing for auto tracking updates from manufacturers
- Future: barcode scanning, QuickBooks sync

### 7. Builder / Contractor Portal
- Optional feature (toggle per company)
- Every person gets their own login (owner, super, office, designer)
- Project structure: Builder Company → Development/Project → Individual Homes/Lots
- Builder can: create project, upload plans, request bid (checkbox scope selection), view status, view/approve quotes, request revisions, see schedule
- Scope checkboxes: window treatments, motorization, prewire, low voltage, lighting
- Legally binding quote approval (name + timestamp + IP + agreement checkbox)
- Project communication log (keeps everything out of texts)
- Status tracker: Bid requested → Reviewing → Quoted → Approved → Scheduled → Complete
- Notifications: email (default), SMS (optional), in-app (future)
- Notifications go to relevant parties only (customer NOT notified unless chosen)
- Permissions per portal user: view pricing, approve quotes, upload plans, see schedule, request changes
- Future: plan markup, window tagging, auto low-voltage suggestions from plans

### 8. Invoicing / Payments
- Invoice from quote or job
- Deposit system (dealer sets default %, overridable per job)
- Payment methods: Stripe, Square, check, cash (all tracked)
- Manual payment logging ("Paid by check")
- Invoice types: per job OR combined (multiple builder homes → one invoice)
- Balance tracking, payment log, overdue reminders
- Future: QuickBooks sync, progress billing / draw schedules

### 9. Automation Engine
- Trigger types: lead status change, appointment outcome, quote status, job events, material events, payment events
- Actions: create task, change status, draft text/email, send notification, flag job, create reorder
- Hybrid control per rule: auto-send / approval required / reminder only
- Visibility: every automation logged, upcoming automations shown on lead/job
- Rule builder: When [event] + If [conditions] → Then [actions]
- Custom issue buttons with action chains (your Home Depot API idea)
- Prebuilt templates: quote follow-up, appointment reminders, stuck lead, missing parts
- Owner can lock rules, restrict what can auto-send
- Future: AI workflow builder ("when installer clicks X, do this" → creates rule automatically)

### 10. Analytics / Reporting
- Dashboard stats (clickable → filtered job list): Measures to Schedule, Measures Done, Installs to Schedule, Installs Scheduled, Open Issues
- Overdue flag (stuck in needs-measuring 7+ days)
- Needs attention (idle 5+ days)
- Install completion % progress bar
- Issue drill-down: tap issue type → see jobs, rooms, windows, notes
- By measurer: jobs + windows
- Revenue, close rate, avg job size, lead sources, installer productivity (later phases)
- 7-day / 30-day / all-time filters

### 11. Permissions / Roles
- Roles: Owner/Admin, Sales, Installer, Office
- Module access per company (CRM on/off, quoting on/off, etc.)
- Feature-level permissions: see pricing, edit measurements, apply discounts, access reports
- Installer: cannot see pricing, can view/edit measurements (tracked), can log issues
- Builder portal users: separate permission set

### 12. Mobile App
- Everything accessible in field
- Voice-to-text notes
- Offline mode (critical for job sites)
- One-tap navigation to next job
- Photo capture
- Fast estimate creation

### 13. Future / AI Features
- Auto-generate quotes from photos
- Suggest products based on room/windows
- Predict close probability
- Voice assistant for notes
- "What should I follow up on today?"
- AI workflow builder for automation engine

---

## Design Philosophy
- Ugly and functional beats pretty and useless — design later
- Every screen built for mobile first
- No feature should require contacting you to use
- Lock-in comes from: data gravity, manufacturer database you control, workflow templates they build
- Build flexible: database fields expandable, workflows configurable, issue buttons customizable
- Measure history always preserved (never overwrite)

## Tech Stack
- Next.js (App Router) + TypeScript
- Supabase (database + storage + auth eventually)
- Vercel (deployment)
- GitHub (source control)
- Tailwind CSS
