"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

// ── Types ─────────────────────────────────────────────────────

type AppointmentType =
  | "sales_consultation"
  | "measure"
  | "install"
  | "service_call"
  | "repair"
  | "site_walk"
  | "punch";

type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "rescheduled"
  | "canceled"
  | "no_show";

type AppointmentOutcome =
  | "measured"
  | "quote_needed"
  | "sold_on_site"
  | "follow_up_later"
  | "no_sale"
  | "needs_second_visit";

type Appointment = {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_address: string | null;
  type: AppointmentType;
  title: string | null;
  scheduled_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  outcome: AppointmentOutcome | null;
  outcome_notes: string | null;
  address: string | null;
  notes: string | null;
  confirmation_sent: boolean;
  created_at: string;
};

type CustomerOption = {
  id: string;
  name: string;
  address: string | null;
};

// ── Constants ──────────────────────────────────────────────────

const APPT_TYPES: Record<AppointmentType, { label: string; color: string; bg: string; dot: string }> = {
  sales_consultation: { label: "Sales Consult",  color: "text-blue-700",   bg: "bg-blue-100 border-blue-300",   dot: "bg-blue-500" },
  measure:            { label: "Measure",         color: "text-purple-700", bg: "bg-purple-100 border-purple-300", dot: "bg-purple-500" },
  install:            { label: "Install",          color: "text-green-700",  bg: "bg-green-100 border-green-300",  dot: "bg-green-500" },
  service_call:       { label: "Service Call",    color: "text-orange-700", bg: "bg-orange-100 border-orange-300", dot: "bg-orange-500" },
  repair:             { label: "Repair",           color: "text-amber-700",  bg: "bg-amber-100 border-amber-300",  dot: "bg-amber-500" },
  site_walk:          { label: "Site Walk",        color: "text-teal-700",   bg: "bg-teal-100 border-teal-300",   dot: "bg-teal-500" },
  punch:              { label: "Punch Visit",      color: "text-slate-700",  bg: "bg-slate-100 border-slate-300",  dot: "bg-slate-500" },
};

const APPT_STATUSES: Record<AppointmentStatus, { label: string; badge: string }> = {
  scheduled:   { label: "Scheduled",   badge: "bg-gray-100 text-gray-600" },
  confirmed:   { label: "Confirmed",   badge: "bg-blue-100 text-blue-700" },
  in_progress: { label: "In Progress", badge: "bg-amber-100 text-amber-700" },
  completed:   { label: "Completed",   badge: "bg-green-100 text-green-700" },
  rescheduled: { label: "Rescheduled", badge: "bg-purple-100 text-purple-700" },
  canceled:    { label: "Canceled",    badge: "bg-red-100 text-red-600" },
  no_show:     { label: "No Show",     badge: "bg-red-100 text-red-700" },
};

const OUTCOMES: { value: AppointmentOutcome; label: string; icon: string }[] = [
  { value: "measured",           label: "Measured",           icon: "📐" },
  { value: "quote_needed",       label: "Quote Needed",       icon: "📋" },
  { value: "sold_on_site",       label: "Sold on Site",       icon: "🎉" },
  { value: "follow_up_later",    label: "Follow Up Later",    icon: "📅" },
  { value: "no_sale",            label: "No Sale",            icon: "✗" },
  { value: "needs_second_visit", label: "Needs Second Visit", icon: "🔄" },
];

const OUTCOME_TO_STATUS: Partial<Record<AppointmentOutcome, string>> = {
  measured:           "Measured",
  quote_needed:       "Quoted",
  sold_on_site:       "Sold",
  follow_up_later:    "Quoted",
  no_sale:            "Lost",
};

const GRID_START = 7;   // 7 am
const GRID_END   = 19;  // 7 pm
const HOUR_PX    = 64;  // px per hour
const GRID_HOURS = GRID_END - GRID_START;

// ── Helpers ────────────────────────────────────────────────────

