"use client";

import Link from "next/link";
import { useState } from "react";
import { useAuth } from "../auth-provider";

type Step = {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  content: React.ReactNode;
  time: string;
};

export default function SetupGuidePage() {
  const { companyId } = useAuth();
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>("products");

  const emailToken = companyId ? companyId.replace(/-/g, "").slice(0, 12) : "your-token";

  function toggle(id: string) {
    setExpanded(expanded === id ? null : id);
  }

  function markDone(id: string) {
    setCompleted(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const steps: Step[] = [
    {
      id: "products",
      title: "Add Your Products",
      subtitle: "Import your product catalog so you can build quotes fast",
      icon: "📦",
      time: "5 min",
      content: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Your product catalog is the foundation of ShadeLogic. Add the products you sell
            so they auto-fill on every quote with your cost and markup.
          </p>
          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Option 1: CSV Import (fastest)</div>
            <ol className="text-xs text-gray-600 space-y-1 list-decimal ml-4">
              <li>Export your price list from your manufacturer or create a spreadsheet with columns: name, cost, category, manufacturer, sku</li>
              <li>Save as .csv file</li>
              <li>Go to <Link href="/products" className="text-blue-600 hover:underline">Products</Link> → Import → upload your CSV</li>
              <li>Preview and confirm the import</li>
            </ol>
          </div>
          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Option 2: Add manually</div>
            <p className="text-xs text-gray-600">
              Go to <Link href="/products" className="text-blue-600 hover:underline">Products</Link> → + Add Product. Enter the name, your cost, and your markup multiplier.
            </p>
          </div>
          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700">
            💡 Don't worry about getting everything perfect — you can always edit products later. Start with your top 10-20 products.
          </div>
        </div>
      ),
    },
    {
      id: "customer",
      title: "Add Your First Customer",
      subtitle: "Create a customer record and start tracking the lead",
      icon: "👤",
      time: "2 min",
      content: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Every job starts with a customer. Add them from the dashboard and they'll flow through your pipeline.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Go to <Link href="/" className="text-blue-600 hover:underline">Home</Link> → Customers tab → + Add Customer</li>
            <li>Enter their name, phone, email, and address</li>
            <li>Set their lead status (New, Contacted, Scheduled, etc.)</li>
            <li>Set heat score (Hot / Warm / Cold)</li>
          </ol>
          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700">
            💡 Tap the phone number to call, or the text icon to send a message — it auto-logs the activity.
          </div>
        </div>
      ),
    },
    {
      id: "measure",
      title: "Create a Measure Job",
      subtitle: "Measure a customer's windows and track every detail",
      icon: "📐",
      time: "Varies",
      content: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Measure jobs are the core of ShadeLogic. Every window gets measured with fraction validation
            so bad numbers can't be entered.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Open a customer → Measure Jobs → + New Measure Job</li>
            <li>Add rooms, then add windows to each room</li>
            <li>Enter width, height, mount type, casing depth for each window</li>
            <li>Take photos of each window</li>
            <li>Add notes (voice-to-text works great in the field)</li>
          </ol>
          <div className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-700">
            ⚡ Fractions are validated to 1/16" increments — if you enter an invalid fraction, the field clears and refocuses so you can fix it immediately.
          </div>
        </div>
      ),
    },
    {
      id: "quote",
      title: "Build & Send a Quote",
      subtitle: "Pull from measurements, set pricing, and get customer approval",
      icon: "💰",
      time: "5 min",
      content: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Quotes pull directly from your measurements — no retyping. Set your products and pricing,
            then send for customer approval with e-signature.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Open a customer → their measure job → Create Quote</li>
            <li>Click "Pull Windows from Measure" to auto-populate line items</li>
            <li>Assign products from your catalog (or use Quick Add)</li>
            <li>Adjust pricing if needed — margin shows in real time</li>
            <li>Send via text or email — customer gets an approval link</li>
            <li>Customer signs digitally — legally binding with timestamp</li>
          </ol>
        </div>
      ),
    },
    {
      id: "schedule",
      title: "Schedule Appointments",
      subtitle: "Use the calendar to manage your day",
      icon: "📅",
      time: "2 min",
      content: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Every appointment type has a default duration. After each appointment, you must select an outcome
            — this keeps your pipeline moving automatically.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Go to <Link href="/schedule" className="text-blue-600 hover:underline">Schedule</Link> → + New Appointment</li>
            <li>Pick type: Measure, Install, Sales Consult, Service, etc.</li>
            <li>Link to a customer (auto-fills address)</li>
            <li>Send confirmation text to customer</li>
            <li>Day-of: tap "On My Way" to notify customer</li>
            <li>After: select outcome (Measured, Sold, Needs Quote, etc.)</li>
          </ol>
        </div>
      ),
    },
    {
      id: "email",
      title: "Set Up Order Tracking",
      subtitle: "Auto-track shipments by forwarding manufacturer emails",
      icon: "📧",
      time: "5 min",
      content: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            When you place orders with manufacturers, their shipping emails can be automatically
            parsed to update your material status. No manual tracking needed.
          </p>
          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Your unique email address:</div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white border rounded px-2 py-1 font-mono text-blue-700 flex-1 break-all">
                orders-{emailToken}@inbound.postmarkapp.com
              </code>
              <button onClick={() => navigator.clipboard?.writeText(`orders-${emailToken}@inbound.postmarkapp.com`)}
                className="text-xs border rounded px-2 py-1 hover:bg-gray-50 shrink-0">
                Copy
              </button>
            </div>
          </div>

          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Gmail Setup (2 minutes)</div>
            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
              <li>Open Gmail → Settings (gear icon) → See all settings</li>
              <li>Go to "Forwarding and POP/IMAP" tab</li>
              <li>Click "Add a forwarding address"</li>
              <li>Paste: <code className="bg-white border rounded px-1 font-mono">orders-{emailToken}@inbound.postmarkapp.com</code></li>
              <li>Gmail will send a confirmation — once verified, go to Filters</li>
              <li>Create a filter: From contains your manufacturer's email (e.g. "hunterdouglas.com")</li>
              <li>Action: Forward to the address above</li>
              <li>Done! Shipping emails will auto-update your orders.</li>
            </ol>
          </div>

          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">Outlook Setup (2 minutes)</div>
            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
              <li>Open Outlook → Settings → Mail → Rules</li>
              <li>Click "+ Add new rule"</li>
              <li>Name it "ShadeLogic Order Tracking"</li>
              <li>Condition: "From" contains your manufacturer's email</li>
              <li>Action: "Forward to" → paste: <code className="bg-white border rounded px-1 font-mono">orders-{emailToken}@inbound.postmarkapp.com</code></li>
              <li>Save the rule. Done!</li>
            </ol>
          </div>

          <div className="rounded bg-gray-50 p-3 space-y-2">
            <div className="font-medium text-xs text-gray-800">How it works after setup:</div>
            <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
              <li>You place an order with the manufacturer (by phone, web, etc.)</li>
              <li>Upload the order confirmation PDF in your quote's Materials tab</li>
              <li>ShadeLogic extracts the order number and expected packages</li>
              <li>When shipping/delivery emails come in, they auto-match to your order</li>
              <li>Package status updates automatically: Ordered → Shipped → Received</li>
              <li>When all packages arrive, you get a "Ready to schedule install" alert</li>
            </ol>
          </div>

          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700">
            💡 You can add forwarding rules for multiple manufacturers. Each one's emails will be matched to the right order automatically.
          </div>
        </div>
      ),
    },
    {
      id: "team",
      title: "Invite Your Team",
      subtitle: "Add installers, sales reps, and office staff",
      icon: "👥",
      time: "2 min",
      content: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Each team member gets their own login with role-based permissions. Installers can't see pricing,
            sales reps can't change settings, etc.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Go to <Link href="/settings" className="text-blue-600 hover:underline">Settings</Link> → Team section</li>
            <li>Copy the invite link and send it to your team member</li>
            <li>They sign up using that link — automatically joins your company</li>
            <li>Set their role (Installer, Sales, Office, etc.)</li>
            <li>Customize individual permissions if the preset doesn't fit</li>
          </ol>
          <div className="rounded bg-gray-50 p-3 text-xs">
            <div className="font-medium text-gray-800 mb-1">Role Quick Reference:</div>
            <div className="grid grid-cols-2 gap-1 text-gray-600">
              <div><strong>Owner</strong> — Full access to everything</div>
              <div><strong>Lead Sales</strong> — Customers, quotes, pricing, reports</div>
              <div><strong>Sales Rep</strong> — Customers, quotes, pricing, schedule</div>
              <div><strong>Office Staff</strong> — Customers, schedule, materials</div>
              <div><strong>Installer</strong> — Install view only, no pricing</div>
              <div><strong>Warehouse</strong> — Materials tracking only</div>
              <div><strong>Scheduler</strong> — Calendar and customer names only</div>
              <div><strong>Accounting</strong> — Pricing, financials, reports</div>
            </div>
          </div>
          <div className="rounded bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700">
            💡 You can override any permission on a per-person basis. The role just sets the starting point.
          </div>
        </div>
      ),
    },
    {
      id: "settings",
      title: "Set Up Your Company Info",
      subtitle: "Add your business details, defaults, and branding",
      icon: "⚙️",
      time: "3 min",
      content: (
        <div className="space-y-3 text-sm">
          <p className="text-gray-600">
            Your company info shows on quotes and customer communications. Set your defaults once
            and they apply everywhere.
          </p>
          <ol className="text-xs text-gray-600 space-y-1.5 list-decimal ml-4">
            <li>Go to <Link href="/settings" className="text-blue-600 hover:underline">Settings</Link></li>
            <li>Fill in your company name, phone, email, address</li>
            <li>Set your default deposit percentage (e.g. 50%)</li>
            <li>Set your default markup multiplier (e.g. 2.5x)</li>
            <li>Set quote validity days (e.g. 30 days)</li>
            <li>Add your Google Review link for post-install follow-ups</li>
          </ol>
        </div>
      ),
    },
  ];

  const completedCount = completed.size;
  const totalSteps = steps.length;
  const progressPct = Math.round((completedCount / totalSteps) * 100);

  return (
    <main className="min-h-screen bg-white p-4 text-black text-sm pb-16">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="mb-4">
          <Link href="/" className="text-blue-600 hover:underline text-xs">← Home</Link>
          <h1 className="text-xl font-bold mt-2">Getting Started</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Follow these steps to get your ShadeLogic account up and running.
          </p>
        </div>

        {/* Progress bar */}
        <div className="rounded-lg border p-3 mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700">{completedCount} of {totalSteps} steps complete</span>
            <span className="text-xs text-gray-400">{progressPct}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }} />
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-2">
          {steps.map(step => {
            const isDone = completed.has(step.id);
            const isOpen = expanded === step.id;
            return (
              <div key={step.id} className={`rounded-lg border transition-colors ${isDone ? "border-green-200 bg-green-50/30" : ""}`}>
                <button onClick={() => toggle(step.id)}
                  className="w-full flex items-center gap-3 px-3 py-3 text-left">
                  <button onClick={(e) => { e.stopPropagation(); markDone(step.id); }}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${isDone ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-green-400"}`}>
                    {isDone && <span className="text-xs">✓</span>}
                  </button>
                  <div className="text-xl shrink-0">{step.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-medium text-sm ${isDone ? "line-through text-gray-400" : ""}`}>{step.title}</div>
                    <div className="text-xs text-gray-400">{step.subtitle}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-300">{step.time}</span>
                    <span className="text-xs text-gray-300">{isOpen ? "▾" : "▸"}</span>
                  </div>
                </button>
                {isOpen && (
                  <div className="px-3 pb-3 pl-14">
                    {step.content}
                    {!isDone && (
                      <button onClick={() => markDone(step.id)}
                        className="mt-3 text-xs bg-green-600 text-white rounded px-3 py-1.5 hover:bg-green-700">
                        Mark as Done
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* All done */}
        {completedCount === totalSteps && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 mt-4 text-center space-y-2">
            <div className="text-2xl">🎉</div>
            <div className="font-bold text-green-800">You're all set!</div>
            <p className="text-xs text-green-600">
              Your ShadeLogic account is fully configured. You can always come back here if you need a refresher.
            </p>
            <Link href="/" className="inline-block text-sm text-green-700 font-medium hover:underline mt-1">
              Go to Dashboard →
            </Link>
          </div>
        )}

        {/* FAQ */}
        <div className="mt-6 rounded-lg border p-3">
          <h2 className="font-semibold text-sm mb-2">Frequently Asked Questions</h2>
          <div className="space-y-2">
            {[
              { q: "Can my team see each other's data?", a: "Everyone on your team shares the same customer and job data. Permissions control what features they can access (e.g. installers can't see pricing), but all team members work from the same pool of customers and jobs." },
              { q: "How does the email order tracking work?", a: "You set up email forwarding rules in your Gmail or Outlook so that manufacturer emails get forwarded to your unique ShadeLogic address. The system reads the emails and auto-updates your order status. You never need to manually check tracking." },
              { q: "Can I change a team member's permissions?", a: "Yes. Go to Settings → Team → click Edit on any user. You can change their role (which sets preset permissions) or toggle individual permissions on/off." },
              { q: "What happens if I enter a wrong measurement?", a: "Measurements are validated to 1/16\" increments — bad fractions get rejected immediately. If you need to fix a measurement after the fact, you can edit it and the change is tracked." },
              { q: "How do I get my products into the system fast?", a: "Use CSV Import on the Products page. Export your manufacturer price list as a CSV, upload it, and products are created in bulk. You can also download our CSV template to see the expected format." },
            ].map((faq, i) => (
              <details key={i} className="group">
                <summary className="text-xs font-medium text-gray-700 cursor-pointer hover:text-black py-1">
                  {faq.q}
                </summary>
                <p className="text-xs text-gray-500 mt-1 ml-2 pb-1">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
