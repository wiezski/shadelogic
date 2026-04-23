"use client";

/* ───────────────────────────────────────────────────────────────
   ZeroRemake Website Health Check — /audit
   Public lead magnet. 3-layer funnel:
     1. Free instant scan  (no email)
     2. Email-gated full report
     3. Human walkthrough call booking
   Copy and tone anchored to Steve's real audits — guidance-first,
   insight-first, not a generic SEO tool.
   ─────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ZRIcon } from "../zr-logo";

// ─── Types (mirror server response shapes) ────────────────────

type Severity = "critical" | "important" | "minor" | "pass";

interface FindingLite {
  id: string;
  title: string;
  detail: string;
  severity: Severity;
}

interface Finding extends FindingLite {
  recommendation: string;
  score: number;
  maxPoints: number;
  category: string;
}

interface Layer1Summary {
  id: string;
  score: number;
  grade: "Strong" | "Solid" | "Needs Work" | "Critical Gaps";
  domain: string;
  pageTitle: string | null;
  topThree: FindingLite[];
  quickInsights: string[];
  additionalFindings: number;
  scannedAt: string;
}

type Stage =
  | "input"
  | "scanning"
  | "results"
  | "unlocking"
  | "unlocked"
  | "booking"
  | "booked";

// ─── Style primitives (following DESIGN.md) ───────────────────

const ORANGE = "#d65a31";
const TEXT_PRIMARY = "#1c1c1e";
const TEXT_SECONDARY = "rgba(60,60,67,0.6)";
const TEXT_MUTED = "rgba(60,60,67,0.45)";
const SURFACE_SOFT = "#fafaf9";
const INPUT_FILL = "rgba(60,60,67,0.06)";
const HAIRLINE = "0.5px solid rgba(60,60,67,0.08)";

const SEVERITY: Record<Severity, { label: string; color: string; soft: string }> = {
  critical: { label: "Critical gap", color: "#c6443a", soft: "rgba(214,68,58,0.10)" },
  important: { label: "Worth fixing", color: "#b56c00", soft: "rgba(224,138,0,0.10)" },
  minor: { label: "Minor", color: "rgba(60,60,67,0.5)", soft: "rgba(60,60,67,0.06)" },
  pass: { label: "Looks good", color: "#1d8052", soft: "rgba(48,164,108,0.10)" },
};

// ─── Page ───────────────────────────────────────────────────────

export default function AuditPage() {
  const [stage, setStage] = useState<Stage>("input");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [summary, setSummary] = useState<Layer1Summary | null>(null);
  const [findings, setFindings] = useState<Finding[] | null>(null);
  const [email, setEmail] = useState("");

  // Booking form state (Layer 3)
  const [bookName, setBookName] = useState("");
  const [bookPhone, setBookPhone] = useState("");
  const [bookNotes, setBookNotes] = useState("");

  // Prefill booking domain if they came back via the emailed CTA (?book=domain)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const bookDomain = params.get("book");
    if (bookDomain && stage === "input") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from URL param
      setUrl(bookDomain);
    }
  }, [stage]);

  // Simulated progress ticks while scanning (for perceived responsiveness)
  useEffect(() => {
    if (stage !== "scanning") return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional progress animation
    setScanProgress(0);
    const steps = [
      { at: 50, pct: 18, label: "Fetching the homepage" },
      { at: 800, pct: 40, label: "Parsing structure" },
      { at: 1800, pct: 62, label: "Checking schema & meta" },
      { at: 3200, pct: 80, label: "Looking at city-page coverage" },
      { at: 5500, pct: 92, label: "Scoring" },
    ];
    const timers = steps.map((s) =>
      setTimeout(() => setScanProgress(s.pct), s.at),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [stage]);

  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Paste the URL of the site you want to check.");
      return;
    }
    setStage("scanning");
    try {
      const utm = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const res = await fetch("/api/audit/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: trimmed,
          utm_source: utm.get("utm_source") || undefined,
          utm_medium: utm.get("utm_medium") || undefined,
          utm_campaign: utm.get("utm_campaign") || undefined,
          utm_term: utm.get("utm_term") || undefined,
          utm_content: utm.get("utm_content") || undefined,
          referer: typeof document !== "undefined" ? document.referrer : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong running the scan.");
        setStage("input");
        return;
      }
      setSummary(data as Layer1Summary);
      setScanProgress(100);
      setTimeout(() => setStage("results"), 300);
    } catch (err) {
      setError((err as Error).message || "Network error. Try again in a moment.");
      setStage("input");
    }
  }

  async function unlockReport(e: React.FormEvent) {
    e.preventDefault();
    if (!summary) return;
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("That email doesn't look right.");
      return;
    }
    setStage("unlocking");
    try {
      const res = await fetch("/api/audit/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: summary.id, email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't unlock the full report.");
        setStage("results");
        return;
      }
      setFindings(data.findings || []);
      setStage("unlocked");
    } catch (err) {
      setError((err as Error).message || "Network error. Try again in a moment.");
      setStage("results");
    }
  }

  async function bookCall(e: React.FormEvent) {
    e.preventDefault();
    if (!summary) return;
    setError(null);
    if (!bookName.trim()) {
      setError("Share your name so I know who I'm talking to.");
      return;
    }
    if (!bookPhone.trim() && !email.trim()) {
      setError("Leave a phone number or email so I can reach you.");
      return;
    }
    setStage("booking");
    try {
      const res = await fetch("/api/audit/book-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: summary.id,
          name: bookName.trim(),
          email: email.trim() || undefined,
          phone: bookPhone.trim() || undefined,
          notes: bookNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't book that right now.");
        setStage("unlocked");
        return;
      }
      setStage("booked");
    } catch (err) {
      setError((err as Error).message || "Network error. Try again in a moment.");
      setStage("unlocked");
    }
  }

  return (
    <div style={{ background: "#fff", color: TEXT_PRIMARY, minHeight: "100vh" }}>
      <Nav />

      <main style={{ padding: "48px 20px 96px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <Hero />

          {/* Layer 1 input */}
          {(stage === "input" || stage === "scanning") && (
            <ScanForm
              url={url}
              setUrl={setUrl}
              onSubmit={runScan}
              loading={stage === "scanning"}
              progress={scanProgress}
              error={error}
            />
          )}

          {/* Layer 1 results (+ Layer 2 gate, shown on same view) */}
          {summary && stage !== "input" && stage !== "scanning" && (
            <>
              <ScoreBlock summary={summary} />
              <TopThree findings={summary.topThree} />
              <QuickInsights insights={summary.quickInsights} />

              {/* Layer 2 */}
              {stage === "results" && (
                <EmailGate
                  email={email}
                  setEmail={setEmail}
                  onSubmit={unlockReport}
                  additional={summary.additionalFindings}
                  error={error}
                />
              )}
              {stage === "unlocking" && <LoadingRow label="Loading your full report…" />}

              {/* Full report + Layer 3 */}
              {stage === "unlocked" && findings && (
                <>
                  <FullReport findings={findings} summary={summary} />
                  <BookCallCard
                    name={bookName}
                    setName={setBookName}
                    phone={bookPhone}
                    setPhone={setBookPhone}
                    notes={bookNotes}
                    setNotes={setBookNotes}
                    onSubmit={bookCall}
                    error={error}
                  />
                </>
              )}
              {stage === "booking" && <LoadingRow label="Sending your request…" />}
              {stage === "booked" && <BookedThankYou domain={summary.domain} />}

              <RestartRow
                onRestart={() => {
                  setStage("input");
                  setUrl("");
                  setSummary(null);
                  setFindings(null);
                  setEmail("");
                  setBookName("");
                  setBookPhone("");
                  setBookNotes("");
                  setError(null);
                  if (typeof window !== "undefined") {
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
              />
            </>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────

function Nav() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "saturate(180%) blur(16px)",
        WebkitBackdropFilter: "saturate(180%) blur(16px)",
        borderBottom: HAIRLINE,
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <ZRIcon size={28} />
          <span
            style={{
              fontFamily: "var(--zr-font-display)",
              fontWeight: 800,
              letterSpacing: "-0.01em",
              fontSize: 16,
              color: TEXT_PRIMARY,
            }}
          >
            Zero<span style={{ color: ORANGE }}>Remake</span>
          </span>
        </Link>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 16 }}>
          <Link
            href="/"
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              textDecoration: "none",
              letterSpacing: "-0.012em",
            }}
          >
            Home
          </Link>
          <Link
            href="/signup"
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: "#fff",
              background: ORANGE,
              textDecoration: "none",
              padding: "8px 16px",
              borderRadius: 999,
              letterSpacing: "-0.012em",
            }}
          >
            Try ZeroRemake
          </Link>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero ────────────────────────────────────────────────────────