function parseAddressDisplay(addr: string | null): string {
  if (!addr) return "";
  const p = addr.split("|");
  if (p.length === 4) return [p[0], p[1], [p[2], p[3]].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return addr;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

function getWeekDays(d: Date): Date[] {
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay()); // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtHour(h: number): string {
  if (h === 0)  return "12am";
  if (h < 12)   return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

function apptTop(appt: Appointment): number {
  const dt = new Date(appt.scheduled_at);
  const hrs = dt.getHours() + dt.getMinutes() / 60;
  return Math.max(0, (hrs - GRID_START) * HOUR_PX);
}

function apptH(appt: Appointment): number {
  return Math.max(24, (appt.duration_minutes / 60) * HOUR_PX);
}

// ── Page ───────────────────────────────────────────────────────

export default function SchedulePage() {
  const searchParams = useSearchParams();
  const incomingCustomerId   = searchParams.get("customerId")   ?? "";
  const incomingCustomerName = searchParams.get("customerName") ?? "";
  const incomingCustomerAddr = searchParams.get("customerAddress") ?? "";

  const [view, setView]               = useState<"day" | "week">("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading]         = useState(true);
  const [customers, setCustomers]     = useState<CustomerOption[]>([]);

  // Modal visibility
  const [showCreate,  setShowCreate]  = useState(false);
  const [showDetail,  setShowDetail]  = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);

  // Create form
  const [custSearch,    setCustSearch]    = useState("");
  const [custId,        setCustId]        = useState("");
  const [createType,    setCreateType]    = useState<AppointmentType>("sales_consultation");
  const [createDate,    setCreateDate]    = useState(isoDate(new Date()));
  const [createTime,    setCreateTime]    = useState("09:00");
  const [createMins,    setCreateMins]    = useState(60);
  const [createAddr,    setCreateAddr]    = useState("");
  const [createNotes,   setCreateNotes]   = useState("");
  const [saving,        setSaving]        = useState(false);

  // Confirmation
  const [confirmMsg, setConfirmMsg] = useState("");

  // Outcome
  const [outcome,      setOutcome]      = useState<AppointmentOutcome | null>(null);
  const [outcomeNotes, setOutcomeNotes] = useState("");

  // stable key to avoid Date object reference churn in useEffect
  const dateKey = isoDate(currentDate);

  useEffect(() => { loadCustomers(); }, []);
  useEffect(() => { loadAppointments(); }, [dateKey, view]); // eslint-disable-line react-hooks/exhaustive-deps

  // If arriving from a customer page, pre-fill and open the create modal
  useEffect(() => {
    if (!incomingCustomerId) return;
    setCustId(incomingCustomerId);
    setCustSearch(incomingCustomerName);
    setCreateAddr(parseAddressDisplay(incomingCustomerAddr) || incomingCustomerAddr);
    setCreateDate(isoDate(new Date()));
    setCreateTime("09:00");
    setCreateType("sales_consultation");
    setCreateMins(60);
    setCreateNotes("");
    setShowCreate(true);
  }, [incomingCustomerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAppointments() {
    setLoading(true);
    const days = view === "week" ? getWeekDays(currentDate) : [currentDate];
    const start = new Date(days[0]);       start.setHours(0, 0, 0, 0);
    const end   = new Date(days[days.length - 1]); end.setHours(23, 59, 59, 999);

    const { data: raw } = await supabase
      .from("appointments")
      .select("*")
      .gte("scheduled_at", start.toISOString())
      .lte("scheduled_at", end.toISOString())
      .order("scheduled_at", { ascending: true });

    if (!raw || raw.length === 0) { setAppointments([]); setLoading(false); return; }

    const custIds = [...new Set(raw.map((a: any) => a.customer_id as string))];
    const { data: cData } = await supabase
      .from("customers").select("id, first_name, last_name, address").in("id", custIds);
    const cMap: Record<string, { name: string; address: string | null }> = {};
    (cData || []).forEach((c: any) => {
      cMap[c.id] = { name: [c.first_name, c.last_name].filter(Boolean).join(" "), address: c.address };
    });

    setAppointments(raw.map((a: any) => ({
      ...a,
      customer_name:    cMap[a.customer_id]?.name    ?? "Unknown",
      customer_address: cMap[a.customer_id]?.address ?? null,
    })));
    setLoading(false);
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from("customers").select("id, first_name, last_name, address")
      .order("last_name", { ascending: true });
    setCustomers((data || []).map((c: any) => ({
      id: c.id, name: [c.first_name, c.last_name].filter(Boolean).join(" "), address: c.address,
    })));
  }

  function navigate(dir: -1 | 1) {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * (view === "week" ? 7 : 1));
    setCurrentDate(d);
  }

  function openCreate(date: Date, hour: number) {
    setCreateDate(isoDate(date));
    setCreateTime(`${String(hour).padStart(2, "0")}:00`);
    setCustId(""); setCustSearch(""); setCreateType("sales_consultation");
    setCreateMins(60); setCreateAddr(""); setCreateNotes("");
    setShowCreate(true);
  }

  function pickCustomer(c: CustomerOption) {
    setCustId(c.id); setCustSearch(c.name);
    if (c.address && !createAddr) setCreateAddr(parseAddressDisplay(c.address));
  }

  async function createAppointment(e: React.FormEvent) {
    e.preventDefault();
    if (!custId) { alert("Please select a customer."); return; }
    const scheduledAt = new Date(`${createDate}T${createTime}:00`).toISOString();
    setSaving(true);
    const { data, error } = await supabase
      .from("appointments")
      .insert([{ customer_id: custId, type: createType, scheduled_at: scheduledAt,
                 duration_minutes: createMins, status: "scheduled",
                 address: createAddr || null, notes: createNotes || null }])
      .select("*").single();
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }

    setShowCreate(false);
    const cust = customers.find(c => c.id === custId);
    const firstName = cust?.name?.split(" ")[0] ?? "there";
    const apptLabel = APPT_TYPES[createType].label;
    const dateStr = new Date(scheduledAt).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    const timeStr = fmtTime(scheduledAt);
    setConfirmMsg(
      `Hi ${firstName}! This confirms your ${apptLabel} appointment on ${dateStr} at ${timeStr}` +
      `${createAddr ? ` at ${createAddr}` : ""}. Reply YES to confirm or call to reschedule.`
    );
    setSelectedAppt({ ...(data as any), customer_name: cust?.name ?? "Unknown", customer_address: cust?.address ?? null });
    setShowConfirm(true);
    loadAppointments();
  }

  async function sendConfirmation() {
    if (!selectedAppt) return;
    await supabase.from("activity_log").insert([{
      customer_id: selectedAppt.customer_id, type: "text",
      notes: `[Confirmation] ${confirmMsg}`, created_by: "ShadeLogic",
    }]);
    await supabase.from("appointments").update({ confirmation_sent: true }).eq("id", selectedAppt.id);
    await supabase.from("customers").update({ last_activity_at: new Date().toISOString() }).eq("id", selectedAppt.customer_id);
    setShowConfirm(false);
    loadAppointments();
  }

  function openDetail(appt: Appointment) {
    setSelectedAppt(appt); setShowDetail(true);
  }

  async function updateStatus(newStatus: AppointmentStatus) {
    if (!selectedAppt) return;
    if (newStatus === "completed") {
      setOutcome(null); setOutcomeNotes("");
      setShowDetail(false); setShowOutcome(true);
      return;
    }
    await supabase.from("appointments").update({ status: newStatus }).eq("id", selectedAppt.id);
    setSelectedAppt({ ...selectedAppt, status: newStatus });
    loadAppointments();
  }

  async function completeWithOutcome() {
    if (!selectedAppt || !outcome) return;
    await supabase.from("appointments").update({
      status: "completed", outcome, outcome_notes: outcomeNotes || null,
    }).eq("id", selectedAppt.id);

    const suggestedStatus = OUTCOME_TO_STATUS[outcome];
    if (suggestedStatus) {
      await supabase.from("customers").update({ lead_status: suggestedStatus }).eq("id", selectedAppt.customer_id);
    }
    await supabase.from("activity_log").insert([{
      customer_id: selectedAppt.customer_id, type: "note",
      notes: `Appointment completed (${APPT_TYPES[selectedAppt.type].label}). Outcome: ${OUTCOMES.find(o => o.value === outcome)?.label}${outcomeNotes ? " — " + outcomeNotes : ""}`,
      created_by: "ShadeLogic",
    }]);
    await supabase.from("customers").update({ last_activity_at: new Date().toISOString() }).eq("id", selectedAppt.customer_id);
    setShowOutcome(false);
    loadAppointments();
  }

  function openReminder(appt: Appointment) {
    const timeStr = fmtTime(appt.scheduled_at);
    const dateStr = new Date(appt.scheduled_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    setConfirmMsg(
      `Hi ${appt.customer_name.split(" ")[0]}! Reminder: your ${APPT_TYPES[appt.type].label} is ` +
      `${dateStr} at ${timeStr}${appt.address ? ` at ${appt.address}` : ""}. See you then!`
    );
    setShowDetail(false); setShowConfirm(true);
  }

  function openOnMyWay(appt: Appointment) {
    setConfirmMsg(
      `Hi ${appt.customer_name.split(" ")[0]}! I'm on my way and should arrive in about 15–20 minutes.`
    );
    setShowDetail(false); setShowConfirm(true);
  }

  // ── Derived data ──────────────────────────────────────────────
  const weekDays   = getWeekDays(currentDate);
  const timeSlots  = Array.from({ length: GRID_HOURS }, (_, i) => GRID_START + i);
  const today      = new Date();

  function dayAppts(d: Date) {
    return appointments.filter(a => isSameDay(new Date(a.scheduled_at), d));
  }

  const filteredCusts = customers
    .filter(c => c.name.toLowerCase().includes(custSearch.toLowerCase()))
    .slice(0, 8);

  // ── Render ─────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-white text-black">

      {/* ── Top bar ── */}
      <div className="border-b px-4 py-3 flex items-center justify-between sticky top-0 bg-white z-20">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm text-gray-400 hover:text-black">← Home</Link>
          <h1 className="text-xl font-bold">Schedule</h1>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setView("day")}
            className={`px-3 py-1 rounded text-sm ${view === "day" ? "bg-black text-white" : "border text-gray-600 hover:bg-gray-50"}`}>
            Day
          </button>
          <button onClick={() => setView("week")}
            className={`px-3 py-1 rounded text-sm ${view === "week" ? "bg-black text-white" : "border text-gray-600 hover:bg-gray-50"}`}>
            Week
          </button>
        </div>
      </div>

      {/* ── Date nav ── */}
      <div className="px-4 py-2 flex items-center justify-between border-b bg-white sticky top-[53px] z-10">
        <button onClick={() => navigate(-1)} className="text-xl text-gray-400 hover:text-black px-1 leading-none">‹</button>
        <div className="text-sm font-medium text-center">
          {view === "week"
            ? `${weekDays[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
            : currentDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
          }
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentDate(new Date())}
            className="text-xs border rounded px-2 py-0.5 text-gray-500 hover:bg-gray-50">Today</button>
          <button onClick={() => navigate(1)} className="text-xl text-gray-400 hover:text-black px-1 leading-none">›</button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="px-4 py-2 flex items-center justify-between">
        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(APPT_TYPES).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`inline-block w-2 h-2 rounded-full ${v.dot}`} />
              {v.label}
            </span>
          ))}
        </div>
        <button
          onClick={() => openCreate(view === "week" ? today : currentDate, 9)}
          className="ml-4 shrink-0 bg-black text-white text-sm px-3 py-1.5 rounded">
          + New
        </button>
      </div>

      {/* ── Calendar ── */}
      {loading ? (
        <div className="text-center text-gray-400 py-12 text-sm">Loading…</div>
      ) : view === "week" ? (
        <WeekView weekDays={weekDays} timeSlots={timeSlots} today={today}
          getAppts={dayAppts} onSlot={openCreate} onAppt={openDetail} />
      ) : (
        <DayView day={currentDate} timeSlots={timeSlots} today={today}
          appts={dayAppts(currentDate)}
          onSlot={(h) => openCreate(currentDate, h)} onAppt={openDetail} />
      )}

      {/* ══ CREATE MODAL ══ */}
      {showCreate && (
        <Modal title="New Appointment" onClose={() => setShowCreate(false)}>
          <form onSubmit={createAppointment} className="space-y-3">

            {/* Customer */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Customer *</label>
              <input type="text" placeholder="Search customers…" value={custSearch}
                onChange={e => { setCustSearch(e.target.value); if (!e.target.value) setCustId(""); }}
                className="w-full border rounded px-2 py-1.5 text-sm" />
              {custSearch && !custId && filteredCusts.length > 0 && (
                <div className="border rounded mt-1 max-h-36 overflow-y-auto shadow-sm">
                  {filteredCusts.map(c => (
                    <button key={c.id} type="button" onClick={() => pickCustomer(c)}
                      className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 border-b last:border-0">
                      {c.name}
                      {c.address && <span className="text-xs text-gray-400 ml-1">· {parseAddressDisplay(c.address).split(",")[0]}</span>}
                    </button>
                  ))}
                </div>
              )}
              {custId && <div className="text-xs text-green-600 mt-0.5">✓ Customer selected</div>}
            </div>

            {/* Type */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Type</label>
              <select value={createType} onChange={e => setCreateType(e.target.value as AppointmentType)}
                className="w-full border rounded px-2 py-1.5 text-sm">
                {Object.entries(APPT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>

            {/* Date + Time */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Date</label>
                <input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm" required />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Time</label>
                <input type="time" value={createTime} onChange={e => setCreateTime(e.target.value)}
                  className="w-full border rounded px-2 py-1.5 text-sm" required />
              </div>
            </div>

            {/* Duration */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Duration</label>
              <select value={createMins} onChange={e => setCreateMins(Number(e.target.value))}
                className="w-full border rounded px-2 py-1.5 text-sm">
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={90}>1.5 hours</option>
                <option value={120}>2 hours</option>
                <option value={180}>3 hours</option>
                <option value={240}>4 hours</option>
                <option value={360}>6 hours</option>
                <option value={480}>Full day (8 hr)</option>
              </select>
            </div>

            {/* Address */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Address</label>
              <input type="text" value={createAddr} onChange={e => setCreateAddr(e.target.value)}
                placeholder="Auto-filled from customer…"
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-gray-500 block mb-1">Notes</label>
              <textarea value={createNotes} onChange={e => setCreateNotes(e.target.value)}
                rows={2} placeholder="Internal notes…"
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={saving}
                className="flex-1 bg-black text-white rounded py-2 text-sm disabled:opacity-50">
                {saving ? "Saving…" : "Create Appointment"}
              </button>
              <button type="button" onClick={() => setShowCreate(false)}
                className="border rounded py-2 px-4 text-sm">Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ══ CONFIRMATION MODAL ══ */}
      {showConfirm && selectedAppt && (
        <Modal title="Send Confirmation" onClose={() => setShowConfirm(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Review and log a confirmation message for{" "}
              <span className="font-medium text-black">{selectedAppt.customer_name}</span>:
            </p>
            <textarea value={confirmMsg} onChange={e => setConfirmMsg(e.target.value)}
              rows={5} className="w-full border rounded px-2 py-1.5 text-sm" />
            <div className="flex gap-2">
              <button onClick={sendConfirmation}
                className="flex-1 bg-black text-white rounded py-2 text-sm">
                ✓ Mark as Sent
              </button>
              <button onClick={() => setShowConfirm(false)}
                className="border rounded py-2 px-4 text-sm">Skip</button>
            </div>
            <p className="text-xs text-gray-400">
              Tapping "Mark as Sent" logs this as a Text activity on the customer record.
            </p>
          </div>
        </Modal>
      )}

      {/* ══ DETAIL MODAL ══ */}
      {showDetail && selectedAppt && (
        <Modal title={APPT_TYPES[selectedAppt.type].label} onClose={() => setShowDetail(false)}>
          <div className="space-y-3 text-sm">

            {/* Customer */}
            <Link href={`/customers/${selectedAppt.customer_id}`}
              className="font-semibold text-blue-600 hover:underline block">
              {selectedAppt.customer_name}
            </Link>

            {/* Time */}
            <div className="text-gray-600">
              📅{" "}
              {new Date(selectedAppt.scheduled_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              {" "}at {fmtTime(selectedAppt.scheduled_at)}
              {" · "}
              {selectedAppt.duration_minutes < 60
                ? `${selectedAppt.duration_minutes}m`
                : `${selectedAppt.duration_minutes / 60}h`}
            </div>

            {/* Address */}
            {selectedAppt.address && (
              <div className="flex items-center gap-1 text-gray-600 flex-wrap">
                <span>📍 {selectedAppt.address}</span>
                <a href={`https://maps.google.com/?q=${encodeURIComponent(selectedAppt.address)}`}
                  target="_blank" rel="noreferrer"
                  className="text-blue-600 text-xs hover:underline ml-1">
                  Directions →
                </a>
              </div>
            )}

            {/* Notes */}
            {selectedAppt.notes && (
              <div className="bg-gray-50 rounded p-2 text-gray-600">{selectedAppt.notes}</div>
            )}

            {/* Status badge */}
            <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${APPT_STATUSES[selectedAppt.status].badge}`}>
              {APPT_STATUSES[selectedAppt.status].label}
            </div>

            {/* Outcome (if complete) */}
            {selectedAppt.outcome && (
              <div className="bg-green-50 border border-green-200 rounded p-2">
                <div className="font-medium text-green-800">
                  Outcome: {OUTCOMES.find(o => o.value === selectedAppt.outcome)?.label}
                </div>
                {selectedAppt.outcome_notes && (
                  <div className="text-green-700 text-xs mt-1">{selectedAppt.outcome_notes}</div>
                )}
              </div>
            )}

            {/* Status actions */}
            {selectedAppt.status !== "completed" && selectedAppt.status !== "canceled" && (
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1.5">Update Status</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["confirmed","in_progress","completed","rescheduled","canceled","no_show"] as AppointmentStatus[])
                    .filter(s => s !== selectedAppt.status)
                    .map(s => (
                      <button key={s} onClick={() => updateStatus(s)}
                        className="border rounded px-2 py-1.5 text-xs text-left hover:bg-gray-50">
                        {APPT_STATUSES[s].label}
                        {s === "completed" && <span className="text-gray-400 ml-1 text-xs">→ picks outcome</span>}
                      </button>
                    ))}
                </div>
              </div>
            )}

            {/* Quick-action buttons */}
            {selectedAppt.status !== "completed" && selectedAppt.status !== "canceled" && (
              <div className="space-y-1.5 pt-1 border-t">
                <button onClick={() => openReminder(selectedAppt)}
                  className="w-full border rounded py-2 text-xs text-gray-600 hover:bg-gray-50">
                  📲 Send Reminder Text
                </button>
                <button onClick={() => openOnMyWay(selectedAppt)}
                  className="w-full border rounded py-2 text-xs text-gray-600 hover:bg-gray-50">
                  🚗 "On My Way" Text
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ══ OUTCOME MODAL ══ */}
      {showOutcome && selectedAppt && (
        <Modal title="What happened?" onClose={() => setShowOutcome(false)}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">
              Select the outcome for this {APPT_TYPES[selectedAppt.type].label} with{" "}
              <span className="font-medium text-black">{selectedAppt.customer_name}</span>:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map(o => (
                <button key={o.value} onClick={() => setOutcome(o.value)}
                  className={`rounded border p-2.5 text-sm text-left transition-colors ${
                    outcome === o.value ? "bg-black text-white border-black" : "hover:bg-gray-50"
                  }`}>
                  <span className="mr-1">{o.icon}</span>{o.label}
                </button>
              ))}
            </div>
            {outcome && OUTCOME_TO_STATUS[outcome] && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                Will update lead status →{" "}
                <span className="font-semibold">{OUTCOME_TO_STATUS[outcome]}</span>
              </div>
            )}
            <textarea value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)}
              rows={2} placeholder="Notes (optional)…"
              className="w-full border rounded px-2 py-1.5 text-sm" />
            <div className="flex gap-2">
              <button onClick={completeWithOutcome} disabled={!outcome}
                className="flex-1 bg-black text-white rounded py-2 text-sm disabled:opacity-40">
                Complete Appointment
              </button>
              <button onClick={() => setShowOutcome(false)}
                className="border rounded py-2 px-4 text-sm">Back</button>
            </div>
          </div>
        </Modal>
      )}

    </main>
  );
}

// ── Modal shell ────────────────────────────────────────────────

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md sm:rounded-xl rounded-t-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-4 py-3 flex items-center justify-between rounded-t-2xl sm:rounded-t-xl z-10">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-black text-xl leading-none">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

// ── Week view ──────────────────────────────────────────────────

function WeekView({ weekDays, timeSlots, today, getAppts, onSlot, onAppt }: {
  weekDays: Date[];
  timeSlots: number[];
  today: Date;
  getAppts: (d: Date) => Appointment[];
  onSlot: (d: Date, h: number) => void;
  onAppt: (a: Appointment) => void;
}) {
  return (
    <div className="overflow-x-auto pb-8">
      <div style={{ minWidth: 600 }}>
        {/* Day headers */}
        <div className="grid border-b bg-white" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
          <div className="border-r" />
          {weekDays.map((day, i) => (
            <div key={i}
              className={`text-center py-2 border-r last:border-0 ${isSameDay(day, today) ? "bg-blue-50" : ""}`}>
              <div className="text-xs text-gray-400">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
              <div className={`text-sm font-bold ${isSameDay(day, today) ? "text-blue-600" : ""}`}>{day.getDate()}</div>
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div className="relative" style={{ height: GRID_HOURS * HOUR_PX }}>
          {/* Hour lines + labels */}
          {timeSlots.map(h => (
            <div key={h} className="absolute left-0 right-0 border-t border-gray-100 pointer-events-none"
              style={{ top: (h - GRID_START) * HOUR_PX }}>
              <span className="absolute text-xs text-gray-300 pl-1" style={{ top: -9, width: 50 }}>{fmtHour(h)}</span>
            </div>
          ))}

          {/* Day columns */}
          <div className="absolute inset-0 grid" style={{ gridTemplateColumns: "52px repeat(7, 1fr)" }}>
            <div className="border-r" />
            {weekDays.map((day, di) => (
              <div key={di} className={`relative border-r last:border-0 ${isSameDay(day, today) ? "bg-blue-50/20" : ""}`}>
                {/* Clickable slots */}
                {timeSlots.map(h => (
                  <div key={h} onClick={() => onSlot(day, h)}
                    className="absolute left-0 right-0 cursor-pointer hover:bg-blue-50/40"
                    style={{ top: (h - GRID_START) * HOUR_PX, height: HOUR_PX }} />
                ))}
                {/* Appointments */}
                {getAppts(day).map(a => (
                  <ApptBlock key={a.id} appt={a} onClick={() => onAppt(a)} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Day view ───────────────────────────────────────────────────

function DayView({ day, timeSlots, today, appts, onSlot, onAppt }: {
  day: Date;
  timeSlots: number[];
  today: Date;
  appts: Appointment[];
  onSlot: (h: number) => void;
  onAppt: (a: Appointment) => void;
}) {
  return (
    <div className="px-4 pb-8">
      <div className="relative" style={{ height: GRID_HOURS * HOUR_PX }}>
        {/* Hour lines + labels */}
        {timeSlots.map(h => (
          <div key={h} className="absolute left-0 right-0 flex border-t border-gray-100"
            style={{ top: (h - GRID_START) * HOUR_PX, height: HOUR_PX }}>
            <span className="text-xs text-gray-300 w-12 shrink-0 -translate-y-2.5 pl-1">{fmtHour(h)}</span>
            <div onClick={() => onSlot(h)}
              className="flex-1 cursor-pointer hover:bg-blue-50/40 rounded" />
          </div>
        ))}
        {/* Appointments */}
        <div className="absolute" style={{ left: 52, right: 0, top: 0 }}>
          {appts.map(a => (
            <ApptBlock key={a.id} appt={a} onClick={() => onAppt(a)} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Appointment block ──────────────────────────────────────────

function ApptBlock({ appt, onClick }: { appt: Appointment; onClick: () => void }) {
  const top    = apptTop(appt);
  const height = apptH(appt);
  const { bg, color, label } = APPT_TYPES[appt.type];

  return (
    <div
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`absolute left-0.5 right-0.5 rounded border ${bg} cursor-pointer hover:brightness-95 overflow-hidden z-10
        ${appt.status === "completed" ? "opacity-50" : ""}
        ${appt.status === "canceled"  ? "opacity-30" : ""}`}
      style={{ top, height: Math.max(height, 22) }}
    >
      <div className={`px-1 py-0.5 leading-tight ${color}`}>
        <div className="text-xs font-semibold truncate">{appt.customer_name}</div>
        {height > 36 && <div className="text-xs opacity-70 truncate">{label}</div>}
      </div>
    </div>
  );
}
