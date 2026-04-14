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

type RecentJob = {
  id: string;
  title: string;
  scheduled_at: string | null;
  created_at: string;
  customer_id: string;
  customer_name: string;
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

export default function HomePage() {
  const [tab, setTab] = useState<"dashboard" | "customers">("dashboard");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalWindows, setTotalWindows] = useState(0);
  const [openIssues, setOpenIssues] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

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

    // Total jobs
    const { count: jobCount } = await supabase
      .from("measure_jobs")
      .select("id", { count: "exact", head: true });
    setTotalJobs(jobCount || 0);

    // Recent jobs with customer names
    const { data: jobData } = await supabase
      .from("measure_jobs")
      .select("id, title, scheduled_at, created_at, customer_id")
      .order("created_at", { ascending: false })
      .limit(8);

    if (jobData && jobData.length > 0) {
      const custIds = [...new Set(jobData.map((j: { customer_id: string }) => j.customer_id))];
      const { data: custData } = await supabase
        .from("customers")
        .select("id, first_name, last_name")
        .in("id", custIds);
      const custMap: Record<string, string> = {};
      (custData || []).forEach((c: { id: string; first_name: string | null; last_name: string | null }) => {
        custMap[c.id] = [c.last_name, c.first_name].filter(Boolean).join(", ");
      });
      setRecentJobs(
        jobData.map((j: { id: string; title: string; scheduled_at: string | null; created_at: string; customer_id: string }) => ({
          ...j,
          customer_name: custMap[j.customer_id] || "Unknown",
        }))
      );

      // Total windows
      const { data: rooms } = await supabase
        .from("rooms")
        .select("id")
        .in("measure_job_id", jobData.map((j: { id: string }) => j.id));
      const roomIds = (rooms || []).map((r: { id: string }) => r.id);
      if (roomIds.length > 0) {
        const { count: winCount } = await supabase
          .from("windows")
          .select("id", { count: "exact", head: true })
          .in("room_id", roomIds);
        setTotalWindows(winCount || 0);

        // Open issues
        const { data: winIds } = await supabase
          .from("windows")
          .select("id")
          .in("room_id", roomIds)
          .eq("install_status", "issue");
        setOpenIssues((winIds || []).length);
      }
    }

    setStatsLoading(false);
  }

  async function loadCustomers() {
    const { data } = await supabase
      .from("customers")
      .select("id, first_name, last_name, address, phone, email")
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
      .select("id, first_name, last_name, address, phone, email")
      .single();
    setSaving(false);
    if (error) { alert("Error: " + error.message); return; }
    if (data) setCustomers((prev) => [data as Customer, ...prev]);
    setFirstName(""); setLastName(""); setStreet(""); setCity(""); setAddrState(""); setZip(""); setPhone(""); setEmail("");
    setShowForm(false);
  }

  return (
    <main className="min-h-screen bg-white p-4 text-black">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">ShadeLogic</h1>
          <Link href="/analytics" className="text-sm text-blue-600 hover:underline">Analytics</Link>
        </div>

        {/* Tab toggle */}
        <div className="mb-4 flex rounded border overflow-hidden">
          <button
            className={`flex-1 py-2 text-sm font-medium ${tab === "dashboard" ? "bg-black text-white" : "bg-white text-black"}`}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium ${tab === "customers" ? "bg-black text-white" : "bg-white text-black"}`}
            onClick={() => setTab("customers")}
          >
            Customers
          </button>
        </div>

        {/* DASHBOARD TAB */}
        {tab === "dashboard" && (
          <>
            {/* Stats */}
            <div className="mb-4 grid grid-cols-3 gap-3">
              <div className="rounded border p-3 text-center">
                <div className="text-2xl font-bold">{statsLoading ? "—" : totalJobs}</div>
                <div className="text-xs text-gray-500">Total Jobs</div>
              </div>
              <div className="rounded border p-3 text-center">
                <div className="text-2xl font-bold">{statsLoading ? "—" : totalWindows}</div>
                <div className="text-xs text-gray-500">Windows</div>
              </div>
              <div className="rounded border p-3 text-center">
                <div className={`text-2xl font-bold ${openIssues > 0 ? "text-red-600" : "text-black"}`}>
                  {statsLoading ? "—" : openIssues}
                </div>
                <div className="text-xs text-gray-500">Open Issues</div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => { setTab("customers"); setShowForm(true); }}
                className="rounded bg-black px-4 py-2 text-sm text-white"
              >
                + New Customer
              </button>
            </div>

            {/* Recent jobs */}
            <div className="rounded border p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Recent Jobs</h2>
                <Link href="/analytics" className="text-xs text-blue-600 hover:underline">View all →</Link>
              </div>
              {recentJobs.length === 0 ? (
                <p className="text-sm text-gray-500">No jobs yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recentJobs.map((job) => (
                    <li key={job.id} className="flex items-center justify-between rounded border p-2">
                      <div>
                        <Link href={`/measure-jobs/${job.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                          {job.title}
                        </Link>
                        <div className="text-xs text-gray-500">{job.customer_name}</div>
                      </div>
                      <div className="text-xs text-gray-400">
                        {(job.scheduled_at || job.created_at).slice(0, 10)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {/* CUSTOMERS TAB */}
        {tab === "customers" && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Customers ({customers.length})</h2>
              <button
                onClick={() => setShowForm((v) => !v)}
                className="rounded bg-black px-3 py-1 text-sm text-white"
              >
                {showForm ? "Cancel" : "+ Add Customer"}
              </button>
            </div>

            {showForm && (
              <form onSubmit={addCustomer} className="mb-6 rounded border p-4">
                <h3 className="mb-3 font-semibold">New Customer</h3>

                <div className="mb-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">First Name</label>
                    <input className="w-full rounded border px-3 py-2" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Last Name</label>
                    <input className="w-full rounded border px-3 py-2" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Johnson" />
                  </div>
                </div>

                <div className="mb-3">
                  <label className="mb-1 block text-xs font-medium">Street Address</label>
                  <input className="w-full rounded border px-3 py-2" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="123 Main St" />
                </div>

                <div className="mb-3 grid grid-cols-[1fr_72px_104px] gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">City</label>
                    <input className="w-full rounded border px-3 py-2" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Salt Lake City" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">State</label>
                    <input className="w-full rounded border px-3 py-2 uppercase" value={addrState} onChange={(e) => setAddrState(e.target.value.toUpperCase())} placeholder="UT" maxLength={2} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Zip</label>
                    <input className="w-full rounded border px-3 py-2" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="84101" />
                  </div>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium">Phone</label>
                    <input type="tel" className="w-full rounded border px-3 py-2" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="801-555-1234" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium">Email</label>
                    <input type="email" className="w-full rounded border px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" />
                  </div>
                </div>

                <button type="submit" disabled={saving} className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">
                  {saving ? "Saving..." : "Save Customer"}
                </button>
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
