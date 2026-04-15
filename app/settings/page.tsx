"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type Settings = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  website: string | null;
  license_number: string | null;
  tagline: string | null;
  default_deposit_pct: number;
  default_markup: number;
  default_quote_days: number;
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved,    setSaved]    = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from("company_settings").select("*").limit(1).single();
    if (data) setSettings(data as Settings);
    setLoading(false);
  }

  async function save(field: keyof Settings, value: string | number | null) {
    if (!settings) return;
    await supabase.from("company_settings").update({ [field]: value }).eq("id", settings.id);
    setSettings(prev => prev ? { ...prev, [field]: value } : prev);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function Field({ label, field, type = "text", placeholder = "" }: {
    label: string; field: keyof Settings; type?: string; placeholder?: string;
  }) {
    const val = settings ? (settings[field] ?? "") : "";
    return (
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">{label}</label>
        <input
          type={type}
          defaultValue={String(val)}
          onBlur={e => {
            const v = e.target.value.trim();
            save(field, type === "number" ? parseFloat(v) || 0 : v || null);
          }}
          placeholder={placeholder}
          className="w-full border rounded px-2 py-1.5 text-sm"
        />
      </div>
    );
  }

  if (loading) return <div className="p-4 text-sm text-gray-400">Loading…</div>;
  if (!settings) return <div className="p-4 text-sm text-gray-400">No settings found. Run the phase9 SQL first.</div>;

  return (
    <main className="min-h-screen bg-white p-4 text-black text-sm">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Company Settings</h1>
          {saved && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
        </div>
        <p className="text-xs text-gray-400">This information appears on your PDF quotes and customer-facing documents.</p>

        {/* Company info */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Company</h2>
          <Field label="Company Name *" field="name" placeholder="Aspen Blinds" />
          <Field label="Tagline" field="tagline" placeholder="Window Treatments for Every Home" />
          <Field label="License # (optional)" field="license_number" placeholder="Utah Contractor #12345" />
        </div>

        {/* Contact */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Contact</h2>
          <Field label="Phone" field="phone" type="tel" placeholder="801-555-1234" />
          <Field label="Email" field="email" type="email" placeholder="info@aspenblinds.com" />
          <Field label="Website" field="website" placeholder="www.aspenblinds.com" />
        </div>

        {/* Address */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Address</h2>
          <Field label="Street" field="address" placeholder="123 Main St" />
          <div className="grid grid-cols-[1fr_56px_88px] gap-2">
            <Field label="City" field="city" placeholder="Orem" />
            <Field label="State" field="state" placeholder="UT" />
            <Field label="Zip" field="zip" placeholder="84057" />
          </div>
        </div>

        {/* Defaults */}
        <div className="rounded border p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quote Defaults</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Deposit %</label>
              <input type="number" min="0" max="100"
                defaultValue={settings.default_deposit_pct}
                onBlur={e => save("default_deposit_pct", parseFloat(e.target.value) || 50)}
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Default Markup</label>
              <input type="number" min="1" step="0.01"
                defaultValue={settings.default_markup}
                onBlur={e => save("default_markup", parseFloat(e.target.value) || 2.5)}
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Quote Valid (days)</label>
              <input type="number" min="1"
                defaultValue={settings.default_quote_days}
                onBlur={e => save("default_quote_days", parseInt(e.target.value) || 30)}
                className="w-full border rounded px-2 py-1.5 text-sm" />
            </div>
          </div>
          <p className="text-xs text-gray-400">These pre-fill on every new quote but can be changed per job.</p>
        </div>
      </div>
    </main>
  );
}