function Hero() {
  return (
    <div style={{ textAlign: "center", marginBottom: 32 }}>
      <div
        style={{
          display: "inline-block",
          padding: "6px 14px",
          borderRadius: 999,
          background: "rgba(214,90,49,0.10)",
          color: ORANGE,
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        Free · For window treatment pros
      </div>
      <h1
        style={{
          fontFamily: "var(--zr-font-display)",
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: "-0.025em",
          lineHeight: 1.1,
          color: TEXT_PRIMARY,
          margin: 0,
        }}
      >
        Find out why your website
        <br />
        <span style={{ color: ORANGE }}>isn&apos;t getting leads</span>
        <span style={{ color: TEXT_PRIMARY }}> — in 10 seconds.</span>
      </h1>
      <p
        style={{
          fontSize: 16,
          color: TEXT_SECONDARY,
          lineHeight: 1.55,
          marginTop: 14,
          maxWidth: 560,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        Built from real audits of window treatment businesses — by someone
        who&apos;s run installs, managed teams, and fixed the problems
        you&apos;re dealing with.
      </p>
    </div>
  );
}

// ─── Layer 1: URL input ──────────────────────────────────────────

function ScanForm({
  url,
  setUrl,
  onSubmit,
  loading,
  progress,
  error,
}: {
  url: string;
  setUrl: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  progress: number;
  error: string | null;
}) {
  return (
    <form onSubmit={onSubmit} style={{ marginTop: 8 }}>
      <label
        style={{
          display: "block",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: TEXT_MUTED,
          marginBottom: 8,
          paddingLeft: 4,
        }}
      >
        Your website
      </label>
      <div
        style={{
          display: "flex",
          gap: 10,
          background: INPUT_FILL,
          padding: 6,
          borderRadius: 999,
          alignItems: "stretch",
        }}
      >
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="your-business.com"
          disabled={loading}
          autoFocus
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            padding: "10px 16px",
            fontSize: 15,
            color: TEXT_PRIMARY,
            letterSpacing: "-0.012em",
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            background: ORANGE,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            padding: "10px 22px",
            borderRadius: 999,
            border: "none",
            cursor: loading ? "default" : "pointer",
            letterSpacing: "-0.012em",
            opacity: loading ? 0.6 : 1,
            transition: "transform 80ms ease",
          }}
          className="active:scale-[0.97]"
        >
          {loading ? "Scanning…" : "Scan"}
        </button>
      </div>

      {loading && (
        <div style={{ marginTop: 18 }}>
          <div
            style={{
              height: 4,
              borderRadius: 999,
              background: "rgba(60,60,67,0.08)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                background: ORANGE,
                width: `${progress}%`,
                transition: "width 300ms ease",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 13,
              color: TEXT_MUTED,
              marginTop: 8,
              letterSpacing: "-0.005em",
            }}
          >
            {progressLabel(progress)}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "rgba(214,68,58,0.08)",
            color: "#c6443a",
            fontSize: 13.5,
            borderRadius: 12,
            letterSpacing: "-0.005em",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          marginTop: 14,
          display: "flex",
          justifyContent: "center",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        {[
          "No signup required",
          "Takes ~10 seconds",
          "Instant results",
        ].map((label, i, arr) => (
          <span
            key={label}
            style={{
              fontSize: 12.5,
              color: TEXT_MUTED,
              letterSpacing: "-0.003em",
              display: "inline-flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                width: 4,
                height: 4,
                borderRadius: 999,
                background: ORANGE,
                marginRight: 8,
                verticalAlign: "middle",
              }}
            />
            {label}
            {i < arr.length - 1 && (
              <span style={{ color: "rgba(60,60,67,0.2)", marginLeft: 6 }} aria-hidden="true">
                ·
              </span>
            )}
          </span>
        ))}
      </div>
    </form>
  );
}

function progressLabel(pct: number): string {
  if (pct < 20) return "Fetching the homepage…";
  if (pct < 50) return "Parsing page structure…";
  if (pct < 70) return "Checking schema and meta tags…";
  if (pct < 85) return "Looking at city-page coverage…";
  return "Scoring…";
}

// ─── Layer 1: results ────────────────────────────────────────────

function ScoreBlock({ summary }: { summary: Layer1Summary }) {
  const { score, grade, domain } = summary;
  const color = score >= 80 ? "#1d8052" : score >= 60 ? ORANGE : "#c6443a";
  const interpretation = scoreInterpretation(score);
  const comparison = scoreComparison(score);
  return (
    <div
      style={{
        marginTop: 24,
        padding: "24px 22px",
        background: SURFACE_SOFT,
        borderRadius: 18,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            fontSize: 56,
            fontWeight: 800,
            color,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {score}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: TEXT_MUTED,
              marginBottom: 2,
            }}
          >
            Your score
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.018em",
              color: TEXT_PRIMARY,
            }}
          >
            {grade}
          </div>
          <div
            style={{
              fontSize: 13.5,
              color: TEXT_SECONDARY,
              marginTop: 2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {domain}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 16,
          borderTop: HAIRLINE,
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: TEXT_PRIMARY,
            letterSpacing: "-0.012em",
            lineHeight: 1.35,
          }}
        >
          {interpretation}
        </div>
        {comparison && (
          <div
            style={{
              marginTop: 8,
              display: "inline-block",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "-0.003em",
              color: TEXT_SECONDARY,
              background: "rgba(60,60,67,0.06)",
              padding: "5px 12px",
              borderRadius: 999,
            }}
          >
            {comparison}
          </div>
        )}
      </div>
    </div>
  );
}

function scoreInterpretation(score: number): string {
  if (score >= 80) return "Your site is pulling its weight. A few refinements would tighten it further.";
  if (score >= 60) return "You’re leaving leads on the table every week.";
  if (score >= 40) return "You’re likely missing leads every week — and they’re going to competitors.";
  return "Right now, homeowners searching for you probably aren’t finding you. This is fixable.";
}

function scoreComparison(score: number): string | null {
  if (score >= 80) return "Stronger than most window treatment sites we’ve audited";
  if (score >= 60) return "About average for window treatment businesses";
  if (score >= 40) return "Below average compared to similar businesses";
  return "Well below average for window treatment businesses";
}

function TopThree({ findings }: { findings: FindingLite[] }) {
  if (!findings || findings.length === 0) {
    return (
      <div style={{ marginTop: 24 }}>
        <SectionLabel>Top issues</SectionLabel>
        <div
          style={{
            padding: "18px 22px",
            background: SURFACE_SOFT,
            borderRadius: 14,
            fontSize: 14,
            color: TEXT_SECONDARY,
            lineHeight: 1.5,
          }}
        >
          Nothing major flagged — this site is in good shape. The full report still has some
          useful fine-tuning suggestions.
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 24 }}>
      <SectionLabel>Top 3 things I&apos;d fix first</SectionLabel>
      <div>
        {findings.map((f, i) => (
          <div
            key={f.id}
            style={{
              padding: "18px 4px 18px 4px",
              borderBottom: i < findings.length - 1 ? HAIRLINE : "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: SEVERITY[f.severity].color,
                }}
              >
                {SEVERITY[f.severity].label}
              </span>
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: "-0.015em",
                color: TEXT_PRIMARY,
                marginBottom: 4,
                lineHeight: 1.3,
              }}
            >
              {f.title}
            </div>
            <div
              style={{
                fontSize: 14,
                color: TEXT_SECONDARY,
                lineHeight: 1.55,
                letterSpacing: "-0.005em",
              }}
            >
              {f.detail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuickInsights({ insights }: { insights: string[] }) {
  if (!insights || insights.length === 0) return null;
  return (
    <div style={{ marginTop: 28 }}>
      <SectionLabel>Quick insights</SectionLabel>
      <div>
        {insights.map((text, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              padding: "12px 4px",
              borderBottom: i < insights.length - 1 ? HAIRLINE : "none",
            }}
          >
            <div
              style={{
                flexShrink: 0,
                width: 6,
                height: 6,
                borderRadius: 999,
                background: ORANGE,
                marginTop: 7,
              }}
            />
            <div
              style={{
                fontSize: 14.5,
                color: TEXT_PRIMARY,
                lineHeight: 1.5,
                letterSpacing: "-0.005em",
              }}
            >
              {text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Layer 2: email gate ─────────────────────────────────────────

function EmailGate({
  email,
  setEmail,
  onSubmit,
  additional,
  error,
}: {
  email: string;
  setEmail: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  additional: number;
  error: string | null;
}) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: 32,
        padding: "22px 22px 20px",
        background: SURFACE_SOFT,
        borderRadius: 16,
      }}
    >
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: "-0.018em",
          color: TEXT_PRIMARY,
          marginBottom: 6,
        }}
      >
        Get your full action plan
      </div>
      <div
        style={{
          fontSize: 14.5,
          color: TEXT_SECONDARY,
          lineHeight: 1.5,
          marginBottom: 14,
          letterSpacing: "-0.005em",
        }}
      >
        I&apos;ll show you exactly what to fix first — prioritized like I would for a real client.
      </div>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: "0 0 16px 0",
          display: "grid",
          gap: 6,
        }}
      >
        {[
          additional > 0
            ? `Full breakdown of all ${additional + 3} issues`
            : "Full breakdown of every issue",
          "What to fix first",
          "How to get more leads",
        ].map((item) => (
          <li
            key={item}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 14,
              color: TEXT_PRIMARY,
              letterSpacing: "-0.005em",
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="none"
              stroke={ORANGE}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            >
              <path d="M4 10.5 L8 14 L16 6" />
            </svg>
            {item}
          </li>
        ))}
      </ul>

      <div
        style={{
          display: "flex",
          gap: 10,
          background: "rgba(0,0,0,0.04)",
          padding: 6,
          borderRadius: 999,
          alignItems: "stretch",
        }}
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@your-business.com"
          autoComplete="email"
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            padding: "10px 14px",
            fontSize: 15,
            color: TEXT_PRIMARY,
            letterSpacing: "-0.012em",
          }}
        />
        <button
          type="submit"
          style={{
            background: ORANGE,
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
            padding: "10px 20px",
            borderRadius: 999,
            border: "none",
            cursor: "pointer",
            letterSpacing: "-0.012em",
            whiteSpace: "nowrap",
          }}
          className="active:scale-[0.97]"
        >
          Send my full report →
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "rgba(214,68,58,0.08)",
            color: "#c6443a",
            fontSize: 13.5,
            borderRadius: 12,
            letterSpacing: "-0.005em",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          fontSize: 12,
          color: TEXT_MUTED,
          marginTop: 12,
          letterSpacing: "-0.003em",
        }}
      >
        One email. No newsletter spam. You can reply to unsubscribe anytime.
      </div>
    </form>
  );
}

