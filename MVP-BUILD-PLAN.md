# ZeroRemake — MVP Build Plan

---

## What's Already Built (your head start)
- Customer profiles (name, address, phone, email)
- Measure jobs with rooms + windows
- Measurement entry (width, height, mount type, casing depth, flags)
- Fraction validation
- Photos per window
- CSV export + print summary
- Basic mobile support

---

## Phase 1 — Complete the Measure Core
**Goal: Something you can demo to Aspen in 2 weeks**
**Timeline: 1–2 sessions**

### What to build:
1. **Install View** (most important right now)
   - Convert a measure job into an install checklist
   - Each window shows: product, measurements, mount type
   - Installer marks each treatment: Not Started / Complete / Issue
   - Issue presets: Wrong size, Missing part, Damaged, Obstruction, Motor issue, Wrong color, Other
   - Add notes + photo to any issue
   - Issues linked back to the original measurement
   - Job-level completion status

2. **Basic Analytics Dashboard**
   - Total measure jobs (week / month)
   - Total windows measured
   - Jobs completed vs in progress
   - Issues logged (what types, how often)
   - Per-measurer stats (jobs done, windows measured)

3. **Home Screen / Dashboard**
   - Replace current customer list as home
   - Show: recent jobs, jobs in progress, jobs needing attention
   - Quick actions: New Customer, New Measure Job

### What this gets you:
- A complete measure → install tracking loop
- Data you can show a potential customer
- The core of your sales pitch to Aspen

---

## Phase 2 — CRM Foundation
**Goal: Turn customers into a real pipeline**
**Timeline: 2–3 sessions**

### What to build:
1. **Lead Pipeline**
   - Status: New → Contacted → Scheduled → Measured → Quoted → Sold → Installed → Lost
   - Color coded, visible on customer list
   - Move customers through pipeline with one tap

2. **Activity Log**
   - Timestamped notes on every customer
   - Log a call (one tap)
   - Log a text/email
   - Everything tied to the customer timeline

3. **Tasks & Follow-ups**
   - Create tasks tied to customers
   - Due dates + reminders
   - "Next action required" field
   - Basic stuck-lead flag (no activity in X days)

4. **Heat Score**
   - Hot / Warm / Cold label on each lead
   - Manual set for now, automatic later

5. **Multiple Phone Numbers**
   - Primary, spouse, builder, custom
   - Tap to call
   - Preferred contact notes

### What this gets you:
- A real CRM replacing texts + memory
- Pipeline visibility
- Nothing falls through the cracks

---

## Phase 3 — Scheduling
**Goal: Calendar that runs your day**
**Timeline: 2 sessions**

### What to build:
1. **Appointment Calendar**
   - Day + week view
   - Appointment types: Measure, Install, Sales consult, Service, Builder walk
   - Assign to yourself or installer
   - Tap address to navigate

2. **Appointment Flow**
   - Create appointment from a customer/lead
   - Auto-fill address
   - Confirmation + reminder texts/emails (hybrid — you approve before sending)

3. **Forced Outcome**
   - After appointment: must select outcome
   - Measured / Sold on site / Needs quote / Follow up / No sale / Needs second visit
   - Outcome triggers next step automatically

4. **"On My Way" Button**
   - Manual trigger by person going to job
   - Sends pre-written text to customer

### What this gets you:
- No more scheduling from memory
- Every appointment has an outcome
- Customer communication built in

---

## Phase 4 — Quoting
**Goal: Build and send quotes from the app**
**Timeline: 3–4 sessions (your biggest feature)**

### What to build:
1. **Quote Builder**
   - Room by room, window by window
   - Pull from existing measurements (no retyping)
   - Product selection per window
   - Motorization add-on toggle

2. **Pricing Engine**
   - Cost + retail price per item
   - Margin auto-calculated
   - Deposit amount (dealer sets default %)

3. **Quote Options (Good / Better / Best)**
   - Multiple pricing tiers side by side
   - Switch products without rebuilding

4. **PDF Generation**
   - Clean customer-facing quote
   - Your branding

5. **Quote Status**
   - Sent / Viewed / Approved / Rejected
   - Follow-up automation tied to status

6. **E-Signature Approval**
   - Customer signs in portal or via link
   - Legally binding with timestamp + name

### What this gets you:
- Quotes built in the home, on the spot
- No more emailing spreadsheets
- Your biggest competitive advantage

---

## Phase 5 — Multi-User + Permissions
**Goal: Let other people use it (installers, sales reps)**
**Timeline: 2 sessions**

### What to build:
1. **User Accounts**
   - Each person logs in separately
   - Roles: Owner, Sales, Installer, Office

