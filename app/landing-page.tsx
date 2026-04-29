"use client";

import Link from "next/link";
import { useState } from "react";
import { ZRIcon } from "./zr-logo";

/* ───────────────────────────────────────────────────────────
   ZeroRemake Landing Page
   Target audience: solo window treatment installers,
   husband-wife teams, small blind & shade businesses.
   ─────────────────────────────────────────────────────────── */

type FeatureIconKey =
  | "crm"
  | "measure"
  | "order"
  | "schedule"
  | "invoice"
  | "analytics";

const FEATURES: { icon: FeatureIconKey; title: string; desc: string }[] = [
  {
    icon: "crm",
    title: "CRM Built for Blinds",
    desc: "Track every lead from first call to final install. Heat scores, pipeline stages, and automatic follow-up reminders keep nothing falling through the cracks.",
  },
  {
    icon: "measure",
    title: "Measure & Quote",
    desc: "Capture window measurements on-site, build accurate quotes with real product specs, and send them for e-signature — all from your phone.",
  },
  {
    icon: "order",
    title: "Order & Inventory Tracking",
    desc: "Know exactly when product ships, which boxes arrived, where they're stored, and whether everything matches what you ordered. No more hunting through the warehouse.",
  },
  {
    icon: "schedule",
    title: "Scheduling & Installs",
    desc: "Calendar for measures and installs. Your crew sees their jobs, customers get reminders, and nobody shows up to an install that isn't ready.",
  },
  {
    icon: "invoice",
    title: "Invoicing & Payments",
    desc: "Generate invoices, collect deposits, and get paid online with Stripe. Track who owes you what and stop chasing balances over text.",
  },
  {
    icon: "analytics",
    title: "Analytics Dashboard",
    desc: "Close rate, pipeline value, revenue trends, and team performance — the numbers that actually tell you if things are working, not buried in spreadsheets.",
  },
];

function FeatureIcon({ kind }: { kind: FeatureIconKey }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (kind) {
    case "crm":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="4" />
          <path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1" />
          <path d="M17 11a3 3 0 0 0 0-6" />
          <path d="M22 21v-1a4 4 0 0 0-3-3.87" />
        </svg>
      );
    case "measure":
      return (
        <svg {...common}>
          <path d="M21.3 13.8 10.2 2.7a1 1 0 0 0-1.4 0L2.7 8.8a1 1 0 0 0 0 1.4l11.1 11.1a1 1 0 0 0 1.4 0l6.1-6.1a1 1 0 0 0 0-1.4Z" />
          <path d="M7 9l1.5 1.5M10 6l1.5 1.5M13 9l1.5 1.5M10 12l1.5 1.5" />
        </svg>
      );
    case "order":
      return (
        <svg {...common}>
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <path d="m3.3 7 8.7 5 8.7-5" />
          <path d="M12 22V12" />
        </svg>
      );
    case "schedule":
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      );
    case "invoice":
      return (
        <svg {...common}>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6" />
          <path d="M8 13h6M8 17h4" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...common}>
          <path d="M3 3v18h18" />
          <path d="M7 14v4" />
          <path d="M12 10v8" />
          <path d="M17 6v12" />
        </svg>
      );
  }
}

const PLANS = [
  {
    name: "Starter",
    price: 49,
    users: "1 user",     // phrasing for "Includes {plan.users}"
    desc: "Perfect for solo installers",
    features: ["CRM & Lead Management", "Scheduling & Calendar", "Quoting & E-Signatures", "Invoicing & Payments", "Mobile-Ready (works on iPhone)"],
    cta: "Start Free Trial",
    highlight: false,
  },
  {
    name: "Professional",
    price: 99,
    users: "up to 3 users",
    desc: "For growing teams",
    features: ["Everything in Starter", "Inventory & Order Tracking", "Analytics Dashboard", "Warehouse Location Tracking", "Job Materials Checklist", "Email Parsing for Shipments"],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    name: "Business",
    price: 199,
    users: "up to 5 users",
    desc: "For established operations",
    features: ["Everything in Professional", "Builder/Contractor Portal", "Workflow Automation", "White-Label Branding", "Team Payroll Tracking", "Priority Support"],
    cta: "Start Free Trial",
    highlight: false,
  },
];