// ─── Layer 2 unlocked: full findings ─────────────────────────────

function FullReport({ findings, summary }: { findings: Finding[]; summary: Layer1Summary }) {
  const issues = findings.filter((f) => f.severity !== "pass");
  const passing = findings.filter((f) => f.severity === "pass");

  return (
    <div style={{ marginTop: 36 }}>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          letterSpacing: "-0.022em",
          color: TEXT_PRIMARY,
          marginBottom: 4,
        }}
      >
        Full breakdown
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: TEXT_SECONDARY,
          marginBottom: 20,
          letterSpacing: "-0.005em",
          lineHeight: 1.5,
        }}
      >
        Every check, ordered by impact. {issues.length} issue{issues.length === 1 ? "" : "s"} worth your time, {passing.length} things already working.
      </div>

      {issues.length > 0 && (
        <>
          <SectionLabel>What to fix, in order</SectionLabel>
          <div>
            {issues.map((f, i) => (
              <FindingRow key={f.id} finding={f} last={i === issues.length - 1} />
            ))}
          </div>
        </>
      )}

      {passing.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <SectionLabel>What&apos;s already working</SectionLabel>
          <div>
            {passing.map((f, i) => (
              <FindingRow key={f.id} finding={f} last={i === passing.length - 1} />
            ))}
          </div>
        </div>
      )}

      {summary.pageTitle && (
        <div
          style={{
            marginTop: 28,
            padding: "14px 18px",
            background: SURFACE_SOFT,
            borderRadius: 12,
            fontSize: 13,
            color: TEXT_MUTED,
            letterSpacing: "-0.003em",
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: TEXT_SECONDARY, fontWeight: 600 }}>Scanned page title:</strong>{" "}
          {summary.pageTitle}
        </div>
      )}
    </div>
  );
}

