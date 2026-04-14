"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

type Customer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
};

type MeasureJob = {
  id: string;
  title: string;
  scheduled_at: string | null;
  created_at: string;
};

function parseAddress(addr: string | null) {
  if (!addr) return { street: "", city: "", state: "", zip: "" };
  const parts = addr.split("|");
  if (parts.length === 4) {
    return { street: parts[0], city: parts[1], state: parts[2], zip: parts[3] };
  }
  return { street: addr, city: "", state: "", zip: "" };
}

function composeAddress(street: string, city: string, state: string, zip: string): string | null {
  if (!street && !city && !state && !zip) return null;
  return `${street}|${city}|${state}|${zip}`;
}

export default function CustomerPage() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<MeasureJob[]>([]);
  const [creating, setCreating] = useState(false);

  // Editable address sub-fields (derived from customer.address)
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");

  async function loadCustomer() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, address, phone, email")
      .eq("id", customerId)
      .single();

    if (!error && data) {
      setCustomer(data as Customer);
      const parsed = parseAddress((data as Customer).address);
      setStreet(parsed.street);
      setCity(parsed.city);
      setAddrState(parsed.state);
      setZip(parsed.zip);
    }
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from("measure_jobs")
      .select("id, title, scheduled_at, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (!error) setJobs(data || []);
  }

  function updateCustomerLocal<K extends keyof Customer>(field: K, value: Customer[K]) {
    setCustomer((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  async function saveCustomerField<K extends keyof Customer>(field: K, value: Customer[K]) {
    const { error } = await supabase
      .from("customers")
      .update({ [field]: value })
      .eq("id", customerId);

    if (error) alert(`Error saving ${String(field)}`);
  }

  async function saveAddress() {
    const composed = composeAddress(street.trim(), city.trim(), addrState.trim(), zip.trim());
    updateCustomerLocal("address", composed);
    await saveCustomerField("address", composed);
  }

  async function createJob() {
    if (!customer) return;

    setCreating(true);

    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayString = `${yyyy}-${mm}-${dd}`;

    const lastName = (customer.last_name || "Customer").trim();

    const matchingJobs = jobs.filter((job) =>
      job.title.startsWith(`${lastName} - ${todayString}`)
    );

    const title =
      matchingJobs.length === 0
        ? `${lastName} - ${todayString}`
        : `${lastName} - ${todayString} - ${matchingJobs.length + 1}`;

    const { data, error } = await supabase
      .from("measure_jobs")
      .insert([
        {
          customer_id: customerId,
          title,
          scheduled_at: `${todayString}T12:00:00`,
        },
      ])
      .select("id")
      .single();

    setCreating(false);

    if (error || !data) {
      alert("Error creating job");
      return;
    }

    window.location.href = `/measure-jobs/${data.id}`;
  }

  useEffect(() => {
    if (!customerId) return;
    loadCustomer();
    loadJobs();
  }, [customerId]);

  if (!customer) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="mb-4 inline-block text-blue-600 hover:underline">
          ← Back to customers
        </Link>

        <h1 className="mb-6 text-3xl font-bold">
          {[customer.first_name, customer.last_name].filter(Boolean).join(" ")}
        </h1>

        <div className="mb-6 rounded border p-4">
          <h2 className="mb-4 text-xl font-semibold">Customer Info</h2>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">First Name</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={customer.first_name || ""}
                onChange={(e) => updateCustomerLocal("first_name", e.target.value)}
                onBlur={(e) => saveCustomerField("first_name", e.target.value || null)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Last Name</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={customer.last_name || ""}
                onChange={(e) => updateCustomerLocal("last_name", e.target.value)}
                onBlur={(e) => saveCustomerField("last_name", e.target.value || null)}
              />
            </div>
          </div>

          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-gray-600">Street Address</label>
            <input
              className="w-full rounded border px-3 py-2 text-sm"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              onBlur={saveAddress}
              placeholder="123 Main St"
            />
          </div>

          <div className="mt-3 grid grid-cols-[1fr_72px_104px] gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">City</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                onBlur={saveAddress}
                placeholder="Salt Lake City"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">State</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm uppercase"
                value={addrState}
                onChange={(e) => setAddrState(e.target.value.toUpperCase())}
                onBlur={saveAddress}
                placeholder="UT"
                maxLength={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Zip</label>
              <input
                className="w-full rounded border px-3 py-2 text-sm"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                onBlur={saveAddress}
                placeholder="84101"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Phone</label>
              <input
                type="tel"
                className="w-full rounded border px-3 py-2 text-sm"
                value={customer.phone || ""}
                onChange={(e) => updateCustomerLocal("phone", e.target.value)}
                onBlur={(e) => saveCustomerField("phone", e.target.value || null)}
                placeholder="801-555-1234"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Email</label>
              <input
                type="email"
                className="w-full rounded border px-3 py-2 text-sm"
                value={customer.email || ""}
                onChange={(e) => updateCustomerLocal("email", e.target.value)}
                onBlur={(e) => saveCustomerField("email", e.target.value || null)}
                placeholder="john@example.com"
              />
            </div>
          </div>
        </div>

        <div className="rounded border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-semibold">Measure Jobs</h2>

            <button
              onClick={createJob}
              disabled={creating}
              className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            >
              {creating ? "Creating..." : "New Measure Job"}
            </button>
          </div>

          {jobs.length === 0 ? (
            <p className="text-gray-500">No measure jobs yet.</p>
          ) : (
            <ul className="space-y-2">
              {jobs.map((job) => (
                <li key={job.id} className="rounded border p-3">
                  <Link
                    href={`/measure-jobs/${job.id}`}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    {job.title}
                  </Link>
                  {job.scheduled_at && (
                    <div className="text-xs text-gray-500">
                      {job.scheduled_at.slice(0, 10)}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
