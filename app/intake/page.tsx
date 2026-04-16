"use client";

// Public lead intake form — share the link on your website, social, or in texts.
// Submissions land directly as new leads in your dashboard.

import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

type Company = { name: string; phone: string | null; tagline: string | null };

const WINDOW_TYPES = ["Roller / Solar Shades", "Shutters", "Drapery / Panels", "Motorized / Smart Shades", "Not sure yet"];
const HOW_HEARD   = ["Referral", "Google", "Facebook / Instagram", "Door Hanger", "Drove By", "Other"];

export default function IntakePage() {
  const [company,    setCompany]    = useState<Company | null>(null);
  const [submitted,  setSubmitted]  = useState(false);
  const [saving,     setSaving]     = useState(false);

  const [firstName,  setFirstName]  = useState("");
  const [lastName,   setLastName]   = useState("");
  const [phone,      setPhone]      = useState("");
  const [email,      setEmail]      = useState("");
  const [street,     setStreet]     = useState("");
  const [city,       setCity]       = useState("");
  const [state,      setState]      = useState("");
  const [zip,        setZip]        = useState("");
  const [products,   setProducts]   = useState<string[]>([]);
  const [notes,      setNotes]      = useState("");
  const [howHeard,   setHowHeard]   = useState("");
  const [timeline,   setTimeline]   = useState("");

  useEffect(() => {
    supabase.from("company_settings").select("name, phone, tagline").limit(1).single()
      .then(({ data }) => { if (data) setCompany(data as Company); });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !phone.trim()) return;
    setSaving(true);

    const address = [street, city, state, zip].some(Boolean)
      ? `${street}|${city}|${state}|${zip}`
      : null;

    const notesText = [
      products.length > 0 ? `Interested in: ${products.join(", ")}` : "",
      timeline ? `Timeline: ${timeline}` : "",
      howHeard  ? `How they heard: ${howHeard}` : "",
      notes     ? `Notes: ${notes}` : "",
    ].filter(Boolean).join("\n");

    const leadSource = HOW_HEARD.includes(howHeard)
      ? howHeard === "Google" ? "Google"
      : howHeard === "Referral" ? "Referral"
      : howHeard === "Facebook / Instagram" ? "Facebook"
      : "Other"
      : "Website";

    const { data: cust, error } = await supabase.from("customers")
      .insert([{
        first_name:   firstName.trim(),
        last_name:    lastName.trim(),
        phone:        phone.trim(),
        email:        email.trim() || null,
        address,
        lead_status:  "New",
        heat_score:   "Warm",
        lead_source:  leadSource,
        next_action:  "Call or text to make first contact",
      }])
      .select("id").single();

    if (!error && cust) {
      // Log the intake details as an activity
      if (notesText) {
        await supabase.from("activity_log").insert([{
          customer_id: cust.id, type: "note",
          notes: `Lead intake form submitted.\n${notesText}`,
          created_by: "Intake Form",
        }]);
      }
    }

    setSaving(false);
    setSubmitted(true);
  }

  if (submitted) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold">{company?.name ?? "Thanks!"}</h1>
        <p className="text-gray-600">
          We received your request and will be in touch shortly to schedule a free consultation.
        </p>
        {company?.phone && (
          <a href={`tel:${company.phone.replace(/\D/g,"")}`}
            className="inline-block rounded-xl bg-black text-white px-6 py-3 font-medium">
            Call us: {company.phone}
          </a>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-4 py-4 text-center">
        <div className="font-bold text-xl">{company?.name ?? "ZeroRemake"}</div>
        {company?.tagline && <div className="text-xs text-gray-400 mt-0.5">{company.tagline}</div>}
      </div>

      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold">Get a Free Quote</h1>
          <p className="text-sm text-gray-500 mt-1">
            Fill out this form and we'll reach out to schedule a free in-home consultation.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">First Name *</label>
              <input value={firstName} onChange={e => setFirstName(e.target.value)} required
                placeholder="John" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Last Name *</label>
              <input value={lastName} onChange={e => setLastName(e.target.value)} required
                placeholder="Smith" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Phone *</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
              placeholder="801-555-1234" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="john@example.com" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Street Address</label>
            <input value={street} onChange={e => setStreet(e.target.value)}
              placeholder="123 Main St" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div className="grid grid-cols-[1fr_56px_88px] gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">City</label>
              <input value={city} onChange={e => setCity(e.target.value)}
                placeholder="Orem" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">State</label>
              <input value={state} onChange={e => setState(e.target.value.toUpperCase())} maxLength={2}
                placeholder="UT" className="w-full border rounded-xl px-3 py-2.5 text-sm uppercase" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Zip</label>
              <input value={zip} onChange={e => setZip(e.target.value)}
                placeholder="84057" className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          {/* Products */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-2">What are you interested in?</label>
            <div className="flex flex-wrap gap-2">
              {WINDOW_TYPES.map(t => (
                <button key={t} type="button"
                  onClick={() => setProducts(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                  className={`rounded-full px-3 py-1.5 text-xs border transition-colors ${
                    products.includes(t) ? "bg-black text-white border-black" : "bg-white text-gray-600 border-gray-300"
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">When are you looking to get this done?</label>
            <select value={timeline} onChange={e => setTimeline(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm">
              <option value="">— Select —</option>
              <option>As soon as possible</option>
              <option>Within 1 month</option>
              <option>1–3 months</option>
              <option>Just exploring</option>
            </select>
          </div>

          {/* How heard */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">How did you hear about us?</label>
            <select value={howHeard} onChange={e => setHowHeard(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm">
              <option value="">— Select —</option>
              {HOW_HEARD.map(h => <option key={h}>{h}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Anything else we should know?</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Number of windows, special requests, etc."
              className="w-full border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <button type="submit" disabled={saving}
            className="w-full bg-black text-white rounded-xl py-3.5 text-base font-semibold disabled:opacity-50">
            {saving ? "Submitting…" : "Request Free Consultation →"}
          </button>

          <p className="text-xs text-center text-gray-400">
            We'll reach out within 24 hours. No spam, ever.
          </p>
        </form>
      </div>
    </div>
  );
}