function FindingRow({ finding, last }: { finding: Finding; last: boolean }) {
  const sev = SEVERITY[finding.severity];
  return (
    <div
      style={{
        padding: "18px 4px",
        borderBottom: last ? "none" : HAIRLINE,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: sev.color,
          }}
        >
          {sev.label}
        </span>
        <span
          style={{
            fontSize: 12,
            color: TEXT_MUTED,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.003em",
          }}
        >
          {finding.score}/{finding.maxPoints} points
        </span>
      </div>
      <div
        style={{
          fontSize: 17,
          fontWeight: 600,
          letterSpacing: "-0.015em",
          color: TEXT_PRIMARY,
          marginBottom: 6,
          lineHeight: 1.3,
        }}
      >
        {finding.title}
      </div>
      <div
        style={{
          fontSize: 14,
          color: TEXT_SECONDARY,
          lineHeight: 1.55,
          letterSpacing: "-0.005em",
          marginBottom: 8,
        }}
      >
        {finding.detail}
      </div>
      <div
        style={{
          fontSize: 14,
          color: TEXT_PRIMARY,
          lineHeight: 1.55,
          letterSpacing: "-0.005em",
        }}
      >
        <strong style={{ color: ORANGE, fontWeight: 600 }}>What I&apos;d do:</strong>{" "}
        {finding.recommendation}
      </div>
    </div>
  );
}

