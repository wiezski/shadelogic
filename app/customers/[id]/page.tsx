"use client";

import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

// ── Types ────────────────────────────────────────────────────

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  phone: string | null;
  phone2: string | null;
  email: string | null;
  lead_status: string;
  heat_score: string;
  last_activity_at: string | null;
};

type MeasureJob = {
  id: string;
  title: string;
  scheduled_at: string | null;
  install_mode: boolean;
  created_at: string;
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

// ── Constants ────────────────────────────────────────────────

const LEAD_STAGES = [
  "New", "Contacted", "Scheduled", "Measured",
  "Quoted", "Sold", "Installed", "Lost",
] as const;

const HEAT_SCORES = ["Hot", "Warm", "Cold"] as const;

const ACTIVITY_TYPES = ["Call", "Text", "Email", "Note", "Visit"] as const;

const stageStyle: Record<string, string> = {
  New:       "bg-gray-100 text-gray-700 border-gray-300",
  Contacted: "bg-blue-100 text-blue-700 border-blue-300",
  Scheduled: "bg-purple-100 text-purple-700 border-purple-300",
  Measured:  "bg-amber-100 text-amber-800 border-amber-300",
  Quoted:    "bg-orange-100 text-orange-700 border-orange-300",
  Sold:      "bg-green-100 text-green-700 border-green-300",
  Installed: "bg-emerald-100 text-emerald-700 border-emerald-300",
  Lost:      "bg-red-100 text-red-700 border-red-300",
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
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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

// ── Page ─────────────────────────────────────────────────────

export default function CustomerPage() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<MeasureJob[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [creating, setCreating] = useState(false);
  const [crmTab, setCrmTab] = useState<"activity" | "tasks">("activity");

  // Address fields
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");

  // New activity form
  const [actType, setActType] = useState<string>("Call");
  const [actNotes, setActNotes] = useState("");
  const [savingActivity, setSavingActivity] = useState(false);

  // New task form
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [savingTask, setSavingTask] = useState(false);

  const taskInputRef = useRef<HTMLInputElement>(null);

  // ── Load ──────────────────────────────────────────────────

  async function loadCustomer() {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, address, phone, phone2, email, lead_status, heat_score, last_activity_at")
      .eq("id", customerId)
      .single();
    if (data) {
      const c = data as Customer;
      setCustomer(c);
      const parsed = parseAddress(c.address);
      setStreet(parsed.street);
      setCity(parsed.city);
      setAddrState(parsed.state);
      setZip(parsed.zip);
    }
  }

  async function loadJobs() {
    const { data } = await supabase
      .from("measure_jobs")
      .select("id, title, scheduled_at, install_mode, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    setJobs((data || []) as MeasureJob[]);
  }

  async function loadActivities() {
    const { data } = await supabase
      .from("activity_log")
      .select("id, type, notes, created_by, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    setActivities((data || []) as Activity[]);
  }

  async function loadTasks() {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, due_date, completed, completed_at, created_at")
      .eq("customer_id", customerId)
      .order("completed")
      .order("due_date", { ascending: true, nullsFirst: false });
    setTasks((data || []) as Task[]);
  }

  useEffect(() => {
    if (!customerId) return;
    loadCustomer();
    loadJobs();
    loadActivities();
    loadTasks();
  }, [customerId]);

  // ── Customer field saves ──────────────────────────────────

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
    await saveField("lead_status", status);
  }

  async function saveHeatScore(heat: string) {
    updateLocal("heat_score", heat);
    await saveField("heat_score", heat);
  }

  // ── Activity ──────────────────────────────────────────────

  async function logActivity(e: React.FormEvent) {
    e.preventDefault();
    if (!actNotes.trim()) return;
    setSavingActivity(true);
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("activity_log")
      .insert([{ customer_id: customerId, type: actType, notes: actNotes.trim() }])
      .select("id, type, notes, created_by, created_at")
      .single();
    if (data) {
      setActivities((prev) => [data as Activity, ...prev]);
      // Update last_activity_at locally + in DB
      updateLocal("last_activity_at", now);
      await supabase.from("customers").update({ last_activity_at: now }).eq("id", customerId);
    }
    setActNotes("");
    setSavingActivity(false);
  }

  async function deleteActivity(id: string) {
    await supabase.from("activity_log").delete().eq("id", id);
    setActivities((prev) => prev.filter((a) => a.id !== id));
  }

  // ── Tasks ─────────────────────────────────────────────────

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    const { data } = await supabase
      .from("tasks")
      .insert([{ customer_id: customerId, title: taskTitle.trim(), due_date: taskDue || null }])
      .select("id, title, due_date, completed, completed_at, created_at")
      .single();
    if (data) setTasks((prev) => [data as Task, ...prev]);
    setTaskTitle("");
    setTaskDue("");
    setSavingTask(false);
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

  // ── Create job ────────────────────────────────────────────

  async function createJob() {
    if (!customer) return;
    setCreating(true);
    const todayString = new Date().toISOString().slice(0, 10);
    const lastName = (customer.last_name || "Customer").trim();
    const matching = jobs.filter((j) => j.title.startsWith(`${lastName} - ${todayString}`));
    const title = matching.length === 0
      ? `${lastName} - ${todayString}`
      : `${lastName} - ${todayString} - ${matching.length + 1}`;
    const { data } = await supabase
      .from("measure_jobs")
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
  const isStuck = daysSinceActivity !== null && daysSinceActivity >= stuckThreshold;

  if (!customer) return <div className="p-6 text-gray-500">Loading...</div>;

  const fullName = [customer.first_name, customer.last_name].filter(Boolean).join(" ");

  return (
    <main className="min-h-screen bg-white p-4 pb-12 text-black">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="mb-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back
        </Link>

        {/* ── Header ─────────────────────────────────────── */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{fullName}</h1>
          {isStuck && (
            <div className="mt-1 text-xs font-medium text-amber-600">
              No activity in {daysSinceActivity}d — follow up?
            </div>
          )}
        </div>

        {/* ── Lead status + Heat score ─────────────────── */}
        <div className="mb-5 rounded border p-4">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Lead Status</h2>
            {/* Heat score */}
            <div className="flex gap-1">
              {HEAT_SCORES.map((h) => (
                <button
                  key={h}
                  onClick={() => saveHeatScore(h)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold transition-opacity ${
                    customer.heat_score === h ? heatStyle[h] : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {h}
                </button>
              ))}
            </div>
          </div>

          {/* Pipeline stages — horizontal scroll on mobile */}
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {LEAD_STAGES.map((stage) => {
              const isActive = customer.lead_status === stage;
              return (
                <button
                  key={stage}
                  onClick={() => saveLeadStatus(stage)}
                  className={`shrink-0 rounded border px-3 py-1.5 text-xs font-medium transition-all ${
                    isActive
                      ? stageStyle[stage] + " border-current font-semibold"
                      : "border-gray-200 bg-white text-gray-400 hover:border-gray-400 hover:text-gray-600"
                  }`}
                >
                  {stage}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Contact info ─────────────────────────────── */}
        <div className="mb-5 rounded border p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-600 uppercase tracking-wide">Contact Info</h2>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">First Name</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={customer.first_name || ""}
                onChange={(e) => updateLocal("first_name", e.target.value)}
                onBlur={(e) => saveField("first_name", e.target.value || null)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Last Name</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={customer.last_name || ""}
                onChange={(e) => updateLocal("last_name", e.target.value)}
                onBlur={(e) => saveField("last_name", e.target.value || null)}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Street Address</label>
            <input className="w-full rounded border px-3 py-2 text-sm" value={street}
              onChange={(e) => setStreet(e.target.value)} onBlur={saveAddress} placeholder="123 Main St" />
          </div>
          <div className="mt-3 grid grid-cols-[1fr_64px_96px] gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">City</label>
              <input className="w-full rounded border px-3 py-2 text-sm" value={city}
                onChange={(e) => setCity(e.target.value)} onBlur={saveAddress} placeholder="Salt Lake City" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">State</label>
              <input className="w-full rounded border px-3 py-2 text-sm uppercase" value={addrState}
                onChange={(e) => setAddrState(e.target.value.toUpperCase())} onBlur={saveAddress}
                placeholder="UT" maxLength={2} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Zip</label>
              <input className="w-full rounded border px-3 py-2 text-sm" value={zip}
                onChange={(e) => setZip(e.target.value)} onBlur={saveAddress} placeholder="84101" />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Phone</label>
              <input type="tel" className="w-full rounded border px-3 py-2 text-sm"
                value={customer.phone || ""}
                onChange={(e) => updateLocal("phone", e.target.value)}
                onBlur={(e) => saveField("phone", e.target.value || null)}
                placeholder="801-555-1234" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Phone 2</label>
              <input type="tel" className="w-full rounded border px-3 py-2 text-sm"
                value={customer.phone2 || ""}
                onChange={(e) => updateLocal("phone2", e.target.value)}
                onBlur={(e) => saveField("phone2", e.target.value || null)}
                placeholder="801-555-5678" />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-500">Email</label>
            <input type="email" className="w-full rounded border px-3 py-2 text-sm"
              value={customer.email || ""}
              onChange={(e) => updateLocal("email", e.target.value)}
              onBlur={(e) => saveField("email", e.target.value || null)}
              placeholder="john@example.com" />
          </div>
        </div>

        {/* ── Activity & Tasks ──────────────────────────── */}
        <div className="mb-5 rounded border">
          {/* Tab bar */}
          <div className="flex border-b">
            <button
              onClick={() => setCrmTab("activity")}
              className={`flex-1 py-2.5 text-sm font-medium ${crmTab === "activity" ? "border-b-2 border-black text-black" : "text-gray-400"}`}
            >
              Activity
              {activities.length > 0 && (
                <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">{activities.length}</span>
              )}
            </button>
            <button
              onClick={() => setCrmTab("tasks")}
              className={`flex-1 py-2.5 text-sm font-medium ${crmTab === "tasks" ? "border-b-2 border-black text-black" : "text-gray-400"}`}
            >
              Tasks
              {openTasks.length > 0 && (
                <span className={`ml-1.5 rounded px-1.5 py-0.5 text-xs ${openTasks.some((t) => isOverdue(t.due_date)) ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                  {openTasks.length}
                </span>
              )}
            </button>
          </div>

          <div className="p-4">
            {/* ── Activity tab ─────────────────────────── */}
            {crmTab === "activity" && (
              <>
                <form onSubmit={logActivity} className="mb-4">
                  {/* Type selector */}
                  <div className="mb-2 flex gap-1.5 flex-wrap">
                    {ACTIVITY_TYPES.map((t) => (
                      <button
                        key={t} type="button"
                        onClick={() => setActType(t)}
                        className={`rounded px-3 py-1 text-xs font-medium border ${
                          actType === t ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-300"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="w-full rounded border px-3 py-2 text-sm"
                    rows={2}
                    placeholder={`Log a ${actType.toLowerCase()}...`}
                    value={actNotes}
                    onChange={(e) => setActNotes(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={savingActivity || !actNotes.trim()}
                    className="mt-2 rounded bg-black px-4 py-1.5 text-sm text-white disabled:opacity-40"
                  >
                    {savingActivity ? "Saving..." : "Log"}
                  </button>
                </form>

                {activities.length === 0 ? (
                  <p className="text-sm text-gray-400">No activity yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {activities.map((a) => (
                      <li key={a.id} className="flex gap-2 rounded border bg-gray-50 p-2.5">
                        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium self-start ${activityTypeStyle[a.type] || "bg-gray-100 text-gray-600"}`}>
                          {a.type}
                        </span>
                        <div className="min-w-0 flex-1">
                          {a.notes && <p className="text-sm">{a.notes}</p>}
                          <p className="mt-0.5 text-xs text-gray-400">
                            {formatDateTime(a.created_at)}{a.created_by ? ` · ${a.created_by}` : ""}
                          </p>
                        </div>
                        <button
                          onClick={() => deleteActivity(a.id)}
                          className="shrink-0 text-xs text-gray-300 hover:text-red-400"
                          aria-label="Delete"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* ── Tasks tab ────────────────────────────── */}
            {crmTab === "tasks" && (
              <>
                <form onSubmit={addTask} className="mb-4 flex gap-2">
                  <input
                    ref={taskInputRef}
                    className="flex-1 rounded border px-3 py-2 text-sm"
                    placeholder="Add a follow-up task..."
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                  />
                  <input
                    type="date"
                    className="rounded border px-2 py-2 text-sm text-gray-600"
                    value={taskDue}
                    onChange={(e) => setTaskDue(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={savingTask || !taskTitle.trim()}
                    className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
                  >
                    Add
                  </button>
                </form>

                {openTasks.length === 0 && doneTasks.length === 0 ? (
                  <p className="text-sm text-gray-400">No tasks yet.</p>
                ) : (
                  <>
                    {openTasks.length > 0 && (
                      <ul className="mb-3 space-y-1.5">
                        {openTasks.map((t) => {
                          const overdue = isOverdue(t.due_date);
                          const today = isDueToday(t.due_date);
                          return (
                            <li key={t.id} className="flex items-center gap-2 rounded border bg-white p-2.5">
                              <input
                                type="checkbox"
                                checked={false}
                                onChange={() => toggleTask(t)}
                                className="h-4 w-4 shrink-0 cursor-pointer rounded"
                              />
                              <span className="flex-1 text-sm">{t.title}</span>
                              {t.due_date && (
                                <span className={`shrink-0 text-xs ${overdue ? "font-semibold text-red-600" : today ? "font-semibold text-amber-600" : "text-gray-400"}`}>
                                  {overdue ? "Overdue · " : today ? "Today · " : ""}{formatDate(t.due_date)}
                                </span>
                              )}
                              <button onClick={() => deleteTask(t.id)} className="shrink-0 text-xs text-gray-300 hover:text-red-400">✕</button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {doneTasks.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                          {doneTasks.length} completed
                        </summary>
                        <ul className="mt-2 space-y-1.5">
                          {doneTasks.map((t) => (
                            <li key={t.id} className="flex items-center gap-2 rounded border bg-gray-50 p-2.5 opacity-60">
                              <input
                                type="checkbox"
                                checked={true}
                                onChange={() => toggleTask(t)}
                                className="h-4 w-4 shrink-0 cursor-pointer rounded"
                              />
                              <span className="flex-1 text-sm line-through text-gray-500">{t.title}</span>
                              {t.completed_at && (
                                <span className="shrink-0 text-xs text-gray-400">{formatDate(t.completed_at)}</span>
                              )}
                              <button onClick={() => deleteTask(t.id)} className="shrink-0 text-xs text-gray-300 hover:text-red-400">✕</button>
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

        {/* ── Measure Jobs ─────────────────────────────── */}
        <div className="rounded border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Measure Jobs</h2>
            <button
              onClick={createJob}
              disabled={creating}
              className="rounded bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {creating ? "Creating..." : "+ New Job"}
            </button>
          </div>

          {jobs.length === 0 ? (
            <p className="text-sm text-gray-400">No jobs yet.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between rounded border p-2.5">
                  <Link href={`/measure-jobs/${job.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                    {job.title}
                  </Link>
                  <div className="flex items-center gap-2">
                    {job.scheduled_at && (
                      <span className="text-xs text-gray-400">{job.scheduled_at.slice(0, 10)}</span>
                    )}
                    <span className={`rounded px-1.5 py-0.5 text-xs ${job.install_mode ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}>
                      {job.install_mode ? "Install" : "Measure"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
