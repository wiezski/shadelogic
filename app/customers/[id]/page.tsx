"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { PermissionGate } from "../../permission-gate";

// ── Types ────────────────────────────────────────────────────

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  phone: string | null;   // legacy — still saved for backwards compat
  email: string | null;
  lead_status: string;
  heat_score: string;
  last_activity_at: string | null;
  preferred_contact: string | null;
  next_action: string | null;
  created_at: string;
  tags: string[] | null;
  lead_source: string | null;
};

const PRESET_TAGS = ["Builder", "High-end", "Motorized", "Retrofit", "New Construction", "Referral", "Repeat Customer"];
const LEAD_SOURCES = ["Referral", "Website", "Google", "Facebook", "Door Hanger", "Repeat", "Builder", "Other"];

type CustomerPhone = {
  id: string;
  phone: string;
  label: string;
  is_primary: boolean;
};

type MeasureJob = {
  id: string;
  title: string;
  scheduled_at: string | null;
  install_mode: boolean;
  linked_measure_id: string | null;
  created_at: string;
};

type Quote = {
  id: string;
  title: string | null;
  status: string;
  amount: string | null;
  created_at: string;
};

const QUOTE_STATUS_BADGE: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  sent:     "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

type Activity = {
  id: string;
  type: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

type Task = {
  id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
};

type CustomerAppointment = {
  id: string;
  type: string;
  scheduled_at: string;
  duration_minutes: number;
  status: string;
  outcome: string | null;
  address: string | null;
  notes: string | null;
};

const APPT_TYPE_LABELS: Record<string, string> = {
  sales_consultation: "Sales Consult",
  measure:            "Measure",
  install:            "Install",
  service_call:       "Service Call",
  repair:             "Repair",
  site_walk:          "Site Walk",
  punch:              "Punch Visit",
};

const APPT_TYPE_COLORS: Record<string, string> = {
  sales_consultation: "bg-blue-100 text-blue-700",
  measure:            "bg-purple-100 text-purple-700",
  install:            "bg-green-100 text-green-700",
  service_call:       "bg-orange-100 text-orange-700",
  repair:             "bg-amber-100 text-amber-700",
  site_walk:          "bg-teal-100 text-teal-700",
  punch:              "bg-slate-100 text-slate-600",
};

const OUTCOME_LABELS: Record<string, string> = {
  measured:           "Measured",
  quote_needed:       "Quote Needed",
  sold_on_site:       "Sold on Site",
  follow_up_later:    "Follow Up Later",
  no_sale:            "No Sale",
  needs_second_visit: "Needs Second Visit",
};

// ── Constants ────────────────────────────────────────────────

const LEAD_STAGES = [
  "New", "Contacted", "Consult Scheduled", "Measure Scheduled",
  "Measured", "Quoted", "Sold", "Contact for Install",
  "Installed", "Complete", "Lost", "On Hold", "Waiting",
] as const;

const STAGE_NEXT_ACTION: Record<string, string> = {
  "New":                  "Call or text to make first contact",
  "Contacted":            "Schedule a sales consultation",
  "Consult Scheduled":    "Confirm appointment · prep product samples",
  "Measure Scheduled":    "Confirm measure appointment · verify address",
  "Measured":             "Build and send quote",
  "Quoted":               "Follow up on quote · answer questions",
  "Sold":                 "Contact customer to schedule install",
  "Contact for Install":  "Schedule the install appointment",
  "Installed":            "Follow up · confirm satisfaction · request review",
  "Complete":             "Request referral",
  "On Hold":              "Check back in when timing is right",
  "Waiting":              "Wait for customer update",
  "Lost":                 "Note reason and archive",
};

const HEAT_SCORES = ["Hot", "Warm", "Cold"] as const;

const ACTIVITY_TYPES = ["Call", "Text", "Email", "Note", "Visit"] as const;

const PHONE_LABELS = ["Mobile", "Home", "Work", "Spouse", "Builder", "Designer"] as const;

const stageStyle: Record<string, string> = {
  "New":                  "bg-gray-100 text-gray-700 border-gray-300",
  "Contacted":            "bg-blue-100 text-blue-700 border-blue-300",
  "Consult Scheduled":    "bg-indigo-100 text-indigo-700 border-indigo-300",
  "Measure Scheduled":    "bg-purple-100 text-purple-700 border-purple-300",
  "Measured":             "bg-amber-100 text-amber-800 border-amber-300",
  "Quoted":               "bg-orange-100 text-orange-700 border-orange-300",
  "Sold":                 "bg-green-100 text-green-700 border-green-300",
  "Contact for Install":  "bg-teal-100 text-teal-700 border-teal-300",
  "Installed":            "bg-emerald-100 text-emerald-700 border-emerald-300",
  "Complete":             "bg-lime-100 text-lime-700 border-lime-300",
  "Lost":                 "bg-red-100 text-red-700 border-red-300",
  "On Hold":              "bg-yellow-100 text-yellow-700 border-yellow-300",
  "Waiting":              "bg-slate-100 text-slate-600 border-slate-300",
};

const heatStyle: Record<string, string> = {
  Hot:  "bg-red-500 text-white",
  Warm: "bg-amber-400 text-white",
  Cold: "bg-sky-400 text-white",
};

const activityTypeStyle: Record<string, string> = {
  Call:  "bg-green-100 text-green-700",
  Text:  "bg-blue-100 text-blue-700",
  Email: "bg-purple-100 text-purple-700",
  Note:  "bg-gray-100 text-gray-600",
  Visit: "bg-amber-100 text-amber-700",
};

// ── Helpers ──────────────────────────────────────────────────

function parseAddress(addr: string | null) {
  if (!addr) return { street: "", city: "", state: "", zip: "" };
  const parts = addr.split("|");
  if (parts.length === 4) return { street: parts[0], city: parts[1], state: parts[2], zip: parts[3] };
  return { street: addr, city: "", state: "", zip: "" };
}

function composeAddress(street: string, city: string, state: string, zip: string): string | null {
  if (!street && !city && !state && !zip) return null;
  return `${street}|${city}|${state}|${zip}`;
}

function daysAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

function hoursAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60));
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date(new Date().toDateString());
}