// ─── Layer 3: Book a call ────────────────────────────────────────

function BookCallCard({
  name,
  setName,
  phone,
  setPhone,
  notes,
  setNotes,
  onSubmit,
  error,
}: {
  name: string;
  setName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  error: string | null;
}) {
  return (
    <form
      onSubmit={onSubmit}
      style={{
        marginTop: 40,
        padding: "28px 24px 24px",
        background: SURFACE_SOFT,
        borderRadius: 20,
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.022em",
          color: TEXT_PRIMARY,
          marginBottom: 6,
          lineHeight: 1.2,
        }}
      >
        Want me to walk through this with you?
      </div>
      <div
        style={{
          fontSize: 15,
          color: TEXT_SECONDARY,
          lineHeight: 1.55,
          marginBottom: 18,
          letterSpacing: "-0.005em",
        }}
      >
        I&apos;ve seen exactly where businesses like yours lose leads — I can show you
        what actually moves the needle. Twenty minutes, no pitch.
      </div>

      <div style={{ display: "grid", gap: 10, marginBottom: 10 }}>
        <LabeledInput
          label="Your name"
          value={name}
          onChange={setName}
          placeholder="Lin Skinner"
        />
        <LabeledInput
          label="Phone (optional)"
          value={phone}
          onChange={setPhone}
          placeholder="(801) 555-1234"
          type="tel"
        />
        <LabeledTextarea
          label="Anything specific you'd like to cover?"
          value={notes}
          onChange={setNotes}
          placeholder="Feel free to leave blank."
        />
      </div>

      <button
        type="submit"
        style={{
          background: ORANGE,
          color: "#fff",
          fontSize: 15,
          fontWeight: 600,
          padding: "12px 22px",
          borderRadius: 14,
          border: "none",
          cursor: "pointer",
          letterSpacing: "-0.012em",
          width: "100%",
        }}
        className="active:scale-[0.98]"
      >
        Book the walkthrough call
      </button>

      {error && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 14px",
            background: "rgba(214,68,58,0.08)",
            color: "#c6443a",
            fontSize: 13.5,
            borderRadius: 12,
            letterSpacing: "-0.005em",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          fontSize: 12,
          color: TEXT_MUTED,
          marginTop: 14,
          lineHeight: 1.5,
          letterSpacing: "-0.003em",
        }}
      >
        Steve · ZeroRemake Studio · I&apos;ll reach out within 24 hours to set a time.
      </div>
    </form>
  );
}

