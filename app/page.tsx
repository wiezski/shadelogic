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

function parseAddress(addr: string | null) {
  if (!addr) return { street: "", city: "", state: "", zip: "" };
  const parts = addr.split("|");
  if (parts.length === 4) {
    return { street: parts[0], city: parts[1], state: parts[2], zip: parts[3] };
  }
  // Legacy single-line address
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
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [addrState, setAddrState] = useState("");
  const [zip, setZip] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, address, phone, email")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading customers:", error);
      alert("Load error: " + JSON.stringify(error));
      return;
    }

    setCustomers((data || []) as Customer[]);
  }

  async function addCustomer(e: React.FormEvent) {
    e.preventDefault();

    const first = firstName.trim();
    const last = lastName.trim();
    const ph = phone.trim();
    const em = email.trim();

    if (!first || !last) {
      alert("First name and last name are required.");
      return;
    }

    const composedAddress = composeAddress(
      street.trim(),
      city.trim(),
      addrState.trim(),
      zip.trim()
    );

    setLoading(true);

    const { data, error } = await supabase
      .from("customers")
      .insert([
        {
          name: `${first} ${last}`,
          first_name: first,
          last_name: last,
          address: composedAddress,
          phone: ph || null,
          email: em || null,
        },
      ])
      .select("id, first_name, last_name, address, phone, email")
      .single();

    setLoading(false);

    if (error) {
      console.error("Error adding customer:", error);
      alert("Add error: " + JSON.stringify(error));
      return;
    }

    if (data) {
      setCustomers((prev) => [data as Customer, ...prev]);
    }

    setFirstName("");
    setLastName("");
    setStreet("");
    setCity("");
    setAddrState("");
    setZip("");
    setPhone("");
    setEmail("");
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-3xl font-bold">ShadeLogic</h1>
        <p className="mb-6 text-gray-600">Customer measurement tracker</p>

        <form onSubmit={addCustomer} className="mb-8 rounded border p-4">
          <h2 className="mb-4 text-xl font-semibold">Add Customer</h2>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">First Name</label>
              <input
                className="w-full rounded border px-3 py-2"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="John"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Last Name</label>
              <input
                className="w-full rounded border px-3 py-2"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Johnson"
              />
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-sm font-medium">Street Address</label>
            <input
              className="w-full rounded border px-3 py-2"
              value={street}
              onChange={(e) => setStreet(e.target.value)}
              placeholder="123 Main St"
            />
          </div>

          <div className="mb-3 grid grid-cols-[1fr_72px_104px] gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">City</label>
              <input
                className="w-full rounded border px-3 py-2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Salt Lake City"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">State</label>
              <input
                className="w-full rounded border px-3 py-2 uppercase"
                value={addrState}
                onChange={(e) => setAddrState(e.target.value.toUpperCase())}
                placeholder="UT"
                maxLength={2}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Zip</label>
              <input
                className="w-full rounded border px-3 py-2"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                placeholder="84101"
              />
            </div>
          </div>

          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">Phone</label>
              <input
                type="tel"
                className="w-full rounded border px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="801-555-1234"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Email</label>
              <input
                type="email"
                className="w-full rounded border px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="john@example.com"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="rounded bg-black px-4 py-2 text-white disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Customer"}
          </button>
        </form>

        <div className="rounded border p-4">
          <h2 className="mb-4 text-xl font-semibold">Customers</h2>

          {customers.length === 0 ? (
            <p className="text-gray-500">No customers yet.</p>
          ) : (
            <ul className="space-y-3">
              {customers.map((customer) => (
                <li key={customer.id} className="rounded border p-3">
                  <Link
                    href={`/customers/${customer.id}`}
                    className="font-semibold text-blue-600 hover:underline"
                  >
                    {[customer.first_name, customer.last_name].filter(Boolean).join(" ")}
                  </Link>

                  <div className="text-sm text-gray-600">
                    {formatAddressDisplay(customer.address)}
                  </div>

                  {customer.phone && (
                    <div className="text-sm text-gray-600">{customer.phone}</div>
                  )}
                  {customer.email && (
                    <div className="text-sm text-gray-600">{customer.email}</div>
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
