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
};

type MeasureJob = {
  id: string;
  title: string;
  scheduled_at: string | null;
  created_at: string;
};

export default function CustomerPage() {
  const params = useParams();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [jobs, setJobs] = useState<MeasureJob[]>([]);
  const [creating, setCreating] = useState(false);

  async function loadCustomer() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, address, phone")
      .eq("id", customerId)
      .single();

    if (!error) setCustomer(data);
  }

  async function loadJobs() {
    const { data, error } = await supabase
      .from("measure_jobs")
      .select("id, title, scheduled_at, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });

    if (!error) setJobs(data || []);
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

        <h1 className="mb-2 text-3xl font-bold">
          {[customer.first_name, customer.last_name].filter(Boolean).join(" ")}
        </h1>

        <p className="text-gray-600">{customer.address || "No address"}</p>
        <p className="mb-6 text-gray-600">{customer.phone || "No phone"}</p>

        <div className="mb-6 rounded border p-4">
          <h2 className="mb-3 text-xl font-semibold">Customer Info</h2>

          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium">Name:</span>{" "}
              {[customer.first_name, customer.last_name].filter(Boolean).join(" ")}
            </div>
            <div>
              <span className="font-medium">Address:</span>{" "}
              {customer.address || "No address"}
            </div>
            <div>
              <span className="font-medium">Phone:</span>{" "}
              {customer.phone || "No phone"}
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
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}