"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type DashboardJob = {
  id: string;
  title: string;
  customer_id: string;
  customer_name: string;
  scheduled_at: string | null;
  install_mode: boolean;
  install_scheduled_at: string | null;
  created_at: string;
  overdue?: boolean;
  needs_attention?: boolean;
};

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

function formatAddressDisplay(addr: string | null): string {
  if (!addr) return "No address";
  const { street, city, state, zip } = parseAddress(addr);
  const parts = [street, city, [state, zip].filter(Boolean).join(" ")].filter(Boolean);
  return parts.join(", ") || "No address";
}

function daysAgo(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

type FilterKey = "measures_to_schedule" | "measures_done" | "installs_to_schedule" | "installs_scheduled" | "issues";

export default function HomePage() {
  const [tab, setTab] = useState<"dashboard" | "customers">("dashboard");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState<FilterKey | null>(null);

  const [measuresToSchedule, setMeasuresToSchedule] = useState<DashboardJob[]>([]);
  const [measuresDone, setMeasuresDone] = useState<DashboardJob[]>([]);
  const [installsToSchedule, setInstallsToSchedule] = useState<DashboardJob[]>([]);
  const [installsScheduled, setInstallsScheduled] = useState<DashboardJob[]>([]);
  const [issueJobs, setIssueJobs] = useState<DashboardJob[]>([]);

  // Add customer form
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadDashboard();
    loadCustomers();
  }, []);

  async function loadDashboard() {
    setStatsLoading(true);

    const { data: jobData } = await supabase
      .from("measure_jobs")
      .select("id, title, customer_id, scheduled_at, install_mode, install_scheduled_at, created_at")
      .order("created_at", { ascending: false });

    const jobs = (jobData || []) as Omit<DashboardJob, "customer_name">[];
    if (jobs.length === 0) { setStatsLoading(false); return; }

    // Customer names
    const custIds = [...new Set(jobs.map((j) => j.customer_id))];
    const { data: custData } = await supabase
      .from("customers").select("id, first_name, last_name").in("id", custIds);
    const custMap: Record<string, string> = {};
    (custData || []).forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
      custMap[c.id] = [c.last_name, c.first_name].filter(Boolean).join(", ");
    });

    // Rooms
    const jobIds = jobs.map((j) => j.id);
    const { data: roomData } = await supabase.from("rooms").select("id, measure_job_id").in("measure_job_id", jobIds);
    const roomsByJob: Record<string, string[]> = {};
    (roomData || []).forEach((r: { id: string; measure_job_id: string }) => {
      if (!roomsByJob[r.measure_job_id]) roomsByJob[r.measure_job_id] = [];
      roomsByJob[r.measure_job_id].push(r.id);
    });
    const allRoomIds = (roomData || []).map((r: { id: string }) => r.id);

    // Windows
    const winCountByRoom: Record<string, number> = {};
    const issueJobIds = new Set<string>();
    if (allRoomIds.length > 0) {
      const { data: winData } = await supabase
        .from("windows").select("id, room_id, install_status").in("room_id", allRoomIds);
      (winData || []).forEach((w: { id: string; room_id: string; install_status: string }) => {
        winCountByRoom[w.room_id] = (winCountByRoom[w.room_id] || 0) + 1;
        if (w.install_status === "issue") {
          const jobId = Object.keys(roomsByJob).find((jid) => roomsByJob[jid].includes(w.room_id));
          if (jobId) issueJobIds.add(jobId);
        }
      });
    }

    const hasWindows = (jobId: string) =>
      (roomsByJob[jobId] || []).some((rid) => (winCountByRoom[rid] || 0) > 0);

    const now = Date.now();
    const enrich = (j: Omit<DashboardJob, "customer_name">): DashboardJob => ({
      ...j,
      customer_name: custMap[j.customer_id] || "Unknown",
      overdue: !j.install_mode && !hasWindows(j.id) && daysAgo(j.created_at) > 7,
      needs_attention: daysAgo(j.created_at) > 5,
    });

    setMeasuresToSchedule(jobs.filter((j) => !j.install_mode && !hasWindows(j.id)).map(enrich));
    setMeasuresDone(jobs.filter((j) => !j.install_mode && hasWindows(j.id)).map(enrich));
    setInstallsToSchedule(jobs.filter((j) => j.install_mode && !j.install_scheduled_at).map(enrich));
    setInstallsScheduled(jobs.filter((j) => j.install_mode && j.install_scheduled_at).map(enrich));
    setIssueJobs(jobs.filter((j) => issueJobIds.has(j.id)).map(enrich));

    setStatsLoading(false);
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from("customers").select("id, first_name, last_name, address, phone, email")
      .order("created_at", { ascending: false });
    setCustomers((data || []) as Customer[]);
  }

  async function addCustomer(e: React.FormEvent) {
    e.preventDefault();
    const first = firstName.trim();
    const last = lastName.trim();
    if (!first || !last) { alert("First and last name required."); return; }
    const composedAddress = composeAddress(street.trim(), city.trim(), addrState.trim(), zip.trim());
    setSaving(true);
    const { data, error } = await supabase
      .from("customers")
      .insert([{ name: `${first} ${last}`, first_name: first, last_name: last, address: composedAddress, phone: phone.trim() || null, email: email.trim() || null }])
      .select("id, first_name, last_name, address, phone, email").single();
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    if (data) setCustomers((prev) => [data as Customer, ...prev]);
    setFirstName(""); setLastName(""); setStreet(""); setCity(""); setAddrState(""); setZip(""); setPhone(""); setEmail("");
    setShowForm(false);
  }

  function toggleFilter(key: FilterKey) {
    setSelectedFilter((prev) => (prev === key ? null : key));
  }

  const filterJobs: Record<FilterKey, DashboardJob[]> = {
    measures_to_schedule: measuresToSchedule,
    measures_done: measuresDone,
    installs_to_schedule: installsToSchedule,
    installs_scheduled: installsScheduled,
    issues: issueJobs,
  };

  const filterLabels: Record<FilterKey, string> = {
    measures_to_schedule: "Measures to Schedule",
    measures_done: "Measures Done",
    installs_to_schedule: "Installs to Schedule",
    installs_scheduled: "Installs Scheduled",
    issues: "Open Issues",
  };

  function StatCard({ label, count, filterKey, color = "text-black" }: {
    label: string; count: number; filterKey: FilterKey; color?: string;
  }) {
    const active = selectedFilter === filterKey;
    return (
      <button
        type="button"
        onClick={() => toggleFilter(filterKey)}
        className={`rounded border p-3 text-center w-full transition-colors ${active ? "bg-black text-white" : "bg-white hover:bg-gray-50"}`}
      >
        <div className={`text-2xl font-bold ${active ? "text-white" : color}`}>
          {statsLoading ? "—" : count}
        </div>
        <div className={`text-xs mt-1 ${active ? "text-gray-300" : "text-gray-500"}`}>{label}</div>
      </button>
    );
  }

  return (
    <main className="min-h-screen bg-white p-4 text-black">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">ShadeLogic</h1>
          <Link href="/analytics" className="text-sm text-blue-600 hover:underline">Analytics</Link>
        </div>

        <div className="mb-4 flex rounded border overflow-hidden">
          <button className={`flex-1 py-2 text-sm font-medium ${tab === "dashboard" ? "bg-black text-white" : "bg-white text-black"}`} onClick={() => setTab("dashboard")}>Dashboard</button>
          <button className={`flex-1 py-2 text-sm font-medium ${tab === "customers" ? "bg-black text-white" : "bg-white text-black"}`} onClick={() => setTab("customers")}>Customers</button>
        </div>

        {tab === "dashboard" && (
          <>
            {/* Stats grid */}
            <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <StatCard label="Measures to Schedule" count={measuresToSchedule.length} filterKey="measures_to_schedule" />
              <StatCard label="Measures Done" count={measuresDone.length} filterKey="measures_done" color="text-green-600" />
              <StatCard label="Installs to Schedule" count={installsToSchedule.length} filterKey="installs_to_schedule" />
              <StatCard label="Installs Scheduled" count={installsScheduled.length} filterKey="installs_scheduled" color="text-blue-600" />
              <StatCard label="Open Issues" count={issueJobs.length} filterKey="issues" color={issueJobs.length > 0 ? "text-red-600" : "text-black"} />
            </div>

            {/* Filtered job list */}
            {selectedFilter && (
              <div className="mb-4 rounded border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="font-semibold">{filterLabels[selectedFilter]}</h2>
                  <button type="button" onClick={() => setSelectedFilter(null)} className="text-xs text-gray-400">✕ close</button>
                </div>

                {filterJobs[selectedFilter].length === 0 ? (
                  <p className="text-sm text-gray-500">None right now.</p>
                ) : (
                  <ul className="space-y-2">
                    {filterJobs[selectedFilter].map((job) => (
                      <li key={job.id}>
                        <Link href={`/measure-jobs/${job.id}`} className="block rounded border p-2 hover:bg-gray-50">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-medium text-blue-600">{job.title}</div>
                              <div className="text-xs text-gray-500">{job.customer_name}</div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              {job.overdue && (
                                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Overdue</span>
                              )}
                              {job.needs_attention && !job.overdue && daysAgo(job.created_at) > 5 && (
                                <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Idle {daysAgo(job.created_at)}d</span>
                              )}
                              {job.install_scheduled_at && (
                                <span className="text-xs text-gray-400">{job.install_scheduled_at.slice(0, 10)}</span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Quick actions */}
            <div className="flex gap-2">
              <button onClick={() => { setTab("customers"); setShowForm(true); }} className="rounded bg-black px-4 py-2 text-sm text-white">
                + New Customer
              </button>
            </div>
          </>
        )}

        {tab === "customers" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Customers ({customers.length})</h2>
              <button onClick={() => setShowForm((v) => !v)} className="rounded bg-black px-3 py-1 text-sm text-white">
                {showForm ? "Cancel" : "+ Add Customer"}
              </button>
            </div>

            {showForm && (
              <form onSubmit={addCustomer} className="mb-6 rounded border p-4">
                <h3 className="mb-3 font-semibold">New Customer</h3>
                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-xs font-medium">First Name</label><input className="w-full rounded border px-3 py-2" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" /></div>
                  <div><label className="mb-1 block text-xs font-medium">Last Name</label><input className="w-full rounded border px-3 py-2" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Johnson" /></div>
                </div>
                <div className="mb-3"><label className="mb-1 block text-xs font-medium">Street Address</label><input className="w-full rounded border px-3 py-2" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" /></div>
                <div className="mb-3 grid grid-cols-[1fr_72px_104px] gap-3">
                  <div><label className="mb-1 block text-xs font-medium">City</label><input className="w-full rounded border px-3 py-2" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Salt Lake City" /></div>
                  <div><label className="mb-1 block text-xs font-medium">State</label><input className="w-full rounded border px-3 py-2 uppercase" value={addrState} onChange={(e) => setAddrState(e.target.value.toUpperCase())} placeholder="UT" maxLength={2} /></div>
                  <div><label className="mb-1 block text-xs font-medium">Zip</label><input className="w-full rounded border px-3 py-2" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="84101" /></div>
                </div>
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div><label className="mb-1 block text-xs font-medium">Phone</label><input type="tel" className="w-full rounded border px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="801-555-1234" /></div>
                  <div><label className="mb-1 block text-xs font-medium">Email</label><input type="email" className="w-full rounded border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" /></div>
                </div>
                <button type="submit" disabled={saving} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">{saving ? "Saving..." : "Save Customer"}</button>
              </form>
            )}

            {customers.length === 0 ? (
              <p className="text-gray-500">No customers yet.</p>
            ) : (
              <ul className="space-y-2">
                {customers.map((customer) => (
                  <li key={customer.id} className="rounded border p-3">
                    <Link href={`/customers/${customer.id}`} className="font-semibold text-blue-600 hover:underline">
                      {[customer.first_name, customer.last_name].filter(Boolean).join(" ")}
                    </Link>
                    <div className="text-sm text-gray-600">{formatAddressDisplay(customer.address)}</div>
                    {customer.phone && <div className="text-sm text-gray-600">{customer.phone}</div>}
                    {customer.email && <div className="text-sm text-gray-600">{customer.email}</div>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </main>
  );
}