2. **Role-Based Permissions**
   - Installer: sees jobs, measurements, install view — NO pricing
   - Sales: CRM, quotes, scheduling — sees pricing
   - Owner: everything

3. **Company Account**
   - All users under one company
   - Owner controls settings

4. **Module Toggles**
   - Turn sections on/off per company
   - Measure only, or full platform

### What this gets you:
- Can sell to companies with teams
- Installers use it without seeing pricing
- Foundation for SaaS billing tiers

---

## Phase 6 — Install Management (Full)
**Goal: Complete install workflow**
**Timeline: 2 sessions**

### What to build:
1. **Install Job from Quote/Sale**
   - "Convert to Job" when quote approved
   - Pulls measurements + products automatically

2. **Installer Checklist**
   - Company-defined, lockable
   - Must complete before marking job done

3. **Materials / Packing List**
   - What's needed per job
   - Installer confirms "materials loaded"

4. **Completion Flow**
   - Mark job complete
   - Optional customer sign-off
   - Triggers review request + follow-up

### What this gets you:
- Zero confusion for installers
- Accountability on every job
- Clean handoff from sales to install

---

## Phase 7 — Inventory & Materials
**Goal: Track what you have and what you need**
**Timeline: 2 sessions**

### What to build:
1. **Material list per job** (auto from quote)
2. **Order tracking** (not ordered → ordered → received → staged)
3. **Check-in system** (mark items received)
4. **Warehouse location** (simple: shelf, bin, truck, job-staged)
5. **Install readiness flag** (ready vs missing items)
6. **Smart order suggestions** based on quote

---

## Phase 8 — Builder Portal
**Goal: Give builders their own login to track projects**
**Timeline: 3 sessions**

### What to build:
1. Builder/contractor login (separate from company users)
2. Project list with status
3. Bid request form + file upload
4. Quote viewing + legally binding approval
5. Project communication log
6. Notifications (email + SMS)
7. Multi-home project structure (builder → development → lot)

---

## Phase 9 — Invoicing & Payments
**Goal: Get paid inside the app**
**Timeline: 2–3 sessions**

### What to build:
1. Invoice generation from quote/job
2. Deposit system (dealer sets %)
3. Payment methods (Stripe/Square + manual: check/cash)
4. Payment tracking + balance
5. Combined invoicing for builders (multiple homes → one invoice)
6. Overdue reminders
7. QuickBooks integration (later)

---

## Phase 10 — Automation Engine
**Goal: App runs follow-ups and workflows automatically**
**Timeline: 3–4 sessions**

### What to build:
1. Status-triggered follow-up sequences
2. Stuck lead alerts
3. Appointment reminders (hybrid approval)
4. Custom issue buttons with actions
5. "If this → then that" rule builder
6. Automation visibility (user sees what's happening)
7. AI workflow builder (later)

---

## Phase 11 — Advanced Analytics
**Goal: See how your business is actually performing**
**Timeline: 2 sessions**

### What to build:
1. Revenue tracking + forecasting
2. Close rate by lead source
3. Average job size
4. Installer performance
5. Profit margin per job
6. Pipeline value ($X in open quotes)
7. Measurement accuracy (re-measure rate)

---

## Phases 12+ (Future)
- Mobile app (React Native)
- Voice-to-text notes
- Offline mode
- AI quote generation from photos
- Manufacturer API integrations
- Email parsing for shipping updates
- Google/Apple calendar sync
- SMS campaigns

---

## Build Priority Summary

| Phase | What | Sessions | Unlocks |
|-------|------|----------|---------|
| 1 | Install view + analytics + dashboard | 1–2 | Aspen demo |
| 2 | CRM + pipeline | 2–3 | Real lead tracking |
| 3 | Scheduling | 2 | Daily workflow |
| 4 | Quoting | 3–4 | Revenue feature |
| 5 | Multi-user + permissions | 2 | Sell to teams |
| 6 | Full install management | 2 | Complete job loop |
| 7 | Inventory | 2 | Materials tracking |
| 8 | Builder portal | 3 | New construction |
| 9 | Invoicing + payments | 2–3 | Get paid in app |
| 10 | Automation engine | 3–4 | Business runs itself |
| 11 | Advanced analytics | 2 | Business intelligence |

---

## The Pitch to Aspen (Phase 1 only)

> "You paid $7K for a measuring sheet. This does that — plus photos, 
> validation so bad fractions can't be entered, install tracking per 
> window, and a dashboard showing every job and who measured it. 
> And in two weeks I can show you scheduling, CRM, and quoting built 
> on top of the same data."

That's it. That's the demo.