function BookedThankYou({ domain }: { domain: string }) {
  return (
    <div
      style={{
        marginTop: 40,
        padding: "32px 24px",
        background: SURFACE_SOFT,
        borderRadius: 20,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: "-0.022em",
          color: TEXT_PRIMARY,
          marginBottom: 8,
        }}
      >
        Got it — I&apos;ll be in touch within a day
      </div>
      <div
        style={{
          fontSize: 15,
          color: TEXT_SECONDARY,
          lineHeight: 1.55,
          letterSpacing: "-0.005em",
          maxWidth: 440,
          margin: "0 auto",
        }}
      >
        I&apos;ll reach out to set a time for the walkthrough on {domain}. If you thought of
        something after submitting, just reply to the email — I&apos;ll see it.
      </div>
    </div>
  );
}

// ─── Shared small pieces ─────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        color: TEXT_MUTED,
        marginBottom: 8,
        paddingLeft: 4,
      }}
    >
      {children}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 13,
          color: TEXT_SECONDARY,
          marginBottom: 4,
          paddingLeft: 4,
          fontWeight: 500,
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          background: INPUT_FILL,
          color: TEXT_PRIMARY,
          fontSize: 14,
          letterSpacing: "-0.012em",
          padding: "10px 14px",
          borderRadius: 12,
          border: "none",
          outline: "none",
        }}
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 13,
          color: TEXT_SECONDARY,
          marginBottom: 4,
          paddingLeft: 4,
          fontWeight: 500,
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={3}
        style={{
          width: "100%",
          background: INPUT_FILL,
          color: TEXT_PRIMARY,
          fontSize: 14,
          letterSpacing: "-0.012em",
          padding: "10px 14px",
          borderRadius: 12,
          border: "none",
          outline: "none",
          resize: "vertical",
          fontFamily: "inherit",
        }}
      />
    </label>
  );
}

function LoadingRow({ label }: { label: string }) {
  return (
    <div
      style={{
        marginTop: 24,
        padding: "14px 18px",
        background: SURFACE_SOFT,
        borderRadius: 12,
        fontSize: 14,
        color: TEXT_SECONDARY,
        letterSpacing: "-0.005em",
      }}
    >
      {label}
    </div>
  );
}

function RestartRow({ onRestart }: { onRestart: () => void }) {
  return (
    <div style={{ marginTop: 32, textAlign: "center" }}>
      <button
        type="button"
        onClick={onRestart}
        style={{
          background: "transparent",
          border: "none",
          color: ORANGE,
          fontSize: 14,
          fontWeight: 500,
          letterSpacing: "-0.012em",
          cursor: "pointer",
          padding: 8,
        }}
        className="active:opacity-60"
      >
        Scan another site
      </button>
    </div>
  );
}
