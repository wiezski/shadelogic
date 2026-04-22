"use client";

import Link from "next/link";
import { useState } from "react";
import { ZRIcon } from "./zr-logo";

/* ───────────────────────────────────────────────────────────
   ZeroRemake Landing Page
   Target audience: solo window treatment installers,
   husband-wife teams, small blind & shade businesses.
   ─────────────────────────────────────────────────────────── */

const FEATURES = [
  {
    icon: "👥",
    title: "CRM Built for Blinds",
    desc: "Track every lead from first call to final install. Heat scores, pipeline stages, and automatic follow-up reminders keep nothing falling through the cracks.",
  },
  {
    icon: "📐",
    title: "Measure & Quote",
    desc: "Capture window measurements on-site, build accurate quotes with real product specs, and send them for e-signature — all from your phone.",
  },
  {
    icon: "📦",
    title: "Order & Inventory Tracking",
    desc: "Know exactly when product ships, which boxes arrived, where they're stored, and whether everything matches what you ordered. No more hunting through the warehouse.",
  },
  {
    icon: "📅",
    title: "Scheduling & Installs",
    desc: "Schedule measures and installs with calendar sync. Your crew sees their jobs, customers get reminders, and you see the full picture.",
  },
  {
    icon: "💰",
    title: "Invoicing & Payments",
    desc: "Generate invoices, collect deposits, and get paid online with Stripe. Track who owes what and automate payment reminders.",
  },
  {
    icon: "📊",
    title: "Analytics Dashboard",
    desc: "See your close rate, revenue trends, pipeline value, and team performance at a glance. Know what's working and what needs attention.",
  },
];

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
      <section className="px-4 pt-16 pb-20 text-center">
        <div className="mx-auto max-w-3xl">
          <div
            className="mb-4 inline-block rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-widest"
            style={{ background: "#fef2f2", color: "var(--zr-orange)", letterSpacing: "2px" }}
          >
            Built for window treatment pros
          </div>
          <h1
            className="text-4xl font-black leading-tight sm:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--zr-font-display)", color: "#111827" }}
          >
            Run your blinds business
            <br />
            <span style={{ color: "var(--zr-orange)" }}>from your phone.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg" style={{ color: "#6b7280", lineHeight: 1.7 }}>
            CRM, quoting, scheduling, order tracking, and invoicing — everything a solo installer
            or small team needs to go from sale to install without the chaos.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-base font-bold transition-all shadow-lg"
              style={{ background: "var(--zr-orange)", color: "#fff", boxShadow: "0 4px 14px rgba(230,48,0,0.3)" }}
            >
              Start Your Free 14-Day Trial
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-base font-medium border transition-colors"
              style={{ borderColor: "#d1d5db", color: "#374151" }}
            >
              See Features
            </a>
          </div>
          <p className="mt-4 text-xs" style={{ color: "#9ca3af" }}>
            Works on iPhone, Android & desktop. No app download needed.
          </p>
        </div>
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

      {/* ── Pain Point ── */}
      <section className="px-4 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold sm:text-3xl" style={{ fontFamily: "var(--zr-font-display)" }}>
            Sound familiar?
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 text-left">
            {[
              "Tracking leads in a notebook (or your head)",
              "Texting your spouse measurements from the job site",
              "Losing track of which orders shipped and which didn't",
              "Hunting through the garage for the right boxes before an install",
              "Manually writing up quotes and chasing down deposits",
              "No idea what your close rate or pipeline looks like",
            ].map((pain, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg p-4"
                style={{ background: "#fef2f2", border: "1px solid #fecaca" }}
              >
                <span className="mt-0.5 text-base" style={{ color: "var(--zr-orange)" }}>✗</span>
                <span className="text-sm font-medium" style={{ color: "#991b1b" }}>{pain}</span>
              </div>
            ))}
          </div>
          <div
            className="mt-8 rounded-xl p-6"
            style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
          >
            <p className="text-lg font-bold" style={{ color: "#166534" }}>
              ZeroRemake replaces all of that with one app.
            </p>
            <p className="mt-1 text-sm" style={{ color: "#15803d" }}>
              Built specifically for window treatment pros — not generic contractor software that doesn't understand your workflow.
            </p>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section id="features" className="px-4 py-16" style={{ background: "#f9fafb" }}>
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold sm:text-3xl" style={{ fontFamily: "var(--zr-font-display)" }}>
              Everything you need, nothing you don't
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
                <div className="mb-3 text-3xl">{f.icon}</div>
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
              { step: "1", title: "Sign Up", desc: "Create your account in 30 seconds. No app download needed." },
              { step: "2", title: "Add Your First Lead", desc: "Enter a customer and start tracking. Save to your phone's home screen for the app experience." },
              { step: "3", title: "Measure, Quote, Install", desc: "Use ZeroRemake for the full workflow. See the difference on your very first job." },
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
                  "{t.quote}"
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
                    <li key={j} className="flex items-start gap-2 text-sm">
                      <span style={{ color: plan.highlight ? "#4ade80" : "#16a34a" }} className="mt-0.5 shrink-0">
                        ✓
                      </span>
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