function isDueToday(dueDate: string | null): boolean {
  if (!dueDate) return false;
  return dueDate === new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function stuckDays(heatScore: string): number {
  if (heatScore === "Hot") return 5;
  if (heatScore === "Warm") return 14;
  return 30;
}

function formatSpeedToLead(hours: number): string {
  if (hours < 1) return "< 1 hour";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function getSmsPreset(stage: string, firstName: string): string {
  const n = firstName || "there";
  switch (stage) {
    case "New":       return `Hi ${n}, this is [your name] from [company]. I wanted to reach out about window treatments for your home. When would be a good time to chat?`;
    case "Contacted": return `Hi ${n}, just following up on our conversation about window treatments. Any questions I can help answer?`;
    case "Scheduled": return `Hi ${n}, just confirming your upcoming measure appointment. Let us know if anything changes!`;
    case "Measured":  return `Hi ${n}, we've finished your measurements and are putting your quote together. We'll be in touch soon!`;
    case "Quoted":    return `Hi ${n}, just checking in on the quote we sent over. Any questions I can help with?`;
    case "Sold":      return `Hi ${n}, your order is confirmed! We'll reach out soon to schedule your installation.`;
    case "Installed": return `Hi ${n}, thank you for choosing us! We hope you're loving your new window treatments. Reach out anytime if you need anything.`;
    case "On Hold":   return `Hi ${n}, just checking in — wanted to see if now is a better time to move forward with your window treatments.`;
    case "Waiting":   return `Hi ${n}, just following up to see if you have any updates on your end. Happy to help whenever you're ready!`;
    default:          return `Hi ${n}, `;
  }
}

function getEmailPreset(stage: string, firstName: string): { subject: string; body: string } {
  const n = firstName || "there";
  switch (stage) {
    case "New":
      return { subject: "Window Treatment Options for Your Home", body: `Hi ${n},\n\nI wanted to reach out about window treatments for your home. We'd love to help you find the perfect fit.\n\nWhen would be a good time to connect?\n\nThanks,\n[your name]` };
    case "Contacted":
      return { subject: "Following Up — Window Treatments", body: `Hi ${n},\n\nJust following up on our recent conversation. Do you have any questions I can answer?\n\nThanks,\n[your name]` };
    case "Scheduled":
      return { subject: "Confirming Your Measure Appointment", body: `Hi ${n},\n\nJust confirming your upcoming measure appointment. Please let us know if anything changes.\n\nLooking forward to it!\n\n[your name]` };
    case "Measured":
      return { subject: "Your Quote Is Coming Together", body: `Hi ${n},\n\nWe've completed your measurements and are putting your quote together. We'll have it over to you soon!\n\nThanks,\n[your name]` };
    case "Quoted":
      return { subject: "Following Up on Your Quote", body: `Hi ${n},\n\nJust checking in on the quote we sent over. Happy to answer any questions or walk you through the options.\n\nThanks,\n[your name]` };
    case "Sold":
      return { subject: "Your Order Is Confirmed!", body: `Hi ${n},\n\nGreat news — your order is confirmed and in production. We'll reach out soon to schedule your installation.\n\nThanks for choosing us!\n[your name]` };
    case "Installed":
      return { subject: "Thank You — How Are Your New Window Treatments?", body: `Hi ${n},\n\nThank you for choosing us for your window treatments! We hope you're loving them.\n\nIf you ever need anything or want to refer a friend, we'd love to hear from you.\n\nThanks,\n[your name]` };
    case "On Hold":
      return { subject: "Checking In — Window Treatments", body: `Hi ${n},\n\nJust wanted to check in and see if now might be a better time to move forward with your window treatment project.\n\nNo pressure at all — just here when you're ready.\n\nThanks,\n[your name]` };
    case "Waiting":
      return { subject: "Following Up", body: `Hi ${n},\n\nJust following up to see if you have any updates on your end. Happy to pick up wherever we left off whenever you're ready.\n\nThanks,\n[your name]` };
    default:
      return { subject: "", body: `Hi ${n},\n\n` };
  }
}

// ── Page ─────────────────────────────────────────────────────

export default function CustomerPage() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [phones, setPhones] = useState<CustomerPhone[]>([]);
  const [jobs, setJobs] = useState<MeasureJob[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [creatingQuote, setCreatingQuote] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [appts, setAppts] = useState<CustomerAppointment[]>([]);
  const [creating, setCreating] = useState(false);
  const [crmTab, setCrmTab] = useState<"activity" | "tasks">("activity");

  // Address fields
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");

  // New phone form
  const [newPhone, setNewPhone] = useState("");
  const [newPhoneLabel, setNewPhoneLabel] = useState("Mobile");
  const [addingPhone, setAddingPhone] = useState(false);

  // Outreach composer: key = "sms-{phoneId}" or "email"
  const [composer, setComposer] = useState<string | null>(null);
  const [composerMsg, setComposerMsg] = useState("");
  const [composerSubject, setComposerSubject] = useState("");

  // Activity form
  const [actType, setActType] = useState<string>("Call");
  const [actNotes, setActNotes] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [listening, setListening] = useState(false);

  // Task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  const taskInputRef = useRef<HTMLInputElement>(null);

  // ── Load ──────────────────────────────────────────────────

  async function loadCustomer() {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, address, phone, email, lead_status, heat_score, last_activity_at, preferred_contact, next_action, created_at, tags, lead_source")
      .eq("id", customerId)
      .single();
    if (data) {
      const c = data as Customer;
      setCustomer(c);
      const parsed = parseAddress(c.address);
      setStreet(parsed.street); setCity(parsed.city); setAddrState(parsed.state); setZip(parsed.zip);
    }
  }

  async function loadPhones() {
    const { data } = await supabase
      .from("customer_phones")
      .select("id, phone, label, is_primary")
      .eq("customer_id", customerId)
      .order("is_primary", { ascending: false })
      .order("created_at");
    const loaded = (data || []) as CustomerPhone[];

    // Migrate legacy phone field on first load if table is empty
    if (loaded.length === 0) {
      const { data: cData } = await supabase.from("customers").select("phone").eq("id", customerId).single();
      if (cData?.phone) {
        const { data: inserted } = await supabase
          .from("customer_phones")
          .insert([{ customer_id: customerId, phone: cData.phone, label: "Mobile", is_primary: true }])
          .select("id, phone, label, is_primary").single();
        if (inserted) setPhones([inserted as CustomerPhone]);
        return;
      }
    }
    setPhones(loaded);
  }

  async function loadJobs() {
    const { data } = await supabase.from("measure_jobs")
      .select("id, title, scheduled_at, install_mode, linked_measure_id, created_at")
      .eq("customer_id", customerId).order("created_at", { ascending: false });
    setJobs((data || []) as MeasureJob[]);
  }

  async function loadQuotes() {
    const { data } = await supabase.from("quotes")
      .select("id, title, status, amount, created_at")
      .eq("customer_id", customerId).order("created_at", { ascending: false });
    setQuotes((data || []) as Quote[]);
  }

  async function createQuote() {
    if (!customer) return;
    setCreatingQuote(true);
    const title = `${customer.last_name ?? customer.first_name ?? "Quote"} - ${new Date().toISOString().slice(0, 10)}`;
    // Auto-link the most recent measure job if one exists
    const latestMeasure = jobs.filter(j => !j.install_mode)[0] ?? null;
    const { data, error } = await supabase.from("quotes")
      .insert([{
        customer_id: customerId, title, status: "draft",
        linked_measure_id: latestMeasure?.id ?? null,
      }])
      .select("id").single();
    setCreatingQuote(false);
    if (error || !data) { alert("Error: " + error?.message); return; }
    window.location.href = `/quotes/${data.id}`;
  }

  async function loadActivities() {
    const { data } = await supabase.from("activity_log")
      .select("id, type, notes, created_by, created_at")
      .eq("customer_id", customerId).order("created_at", { ascending: false });
    setActivities((data || []) as Activity[]);
  }

  async function loadTasks() {
    const { data } = await supabase.from("tasks")
      .select("id, title, due_date, completed, completed_at, created_at")
      .eq("customer_id", customerId)
      .order("completed")
      .order("due_date", { ascending: true, nullsFirst: false });
    setTasks((data || []) as Task[]);
  }

  async function loadAppts() {
    const { data } = await supabase
      .from("appointments")
      .select("id, type, scheduled_at, duration_minutes, status, outcome, address, notes")
      .eq("customer_id", customerId)
      .order("scheduled_at", { ascending: false });
    setAppts((data || []) as CustomerAppointment[]);
  }

  useEffect(() => {
    if (!customerId) return;
    loadCustomer(); loadPhones(); loadJobs(); loadQuotes(); loadActivities(); loadTasks(); loadAppts();
  }, [customerId]);

  // ── Customer saves ────────────────────────────────────────

  function updateLocal<K extends keyof Customer>(field: K, value: Customer[K]) {
    setCustomer((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  async function saveField<K extends keyof Customer>(field: K, value: Customer[K]) {
    await supabase.from("customers").update({ [field]: value }).eq("id", customerId);
  }

  async function saveAddress() {
    const composed = composeAddress(street.trim(), city.trim(), addrState.trim(), zip.trim());
    updateLocal("address", composed);
    await saveField("address", composed);
  }

  async function saveLeadStatus(status: string) {
    updateLocal("lead_status", status);
    await saveField("lead_status", status as Customer["lead_status"]);
  }

  async function saveHeatScore(heat: string) {
    updateLocal("heat_score", heat);
    await saveField("heat_score", heat as Customer["heat_score"]);
  }

  // ── Phone CRUD ────────────────────────────────────────────

  async function addPhone(e: React.FormEvent) {
    e.preventDefault();
    if (!newPhone.trim()) return;
    setAddingPhone(true);
    const isPrimary = phones.length === 0;
    const { data } = await supabase.from("customer_phones")
      .insert([{ customer_id: customerId, phone: newPhone.trim(), label: newPhoneLabel, is_primary: isPrimary }])
      .select("id, phone, label, is_primary").single();
    if (data) setPhones((prev) => [...prev, data as CustomerPhone]);
    setNewPhone(""); setNewPhoneLabel("Mobile"); setAddingPhone(false);
  }

  async function updatePhoneField(id: string, field: "phone" | "label", value: string) {
    setPhones((prev) => prev.map((p) => p.id === id ? { ...p, [field]: value } : p));
    await supabase.from("customer_phones").update({ [field]: value }).eq("id", id);
  }

  async function setPrimary(id: string) {
    // Clear all primary then set new one
    await supabase.from("customer_phones").update({ is_primary: false }).eq("customer_id", customerId);
    await supabase.from("customer_phones").update({ is_primary: true }).eq("id", id);
    setPhones((prev) => prev.map((p) => ({ ...p, is_primary: p.id === id })));
  }

  async function deletePhone(id: string) {
    await supabase.from("customer_phones").delete().eq("id", id);
    setPhones((prev) => prev.filter((p) => p.id !== id));
  }

  // ── Activity ──────────────────────────────────────────────

  async function logActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!actNotes.trim()) return;
    setSavingActivity(true);
    const now = new Date().toISOString();
    const { data } = await supabase.from("activity_log")
      .insert([{ customer_id: customerId, type: actType, notes: actNotes.trim() }])
      .select("id, type, notes, created_by, created_at").single();
    if (data) {
      setActivities((prev) => [data as Activity, ...prev]);
      updateLocal("last_activity_at", now);
      await supabase.from("customers").update({ last_activity_at: now }).eq("id", customerId);
    }
    setActNotes(""); setSavingActivity(false);
  }

  async function deleteActivity(id: string) {
    await supabase.from("activity_log").delete().eq("id", id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  function startVoiceInput() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any;
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) { alert("Voice input not supported in this browser."); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR() as any;
    rec.continuous = false;
    rec.interimResults = false;
    setListening(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setActNotes((prev) => prev ? prev + " " + transcript : transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }

  // ── Tasks ─────────────────────────────────────────────────

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    const { data } = await supabase.from("tasks")
      .insert([{ customer_id: customerId, title: taskTitle.trim(), due_date: taskDue || null }])
      .select("id, title, due_date, completed, completed_at, created_at").single();
    if (data) setTasks((prev) => [data as Task, ...prev]);
    setTaskTitle(""); setTaskDue(""); setSavingTask(false);
    taskInputRef.current?.focus();
  }

  async function toggleTask(task: Task) {
    const completed = !task.completed;
    const completed_at = completed ? new Date().toISOString() : null;
    await supabase.from("tasks").update({ completed, completed_at }).eq("id", task.id);
    setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, completed, completed_at } : t));
  }

  async function deleteTask(id: string) {
    await supabase.from("tasks").delete().eq("id", id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  // ── Outreach ──────────────────────────────────────────────

  async function handleCall(phone: string) {
    const now = new Date().toISOString();
    const { data } = await supabase.from("activity_log")
      .insert([{ customer_id: customerId, type: "Call", notes: `Called ${phone}` }])
      .select("id, type, notes, created_by, created_at").single();
    if (data) {
      setActivities((prev) => [data as Activity, ...prev]);
      updateLocal("last_activity_at", now);
      await supabase.from("customers").update({ last_activity_at: now }).eq("id", customerId);
    }
    window.location.href = `tel:${phone.replace(/\D/g, "")}`;
  }

  function openSmsComposer(phoneId: string) {
    if (!customer) return;
    const key = `sms-${phoneId}`;
    if (composer === key) { setComposer(null); return; }
    setComposerMsg(getSmsPreset(customer.lead_status, customer.first_name || ""));
    setComposer(key);
  }

  function openEmailComposer() {
    if (!customer) return;
    if (composer === "email") { setComposer(null); return; }
    const { subject, body } = getEmailPreset(customer.lead_status, customer.first_name || "");
    setComposerSubject(subject); setComposerMsg(body); setComposer("email");
  }

  async function sendSms(phone: string) {
    if (!composerMsg.trim()) return;
    const now = new Date().toISOString();
    const { data } = await supabase.from("activity_log")
      .insert([{ customer_id: customerId, type: "Text", notes: composerMsg.trim() }])
      .select("id, type, notes, created_by, created_at").single();
    if (data) {
      setActivities((prev) => [data as Activity, ...prev]);
      updateLocal("last_activity_at", now);
      await supabase.from("customers").update({ last_activity_at: now }).eq("id", customerId);
    }
    window.location.href = `sms:${phone.replace(/\D/g, "")}?body=${encodeURIComponent(composerMsg.trim())}`;
    setComposer(null);
  }

  async function sendEmail(email: string) {
    if (!composerMsg.trim()) return;
    const now = new Date().toISOString();
    const { data } = await supabase.from("activity_log")
      .insert([{ customer_id: customerId, type: "Email", notes: `Subject: ${composerSubject}\n\n${composerMsg.trim()}` }])
      .select("id, type, notes, created_by, created_at").single();
    if (data) {
      setActivities((prev) => [data as Activity, ...prev]);
      updateLocal("last_activity_at", now);
      await supabase.from("customers").update({ last_activity_at: now }).eq("id", customerId);
    }
    window.location.href = `mailto:${email}?subject=${encodeURIComponent(composerSubject)}&body=${encodeURIComponent(composerMsg.trim())}`;
    setComposer(null);
  }

  // ── Create job ────────────────────────────────────────────

  async function createJob() {
    if (!customer) return;
    setCreating(true);
    const todayString = new Date().toISOString().slice(0, 10);
    const lastName = (customer.last_name || "Customer").trim();
    const matching = jobs.filter((j) => j.title.startsWith(`${lastName} - ${todayString}`));
    const title = matching.length === 0 ? `${lastName} - ${todayString}` : `${lastName} - ${todayString} - ${matching.length + 1}`;
    const { data } = await supabase.from("measure_jobs")
      .insert([{ customer_id: customerId, title, scheduled_at: `${todayString}T12:00:00` }])
      .select("id").single();
    setCreating(false);
    if (data) window.location.href = `/measure-jobs/${data.id}`;
  }

  // ── Derived state ─────────────────────────────────────────

  const openTasks = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);
  const stuckThreshold = customer ? stuckDays(customer.heat_score) : 14;
  const daysSinceActivity = daysAgo(customer?.last_activity_at ?? null);
  const isStuck = customer?.lead_status !== "Installed" && customer?.lead_status !== "Lost"
    && daysSinceActivity !== null && daysSinceActivity >= stuckThreshold;

  // Speed-to-lead: hours between customer created_at and earliest activity
  const firstActivity = activities.length > 0 ? activities[activities.length - 1] : null;
  const speedToLeadHours = customer && firstActivity
    ? hoursAgo(customer.created_at) !== null
      ? Math.max(0, Math.floor((new Date(firstActivity.created_at).getTime() - new Date(customer.created_at).getTime()) / (1000 * 60 * 60)))
      : null
    : null;

  if (!customer) return (
    <main style={{ background: "var(--zr-black)", minHeight: "100vh", padding: "24px" }}>
      <div style={{ maxWidth: 672, margin: "0 auto" }}>
        <div className="zr-skeleton" style={{ width: "40%", height: "20px", borderRadius: "var(--zr-radius-sm)", marginBottom: "16px" }} />
        <div className="zr-skeleton" style={{ width: "60%", height: "14px", borderRadius: "var(--zr-radius-sm)", marginBottom: "8px" }} />
        <div className="zr-skeleton" style={{ width: "35%", height: "14px", borderRadius: "var(--zr-radius-sm)", marginBottom: "24px" }} />
        <div className="zr-skeleton" style={{ width: "100%", height: "120px", borderRadius: "var(--zr-radius-md)" }} />
      </div>
    </main>
  );

  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");
  const primaryPhone = phones.find((p) => p.is_primary) || phones[0];

  return (
    <PermissionGate require="view_customers">
      <main style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }} className="min-h-screen p-4 pb-12">
        <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-4 inline-block text-sm hover:underline" style={{ color: "var(--zr-orange)" }}>← Back</Link>

        {/* ── Header ──────────────────────────────────────── */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{fullName}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {speedToLeadHours !== null && (
              <span className={`font-medium ${speedToLeadHours <= 1 ? "text-green-600" : speedToLeadHours <= 24 ? "text-amber-600" : "text-red-500"}`}>
                Speed-to-lead: {formatSpeedToLead(speedToLeadHours)}
              </span>
            )}
            {isStuck && (
              <span className="font-medium text-amber-600">
                No activity in {daysSinceActivity}d — follow up?
              </span>
            )}
          </div>
        </div>

        {/* ── Next Action ─────────────────────────────────── */}
        <div className="mb-4 rounded p-3" style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)" }}>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-warning)" }}>Next Action Required</label>
          <input
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
            className="w-full rounded px-3 py-2 text-sm"
            value={customer.next_action || ""}
            onChange={(e) => updateLocal("next_action", e.target.value)}
            onBlur={(e) => saveField("next_action", e.target.value || null)}
            placeholder="e.g. Call to follow up on quote, Schedule measure..."
          />
          {/* Stage-based suggestion */}
          {!customer.next_action && customer.lead_status && STAGE_NEXT_ACTION[customer.lead_status] && (
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-amber-600">Suggested:</span>
              <button
                type="button"
                onClick={() => {
                  const suggestion = STAGE_NEXT_ACTION[customer.lead_status];
                  updateLocal("next_action", suggestion);
                  saveField("next_action", suggestion);
                }}
                style={{ color: "var(--zr-warning)" }}
                className="text-xs underline hover:opacity-80"
              >
                {STAGE_NEXT_ACTION[customer.lead_status]}
              </button>
            </div>
          )}
        </div>

        {/* ── Lead Status + Heat Score ─────────────────── */}
        <div className="mb-5 rounded p-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Lead Status</h2>
            <div className="flex gap-1">
              {HEAT_SCORES.map((h) => (
                <button key={h} onClick={() => saveHeatScore(h)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${customer.heat_score === h ? heatStyle[h] : "bg-gray-100 text-gray-500"}`}>
                  {h}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {LEAD_STAGES.map((stage) => {
              const isActive = customer.lead_status === stage;
              return (
                <button key={stage} onClick={() => saveLeadStatus(stage)}
                  style={isActive ? {} : { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
                  className={`shrink-0 rounded border px-3 py-1.5 text-xs font-medium transition-all ${
                    isActive ? stageStyle[stage] + " border-current font-semibold"
                    : ""
                  }`}>
                  {stage}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Tags + Lead Source ───────────────────────── */}
        <div className="mb-5 rounded p-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Tags & Source</h2>
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Tags</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_TAGS.map(tag => {
                const active = (customer.tags ?? []).includes(tag);
                return (
                  <button key={tag} type="button"
                    onClick={async () => {
                      const current = customer.tags ?? [];
                      const updated = active ? current.filter(t => t !== tag) : [...current, tag];
                      updateLocal("tags", updated);
                      await supabase.from("customers").update({ tags: updated }).eq("id", customerId);
                    }}
                    style={active ? { background: "var(--zr-orange)", color: "#fff", border: `1px solid var(--zr-orange)` } : { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors`}>
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Lead Source</label>
            <select
              value={customer.lead_source ?? ""}
              onChange={async e => {
                const val = e.target.value || null;
                updateLocal("lead_source", val);
                await supabase.from("customers").update({ lead_source: val }).eq("id", customerId);
              }}
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
              className="w-full rounded px-2 py-1.5 text-sm">
              <option value="">— Not set —</option>
              {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* ── Contact Info ─────────────────────────────── */}
        <div className="mb-5 rounded p-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Contact Info</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>First Name</label>
              <input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm" value={customer.first_name || ""}
                onChange={(e) => updateLocal("first_name", e.target.value)}
                onBlur={(e) => saveField("first_name", e.target.value || null)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Last Name</label>
              <input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm" value={customer.last_name || ""}
                onChange={(e) => updateLocal("last_name", e.target.value)}
                onBlur={(e) => saveField("last_name", e.target.value || null)} />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Street Address</label>
            <input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm" value={street}
              onChange={(e) => setStreet(e.target.value)} onBlur={saveAddress} placeholder="123 Main St" />
          </div>
          <div className="mt-3 grid grid-cols-[1fr_64px_96px] gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>City</label>
              <input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm" value={city}
                onChange={(e) => setCity(e.target.value)} onBlur={saveAddress} placeholder="Salt Lake City" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>State</label>
              <input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm uppercase" value={addrState}
                onChange={(e) => setAddrState(e.target.value.toUpperCase())} onBlur={saveAddress}
                placeholder="UT" maxLength={2} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Zip</label>
              <input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm" value={zip}
                onChange={(e) => setZip(e.target.value)} onBlur={saveAddress} placeholder="84101" />
            </div>
          </div>

          {/* Tap to navigate */}
          {street && (
            <div className="mt-2">
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent([street, city, addrState, zip].filter(Boolean).join(", "))}`}
                target="_blank" rel="noreferrer"
                style={{ color: "var(--zr-orange)" }}
                className="inline-flex items-center gap-1 text-xs hover:underline">
                📍 Open in Maps →
              </a>
            </div>
          )}

          {/* ── Phone Numbers ──────────────────────────── */}
          <div className="mt-4">
            <label className="mb-2 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Phone Numbers</label>
            <div className="space-y-2">
              {phones.map((p) => (
                <div key={p.id}>
                  <div className="flex items-center gap-2">
                    {/* Primary dot */}
                    <button onClick={() => setPrimary(p.id)} title="Set as primary"
                      className={`h-3 w-3 shrink-0 rounded-full border-2 ${p.is_primary ? "border-blue-500 bg-blue-500" : "border-gray-300 bg-white"}`} />
                    {/* Label */}
                    <select value={p.label} onChange={(e) => updatePhoneField(p.id, "label", e.target.value)}
                      style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                      className="rounded px-2 py-1.5 text-xs w-24">
                      {PHONE_LABELS.map((l) => <option key={l}>{l}</option>)}
                      <option value={p.label}>{PHONE_LABELS.includes(p.label as typeof PHONE_LABELS[number]) ? "" : p.label}</option>
                    </select>
                    {/* Phone input */}
                    <input type="tel" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="flex-1 rounded px-3 py-1.5 text-sm"
                      value={p.phone}
                      onChange={(e) => setPhones((prev) => prev.map((ph) => ph.id === p.id ? { ...ph, phone: e.target.value } : ph))}
                      onBlur={(e) => updatePhoneField(p.id, "phone", e.target.value)}
                      placeholder="801-555-1234" />
                    {/* Call */}
                    <button onClick={() => handleCall(p.phone)}
                      style={{ background: "var(--zr-success)", color: "#fff", border: `1px solid var(--zr-success)` }}
                      className="rounded px-2.5 py-1.5 text-xs font-medium">
                      Call
                    </button>
                    {/* Text */}
                    <button onClick={() => openSmsComposer(p.id)}
                      style={composer === `sms-${p.id}` ? { background: "var(--zr-info)", color: "#fff", border: `1px solid var(--zr-info)` } : { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
                      className={`rounded px-2.5 py-1.5 text-xs font-medium`}>
                      Text
                    </button>
                    {/* Delete */}
                    <button onClick={() => deletePhone(p.id)}
                      className="text-xs text-gray-300 hover:text-red-400">✕</button>
                  </div>

                  {/* SMS composer inline */}
                  {composer === `sms-${p.id}` && (
                    <div className="mt-2 rounded p-3" style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)" }}>
                      <textarea style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm" rows={4}
                        value={composerMsg} onChange={(e) => setComposerMsg(e.target.value)}
                        placeholder="Type your message..." autoFocus />
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => sendSms(p.phone)} disabled={!composerMsg.trim()}
                          style={{ background: "var(--zr-info)", color: "#fff", border: "none" }}
                          className="rounded px-4 py-1.5 text-sm disabled:opacity-40">
                          Open in Messages
                        </button>
                        <button onClick={() => setComposer(null)}
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                          className="rounded px-3 py-1.5 text-sm">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add phone form */}
            <form onSubmit={addPhone} className="mt-2 flex gap-2">
              <select value={newPhoneLabel} onChange={(e) => setNewPhoneLabel(e.target.value)}
                style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                className="rounded px-2 py-1.5 text-xs w-24">
                {PHONE_LABELS.map((l) => <option key={l}>{l}</option>)}
              </select>
              <input type="tel" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="flex-1 rounded px-3 py-1.5 text-sm"
                value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="Add phone number" />
              <button type="submit" disabled={addingPhone || !newPhone.trim()}
                style={{ background: "var(--zr-orange)", color: "#fff", border: "none" }}
                className="rounded px-3 py-1.5 text-xs disabled:opacity-40">
                Add
              </button>
            </form>
          </div>

          {/* ── Email ──────────────────────────────────── */}
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Email</label>
            <div className="flex gap-2">
              <input type="email" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="flex-1 rounded px-3 py-2 text-sm"
                value={customer.email || ""}
                onChange={(e) => updateLocal("email", e.target.value)}
                onBlur={(e) => saveField("email", e.target.value || null)}
                placeholder="john@example.com" />
              {customer.email && (
                <button onClick={openEmailComposer}
                  style={composer === "email" ? { background: "var(--zr-info)", color: "#fff", border: `1px solid var(--zr-info)` } : { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
                  className={`rounded px-3 py-2 text-xs font-medium`}>
                  Email
                </button>
              )}
            </div>
          </div>

          {/* Email composer */}
          {composer === "email" && customer.email && (
            <div className="mt-2 rounded p-3" style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)" }}>
              <input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="mb-2 w-full rounded px-3 py-2 text-sm" placeholder="Subject"
                value={composerSubject} onChange={(e) => setComposerSubject(e.target.value)} autoFocus />
              <textarea style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm" rows={6}
                value={composerMsg} onChange={(e) => setComposerMsg(e.target.value)} />
              <div className="mt-2 flex gap-2">
                <button onClick={() => sendEmail(customer.email!)} disabled={!composerMsg.trim()}
                  style={{ background: "var(--zr-info)", color: "#fff", border: "none" }}
                  className="rounded px-4 py-1.5 text-sm disabled:opacity-40">
                  Open in Mail
                </button>
                <button onClick={() => setComposer(null)}
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  className="rounded px-3 py-1.5 text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* ── Preferred Contact ──────────────────────── */}
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium" style={{ color: "var(--zr-text-secondary)" }}>Preferred Contact Method / Notes</label>
            <input style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 text-sm"
              value={customer.preferred_contact || ""}
              onChange={(e) => updateLocal("preferred_contact", e.target.value)}
              onBlur={(e) => saveField("preferred_contact", e.target.value || null)}
              placeholder="e.g. Text only, Call evenings, Contact spouse first" />
          </div>
        </div>

        {/* ── Activity & Tasks ──────────────────────────── */}
        <div className="mb-5 rounded" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <div style={{ borderBottom: "1px solid var(--zr-border)" }} className="flex">
            <button onClick={() => setCrmTab("activity")}
              style={crmTab === "activity" ? { borderBottom: `2px solid var(--zr-orange)`, color: "var(--zr-text-primary)" } : { color: "var(--zr-text-secondary)" }}
              className={`flex-1 py-2.5 text-sm font-medium`}>
              Activity
              {activities.length > 0 && <span style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)" }} className="ml-1.5 rounded px-1.5 py-0.5 text-xs">{activities.length}</span>}
            </button>
            <button onClick={() => setCrmTab("tasks")}
              style={crmTab === "tasks" ? { borderBottom: `2px solid var(--zr-orange)`, color: "var(--zr-text-primary)" } : { color: "var(--zr-text-secondary)" }}
              className={`flex-1 py-2.5 text-sm font-medium`}>
              Tasks
              {openTasks.length > 0 && (
                <span style={openTasks.some((t) => isOverdue(t.due_date)) ? { background: "rgba(239,68,68,0.2)", color: "var(--zr-error)" } : { background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)" }} className={`ml-1.5 rounded px-1.5 py-0.5 text-xs`}>
                  {openTasks.length}
                </span>
              )}
            </button>
          </div>

          <div className="p-4">
            {/* ── Activity tab ──────────────────────────── */}
            {crmTab === "activity" && (
              <>
                <form onSubmit={logActivity} className="mb-4">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {ACTIVITY_TYPES.map((t) => (
                      <button key={t} type="button" onClick={() => setActType(t)}
                        style={actType === t ? { background: "var(--zr-orange)", color: "#fff", border: `1px solid var(--zr-orange)` } : { background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-secondary)" }}
                        className={`rounded px-3 py-1 text-xs font-medium`}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <textarea style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="w-full rounded px-3 py-2 pr-10 text-sm" rows={2}
                      placeholder={`Log a ${actType.toLowerCase()}...`}
                      value={actNotes} onChange={(e) => setActNotes(e.target.value)} />
                    {/* Voice-to-text mic button */}
                    <button type="button" onClick={startVoiceInput}
                      title="Voice input"
                      style={{ color: listening ? "var(--zr-error)" : "var(--zr-text-secondary)" }}
                      className={`absolute right-2 top-2 rounded p-1 text-sm ${listening ? "animate-pulse" : "hover:opacity-80"}`}>
                      {listening ? "●" : "🎤"}
                    </button>
                  </div>
                  <button type="submit" disabled={savingActivity || !actNotes.trim()}
                    style={{ background: "var(--zr-orange)", color: "#fff", border: "none" }}
                    className="mt-2 rounded px-4 py-1.5 text-sm disabled:opacity-40">
                    {savingActivity ? "Saving..." : "Log"}
                  </button>
                </form>

                {activities.length === 0 ? <p style={{ color: "var(--zr-text-secondary)" }} className="text-sm">No activity yet.</p> : (
                  <ul className="space-y-2">
                    {activities.map((a) => (
                      <li key={a.id} className="flex gap-2 rounded p-2.5" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                        <span className={`shrink-0 self-start rounded px-2 py-0.5 text-xs font-medium ${activityTypeStyle[a.type] || "bg-gray-100 text-gray-600"}`}>{a.type}</span>
                        <div className="min-w-0 flex-1">
                          {a.notes && <p className="text-sm">{a.notes}</p>}
                          <p style={{ color: "var(--zr-text-muted)" }} className="mt-0.5 text-xs">{formatDateTime(a.created_at)}{a.created_by ? ` · ${a.created_by}` : ""}</p>
                        </div>
                        <button onClick={() => deleteActivity(a.id)} style={{ color: "var(--zr-text-muted)" }} className="shrink-0 text-xs hover:text-red-400">✕</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* ── Tasks tab ─────────────────────────────── */}
            {crmTab === "tasks" && (
              <>
                <form onSubmit={addTask} className="mb-4 flex gap-2">
                  <input ref={taskInputRef} style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="flex-1 rounded px-3 py-2 text-sm"
                    placeholder="Add a follow-up task..." value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)} />
                  <input type="date" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }} className="rounded px-2 py-2 text-sm"
                    value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
                  <button type="submit" disabled={savingTask || !taskTitle.trim()}
                    style={{ background: "var(--zr-orange)", color: "#fff", border: "none" }}
                    className="rounded px-3 py-2 text-sm disabled:opacity-40">Add</button>
                </form>

                {openTasks.length === 0 && doneTasks.length === 0 ? (
                  <p style={{ color: "var(--zr-text-secondary)" }} className="text-sm">No tasks yet.</p>
                ) : (
                  <>
                    {openTasks.length > 0 && (
                      <ul className="mb-3 space-y-1.5">
                        {openTasks.map((t) => {
                          const overdue = isOverdue(t.due_date);
                          const today = isDueToday(t.due_date);
                          return (
                            <li key={t.id} className="flex items-center gap-2 rounded p-2.5" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                              <input type="checkbox" checked={false} onChange={() => toggleTask(t)}
                                className="h-4 w-4 shrink-0 cursor-pointer rounded" />
                              <span className="flex-1 text-sm" style={{ color: "var(--zr-text-primary)" }}>{t.title}</span>
                              {t.due_date && (
                                <span style={{ color: overdue ? "var(--zr-error)" : today ? "var(--zr-warning)" : "var(--zr-text-muted)" }} className={`shrink-0 text-xs ${overdue ? "font-semibold" : today ? "font-semibold" : ""}`}>
                                  {overdue ? "Overdue · " : today ? "Today · " : ""}{formatDate(t.due_date)}
                                </span>
                              )}
                              <button onClick={() => deleteTask(t.id)} style={{ color: "var(--zr-text-muted)" }} className="shrink-0 text-xs hover:text-red-400">✕</button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {doneTasks.length > 0 && (
                      <details className="mt-2">
                        <summary style={{ color: "var(--zr-text-secondary)" }} className="cursor-pointer text-xs hover:opacity-80">{doneTasks.length} completed</summary>
                        <ul className="mt-2 space-y-1.5">
                          {doneTasks.map((t) => (
                            <li key={t.id} className="flex items-center gap-2 rounded p-2.5 opacity-60" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                              <input type="checkbox" checked={true} onChange={() => toggleTask(t)}
                                className="h-4 w-4 shrink-0 cursor-pointer rounded" />
                              <span className="flex-1 text-sm line-through text-gray-500">{t.title}</span>
                              {t.completed_at && <span className="shrink-0 text-xs text-gray-400">{formatDate(t.completed_at)}</span>}
                              <button onClick={() => deleteTask(t.id)} style={{ color: "var(--zr-text-muted)" }} className="shrink-0 text-xs hover:text-red-400">✕</button>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Appointments ─────────────────────────────── */}
        <div className="rounded p-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Appointments</h2>
            <Link
              href={`/schedule?customerId=${customerId}&customerName=${encodeURIComponent([customer?.first_name, customer?.last_name].filter(Boolean).join(" "))}&customerAddress=${encodeURIComponent(customer?.address ?? "")}`}
              style={{ background: "var(--zr-orange)", color: "#fff", border: "none" }}
              className="rounded px-3 py-1.5 text-sm">
              + Schedule
            </Link>
          </div>
          {appts.length === 0 ? (
            <p style={{ color: "var(--zr-text-secondary)" }} className="text-sm">No appointments yet.</p>
          ) : (
            <ul className="space-y-2">
              {appts.map((a) => {
                const isPast    = new Date(a.scheduled_at) < new Date();
                const isCanceled = a.status === "canceled";
                const isComplete = a.status === "completed";
                const typeLabel  = APPT_TYPE_LABELS[a.type] ?? a.type;
                const typeBadge  = APPT_TYPE_COLORS[a.type]  ?? "bg-gray-100 text-gray-600";
                const dt = new Date(a.scheduled_at);
                const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
                const timeStr = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                return (
                  <li key={a.id}
                    style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
                    className={`rounded p-2.5 ${isCanceled ? "opacity-40" : isPast && !isComplete ? "opacity-60" : ""}`}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${typeBadge}`}>{typeLabel}</span>
                        <span style={{ color: "var(--zr-text-primary)" }} className="text-sm">{dateStr} at {timeStr}</span>
                      </div>
                      <span className={`text-xs rounded px-1.5 py-0.5 ${
                        isComplete ? "bg-green-100 text-green-700" :
                        isCanceled ? "bg-red-100 text-red-600" :
                        a.status === "confirmed" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-500"
                      }`}>
                        {a.status.replace("_", " ")}
                      </span>
                    </div>
                    {a.outcome && (
                      <div style={{ color: "var(--zr-text-muted)" }} className="mt-1 text-xs">
                        Outcome: <span style={{ color: "var(--zr-text-primary)" }} className="font-medium">{OUTCOME_LABELS[a.outcome] ?? a.outcome}</span>
                      </div>
                    )}
                    {a.address && (
                      <div style={{ color: "var(--zr-text-muted)" }} className="mt-1 text-xs truncate">📍 {a.address}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ── Job Pipeline ─────────────────────────────── */}

        {/* Quotes */}
        <div className="rounded p-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Quotes</h2>
            <button onClick={createQuote} disabled={creatingQuote}
              style={{ background: "var(--zr-orange)", color: "#fff", border: "none" }}
              className="rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {creatingQuote ? "Creating…" : "+ New Quote"}
            </button>
          </div>
          {quotes.length === 0 ? <p style={{ color: "var(--zr-text-secondary)" }} className="text-sm">No quotes yet.</p> : (
            <ul className="space-y-2">
              {quotes.map((q) => (
                <li key={q.id}>
                  <Link href={`/quotes/${q.id}`}
                    className="flex items-center justify-between rounded p-2.5 hover:opacity-80" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                    <div>
                      <div style={{ color: "var(--zr-orange)" }} className="text-sm font-medium">{q.title ?? "Untitled Quote"}</div>
                      {q.amount && <div style={{ color: "var(--zr-text-muted)" }} className="text-xs">{q.amount}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span style={{ color: "var(--zr-text-muted)" }} className="text-xs">{q.created_at.slice(0, 10)}</span>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${QUOTE_STATUS_BADGE[q.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {q.status.charAt(0).toUpperCase() + q.status.slice(1)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Measures */}
        <div className="rounded p-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Measures</h2>
            <button onClick={createJob} disabled={creating}
              style={{ background: "var(--zr-orange)", color: "#fff", border: "none" }}
              className="rounded px-3 py-1.5 text-sm disabled:opacity-50">
              {creating ? "Creating…" : "+ New Measure"}
            </button>
          </div>
          {jobs.filter(j => !j.install_mode).length === 0
            ? <p style={{ color: "var(--zr-text-secondary)" }} className="text-sm">No measures yet.</p>
            : (
            <ul className="space-y-2">
              {jobs.filter(j => !j.install_mode).map((job) => (
                <li key={job.id}>
                  <Link href={`/measure-jobs/${job.id}`}
                    className="flex items-center justify-between rounded p-2.5 hover:opacity-80" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                    <div style={{ color: "var(--zr-orange)" }} className="text-sm font-medium">{job.title}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      {job.scheduled_at && <span style={{ color: "var(--zr-text-muted)" }} className="text-xs">{job.scheduled_at.slice(0, 10)}</span>}
                      <span className="rounded px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700">Measure</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Installs */}
        <div className="rounded p-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Installs</h2>
          </div>
          {jobs.filter(j => j.install_mode).length === 0
            ? <p style={{ color: "var(--zr-text-secondary)" }} className="text-sm">No installs yet. Use "Convert to Install" inside a measure job once sold.</p>
            : (
            <ul className="space-y-2">
              {jobs.filter(j => j.install_mode).map((job) => (
                <li key={job.id}>
                  <Link href={`/measure-jobs/${job.id}`}
                    className="flex items-center justify-between rounded p-2.5 hover:opacity-80" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                    <div style={{ color: "var(--zr-orange)" }} className="text-sm font-medium">{job.title}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      {job.scheduled_at && <span style={{ color: "var(--zr-text-muted)" }} className="text-xs">{job.scheduled_at.slice(0, 10)}</span>}
                      <span className="rounded px-1.5 py-0.5 text-xs bg-green-100 text-green-700">Install</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {/* ── Timeline ─────────────────────────────────── */}
        <div className="rounded p-4" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Timeline</h2>
          {(() => {
            type Event = { date: string; label: string; sub?: string; icon: string; color: string };
            const events: Event[] = [];

            // Activities
            activities.forEach(a => {
              const icons: Record<string, string> = { Call: "📞", Text: "💬", Email: "📧", Note: "📝", Visit: "🚗" };
              const colors: Record<string, string> = { Call: "text-green-600", Text: "text-blue-600", Email: "text-purple-600", Note: "text-gray-500", Visit: "text-amber-600" };
              events.push({ date: a.created_at, label: `${a.type}${a.notes ? `: ${a.notes.slice(0, 60)}${a.notes.length > 60 ? "…" : ""}` : ""}`, icon: icons[a.type] ?? "📝", color: colors[a.type] ?? "text-gray-500" });
            });

            // Tasks
            tasks.forEach(t => {
              if (t.completed && t.completed_at) events.push({ date: t.completed_at, label: `Task completed: ${t.title}`, icon: "✅", color: "text-green-600" });
            });

            // Quotes
            quotes.forEach(q => {
              events.push({ date: q.created_at, label: `Quote created: ${q.title ?? "Untitled"}`, sub: q.amount ? `$${q.amount}` : undefined, icon: "📋", color: "text-orange-500" });
            });

            // Appointments
            appts.forEach(a => {
              const APPT_LABELS: Record<string, string> = { sales_consultation: "Sales Consult", measure: "Measure", install: "Install", service_call: "Service Call", repair: "Repair", site_walk: "Site Walk", punch: "Punch Visit" };
              if (a.status === "completed") events.push({ date: a.scheduled_at, label: `Appointment: ${APPT_LABELS[a.type] ?? a.type}`, sub: a.outcome?.replace(/_/g, " ") ?? undefined, icon: "📅", color: "text-indigo-600" });
            });

            // Measure jobs
            jobs.filter(j => !j.install_mode).forEach(j => {
              events.push({ date: j.created_at, label: `Measure job created: ${j.title}`, icon: "📐", color: "text-purple-600" });
            });
            jobs.filter(j => j.install_mode).forEach(j => {
              events.push({ date: j.created_at, label: `Install job created: ${j.title}`, icon: "🔧", color: "text-green-600" });
            });

            if (events.length === 0) return <p style={{ color: "var(--zr-text-secondary)" }} className="text-sm">No activity yet.</p>;

            // Sort newest first
            events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            return (
              <div className="relative">
                <div className="absolute left-3.5 top-0 bottom-0 w-px" style={{ background: "var(--zr-border)" }} />
                <ul className="space-y-3">
                  {events.map((e, i) => (
                    <li key={i} className="flex gap-3 relative">
                      <div style={{ background: "var(--zr-surface-1)", border: `1px solid var(--zr-border)` }} className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm z-10`}>
                        {e.icon}
                      </div>
                      <div className="min-w-0 pt-0.5">
                        <div className={`text-sm ${e.color}`}>{e.label}</div>
                        {e.sub && <div style={{ color: "var(--zr-text-muted)" }} className="text-xs">{e.sub}</div>}
                        <div style={{ color: "var(--zr-text-muted)" }} className="text-xs mt-0.5">
                          {new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {" "}
                          {new Date(e.date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </div>

        </div>
      </main>
    </PermissionGate>
  );
}