const TESTIMONIAL_PLACEHOLDERS = [
  {
    quote: "I used to track everything in a notebook and my head. Now I pull up my phone and everything is right there — measurements, quotes, install schedule. Game changer.",
    name: "Solo Installer",
    role: "Beta Tester",
  },
  {
    quote: "My wife handles sales and I do installs. We finally have one place where we both see the same info. No more texting back and forth about what's ordered.",
    name: "Husband & Wife Team",
    role: "Beta Tester",
  },
];

export function LandingPage() {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const faqs = [
    {
      q: "Do I need to install an app?",
      a: "No app store needed. ZeroRemake is a web app that works great in your phone's browser. Save it to your home screen on iPhone or Android and it looks and feels just like a native app.",
    },
    {
      q: "I'm just one person — is this overkill?",
      a: "Not at all. ZeroRemake was built for solo operators first. The Starter plan gives you a CRM, scheduling, quoting, and invoicing for $49/mo. Most solo installers make that back on the first job they don't lose track of.",
    },
    {
      q: "Can I try it before paying?",
      a: "Yes. Every plan comes with a free 14-day trial with full access to all features.",
    },
    {
      q: "What about my existing customers?",
      a: "You can add customers manually or we can help you import from a spreadsheet. Most people start entering new leads and backfill as they go.",
    },
    {
      q: "Does it work for shutters, shades, and blinds?",
      a: "Yes. ZeroRemake works with any window treatment product. The manufacturer spec library covers major brands and you can add your own.",
    },
  ];

  // ── JSON-LD structured data (SoftwareApplication + Organization + FAQPage) ──
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://zeroremake.com/#organization",
        name: "ZeroRemake",
        url: "https://zeroremake.com",
        logo: "https://zeroremake.com/icon-512.png",
        email: "support@zeroremake.com",
        description:
          "Business management software for window treatment professionals — CRM, measuring, quoting, scheduling, order tracking, and invoicing.",
        sameAs: ["https://www.facebook.com/zeroremake/"],
      },
      {
        "@type": "SoftwareApplication",
        "@id": "https://zeroremake.com/#software",
        name: "ZeroRemake",
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "CRM & Field Service Management",
        operatingSystem: "Web, iOS, Android",
        url: "https://zeroremake.com",
        description:
          "All-in-one software for blinds, shades, and shutter installers: CRM, quoting, scheduling, inventory tracking, and invoicing — all mobile-first.",
        offers: PLANS.map((p) => ({
          "@type": "Offer",
          name: `${p.name} plan`,
          price: p.price,
          priceCurrency: "USD",
          priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: p.price,
            priceCurrency: "USD",
            unitText: "MONTH",
          },
          description: `${p.desc} (${p.users})`,
          category: "subscription",
          availability: "https://schema.org/InStock",
        })),
        featureList: FEATURES.map((f) => f.title).join(", "),
        publisher: { "@id": "https://zeroremake.com/#organization" },
      },
      {
        "@type": "FAQPage",
        "@id": "https://zeroremake.com/#faq",
        mainEntity: faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <div style={{ background: "#ffffff", color: "#111827" }}>
      {/* JSON-LD for Google rich results */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* ── Sticky Nav ── */}
      <nav
        className="sticky top-0 z-50 border-b"
        style={{ background: "rgba(255,255,255,0.95)", backdropFilter: "blur(12px)", borderColor: "#e5e7eb" }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="inline-flex items-center gap-2.5 select-none">
            <ZRIcon size={32} />
            <span className="font-black text-lg tracking-tight" style={{ fontFamily: "var(--zr-font-display)" }}>
              Zero<span style={{ color: "var(--zr-orange)" }}>Remake</span>
            </span>
          </span>
          <div className="flex items-center gap-3">
            <Link
              href="/audit"
              className="hidden sm:inline-block text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: "var(--zr-orange)" }}
            >
              Free Audit
            </Link>
            <Link
              href="/login"
              className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: "#4b5563" }}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
              style={{ background: "var(--zr-orange)", color: "#fff" }}
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="px-4 pt-16 pb-14 text-center">
        <div className="mx-auto max-w-3xl">
          <div
            className="mb-5 inline-block rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
            style={{ background: "#fef2f2", color: "var(--zr-orange)", letterSpacing: "2px" }}
          >
            Built for window treatment pros
          </div>
          <h1
            className="text-4xl font-black leading-[1.08] sm:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--zr-font-display)", color: "#111827", letterSpacing: "-0.02em" }}
          >
            Stop losing jobs, orders,
            <br />
            and customers in the chaos.
          </h1>
          <h2
            className="mt-3 text-2xl font-black sm:text-3xl lg:text-4xl"
            style={{ fontFamily: "var(--zr-font-display)", color: "var(--zr-orange)", letterSpacing: "-0.02em", lineHeight: 1.15 }}
          >
            Run your entire blinds business from your phone.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg" style={{ color: "#4b5563", lineHeight: 1.6 }}>
            Leads, measures, quotes, orders, installs, and invoices —
            all in one place, all from your pocket.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-base font-bold transition-all shadow-lg"
              style={{ background: "var(--zr-orange)", color: "#fff", boxShadow: "0 4px 14px rgba(230,48,0,0.3)" }}
            >
              Start Your Free 14-Day Trial
            </Link>
            <Link
              href="/audit"
              className="inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-base font-medium border transition-colors"
              style={{ borderColor: "#d1d5db", color: "#374151" }}
            >
              Free Website Check
            </Link>
          </div>
          <p className="mt-4 text-xs" style={{ color: "#9ca3af" }}>
            Works on iPhone, Android &amp; desktop. No app download needed.
          </p>
        </div>
      </section>

      {/* ── Operator positioning line — credibility bridge between hero and rest of page ── */}
      <section className="px-4 pb-16 pt-2 text-center">
        <p
          className="mx-auto max-w-2xl text-base leading-relaxed sm:text-[17px]"
          style={{ color: "#374151", fontStyle: "italic" }}
        >
          Built from real audits of window treatment businesses — by someone
          who&apos;s run installs, managed teams, and fixed the problems
          you&apos;re dealing with.
        </p>
      </section>

      {/* ── Social Proof Banner ── */}
      <section className="border-y py-6" style={{ background: "#f9fafb", borderColor: "#e5e7eb" }}>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-4 text-center">
          <div>
            <div className="text-2xl font-black" style={{ color: "var(--zr-orange)" }}>14 days</div>
            <div className="text-xs font-medium" style={{ color: "#6b7280" }}>Free trial, full access</div>
          </div>
          <div style={{ width: 1, height: 32, background: "#e5e7eb" }} />
          <div>
            <div className="text-2xl font-black" style={{ color: "#111827" }}>$49</div>
            <div className="text-xs font-medium" style={{ color: "#6b7280" }}>Starting price per month</div>
          </div>
          <div style={{ width: 1, height: 32, background: "#e5e7eb" }} />
          <div>
            <div className="text-2xl font-black" style={{ color: "#111827" }}>100%</div>
            <div className="text-xs font-medium" style={{ color: "#6b7280" }}>Mobile-first design</div>
          </div>
          <div style={{ width: 1, height: 32, background: "#e5e7eb" }} />
          <div>
            <div className="text-2xl font-black" style={{ color: "#111827" }}>0</div>
            <div className="text-xs font-medium" style={{ color: "#6b7280" }}>App store downloads needed</div>
          </div>
        </div>
      </section>

      {/* ── Pain Point — plain list, not a grid of UI cards ── */}
      <section className="px-4 py-20">
        <div className="mx-auto max-w-2xl">
          <h2
            className="text-2xl font-bold sm:text-3xl text-center"
            style={{ fontFamily: "var(--zr-font-display)", letterSpacing: "-0.02em" }}
          >
            If this sounds like your day…
          </h2>
          <ul className="mt-10 space-y-5 text-left">
            {[
              "You’re tracking leads in your head or a notebook",
              "You’ve lost track of orders or shipments",
              "You’re texting measurements from the job site",
              "You’re digging through the garage for the right boxes",
            ].map((pain, i, arr) => (
              <li
                key={i}
                className="flex items-start gap-4 pb-5"
                style={{
                  borderBottom: i < arr.length - 1 ? "1px solid #f3f4f6" : "none",
                }}
              >
                <span
                  aria-hidden="true"
                  className="mt-[11px] shrink-0"
                  style={{
                    display: "inline-block",
                    width: 6,
                    height: 6,
                    borderRadius: 999,
                    background: "var(--zr-orange)",
                  }}
                />
                <span
                  className="text-[17px] leading-relaxed"
                  style={{ color: "#1f2937" }}
                >
                  {pain}
                </span>
              </li>
            ))}
          </ul>
          <p
            className="mt-10 text-center text-xl font-bold sm:text-2xl"
            style={{
              fontFamily: "var(--zr-font-display)",
              color: "#111827",
              letterSpacing: "-0.015em",
            }}
          >
            That&apos;s exactly what ZeroRemake fixes.
          </p>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="px-4 py-16" style={{ background: "#f9fafb" }}>
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl" style={{ fontFamily: "var(--zr-font-display)" }}>
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="mt-3 text-base" style={{ color: "#6b7280" }}>
              Sale to install, all in your pocket.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="rounded-xl p-6 transition-shadow hover:shadow-md"
                style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
              >
                <div
                  className="mb-4 inline-flex items-center justify-center"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 12,
                    background: "rgba(214,90,49,0.10)",
                    color: "var(--zr-orange)",
                  }}
                >
                  <FeatureIcon kind={f.icon} />
                </div>
                <h3 className="text-base font-bold mb-2" style={{ color: "#111827" }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "#6b7280" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl mb-12" style={{ fontFamily: "var(--zr-font-display)" }}>
            Up and running in minutes
          </h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {[
              { step: "1", title: "Sign up", desc: "Create your account in 30 seconds. No app store, no download — it runs in your browser." },
              { step: "2", title: "Add your first lead", desc: "Type in a customer and you’re rolling. Save it to your phone’s home screen and it acts like a native app." },
              { step: "3", title: "Measure, quote, install", desc: "Run one real job through it. You’ll know by the end of the day whether it belongs in your business." },
            ].map((s, i) => (
              <div key={i} className="flex flex-col items-center">
                <div
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-full text-lg font-black"
                  style={{ background: "var(--zr-orange)", color: "#fff" }}
                >
                  {s.step}
                </div>
                <h3 className="text-base font-bold mb-1">{s.title}</h3>
                <p className="text-sm" style={{ color: "#6b7280" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials (placeholder for beta feedback) ── */}
      <section className="px-4 py-16" style={{ background: "#f9fafb" }}>
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl font-bold sm:text-3xl text-center mb-10" style={{ fontFamily: "var(--zr-font-display)" }}>
            What pros are saying
          </h2>
          <div className="grid gap-6 sm:grid-cols-2">
            {TESTIMONIAL_PLACEHOLDERS.map((t, i) => (
              <div
                key={i}
                className="rounded-xl p-6"
                style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
              >
                <p className="text-sm leading-relaxed mb-4" style={{ color: "#374151", fontStyle: "italic" }}>
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold"
                    style={{ background: "#fee2e2", color: "var(--zr-orange)" }}
                  >
                    {t.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{t.name}</div>
                    <div className="text-xs" style={{ color: "#9ca3af" }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="px-4 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl" style={{ fontFamily: "var(--zr-font-display)" }}>
              Simple, honest pricing
            </h2>
            <p className="mt-3 text-base" style={{ color: "#6b7280" }}>
              14-day free trial on every plan. Cancel anytime.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {PLANS.map((plan, i) => (
              <div
                key={i}
                className="relative flex flex-col rounded-2xl p-6"
                style={{
                  background: plan.highlight ? "#111827" : "#ffffff",
                  border: plan.highlight ? "2px solid var(--zr-orange)" : "1px solid #e5e7eb",
                  color: plan.highlight ? "#ffffff" : "#111827",
                }}
              >
                {plan.highlight && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold uppercase tracking-wider"
                    style={{ background: "var(--zr-orange)", color: "#fff" }}
                  >
                    Most Popular
                  </div>
                )}
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <p className="text-xs mt-1" style={{ color: plan.highlight ? "#9ca3af" : "#6b7280" }}>
                  {plan.desc}
                </p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-black">${plan.price}</span>
                  <span className="text-sm" style={{ color: plan.highlight ? "#9ca3af" : "#6b7280" }}>/mo</span>
                </div>
                <p className="mt-1 text-xs whitespace-nowrap" style={{ color: plan.highlight ? "#9ca3af" : "#9ca3af" }}>
                  Includes {plan.users}
                </p>
                <p className="text-xs" style={{ color: plan.highlight ? "#9ca3af" : "#9ca3af" }}>
                  +$25/mo per additional user
                </p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-2.5 text-sm">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke={plan.highlight ? "#4ade80" : "#16a34a"}
                        strokeWidth="2.25"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-[3px] shrink-0"
                        aria-hidden="true"
                      >
                        <path d="M4 10.5 L8 14 L16 6" />
                      </svg>
                      <span style={{ color: plan.highlight ? "#d1d5db" : "#374151" }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/signup"
                  className="mt-6 block w-full rounded-xl py-3 text-center text-sm font-bold transition-colors"
                  style={{
                    background: plan.highlight ? "var(--zr-orange)" : "#111827",
                    color: "#fff",
                  }}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="px-4 py-16" style={{ background: "#f9fafb" }}>
        <div className="mx-auto max-w-2xl">
          <h2 className="text-2xl font-bold text-center mb-10" style={{ fontFamily: "var(--zr-font-display)" }}>
            Frequently asked questions
          </h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden"
                style={{ background: "#ffffff", border: "1px solid #e5e7eb" }}
              >
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold"
                  style={{ color: "#111827" }}
                >
                  {faq.q}
                  <span
                    className="ml-3 shrink-0 text-lg transition-transform"
                    style={{ transform: faqOpen === i ? "rotate(45deg)" : "rotate(0deg)", color: "#9ca3af" }}
                  >
                    +
                  </span>
                </button>
                {faqOpen === i && (
                  <div className="px-5 pb-4 text-sm leading-relaxed" style={{ color: "#6b7280" }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-4 py-20 text-center" style={{ background: "#111827" }}>
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl font-black sm:text-4xl" style={{ fontFamily: "var(--zr-font-display)", color: "#ffffff" }}>
            Ready to stop winging it?
          </h2>
          <p className="mt-4 text-base" style={{ color: "#9ca3af" }}>
            Join the window treatment pros who are running their business from their phone.
            Free for 14 days. Cancel anytime.
          </p>
          <Link
            href="/signup"
            className="mt-8 inline-flex items-center justify-center rounded-xl px-8 py-4 text-lg font-bold transition-all"
            style={{ background: "var(--zr-orange)", color: "#fff", boxShadow: "0 4px 20px rgba(230,48,0,0.4)" }}
          >
            Start Your Free Trial
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t px-4 py-8" style={{ background: "#ffffff", borderColor: "#e5e7eb" }}>
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 sm:flex-row">
          <span className="inline-flex items-center gap-2 text-sm font-bold" style={{ color: "#111827" }}>
            <ZRIcon size={20} />
            ZeroRemake
          </span>
          <div className="flex items-center gap-6 text-sm" style={{ color: "#6b7280" }}>
            <Link href="/login" className="hover:underline">Sign In</Link>
            <Link href="/signup" className="hover:underline">Sign Up</Link>
            <a href="#features" className="hover:underline">Features</a>
            <a href="#pricing" className="hover:underline">Pricing</a>
            <a href="/tools/blinds-vs-shades" className="hover:underline">Blinds vs Shades Decision Engine</a>
            <a href="mailto:support@zeroremake.com" className="hover:underline">Contact</a>
            <a
              href="https://www.facebook.com/zeroremake/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="ZeroRemake on Facebook"
              className="inline-flex items-center gap-1.5 hover:underline"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M24 12.073c0-6.627-5.373-12-12-12S0 5.446 0 12.073c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
              <span>Facebook</span>
            </a>
          </div>
          <p className="text-xs" style={{ color: "#9ca3af" }}>
            &copy; {new Date().getFullYear()} ZeroRemake. All rights reserved.
            {" · "}
            <a href="mailto:support@zeroremake.com" className="hover:underline" style={{ color: "#9ca3af" }}>support@zeroremake.com</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
