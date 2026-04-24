"use client";

/* ───────────────────────────────────────────────────────────────
   ZeroRemake Window Treatment Sun & Heat Calculator — /sun-calculator
   Public lead magnet. 5-question form → computed score + ranked
   product recommendations → email capture → call CTA.
   Same design language as /audit: white background, navy headings,
   orange brand accent, pill inputs, Apple-minimal typography.
   ─────────────────────────────────────────────────────────────── */

import Link from "next/link";
import { useEffect, useState } from "react";
import { ZRIcon } from "../zr-logo";

type Direction = "north" | "south" | "east" | "west" | "unknown";
type Problem   = "heat" | "uv" | "glare" | "privacy" | "darkening" | "energy";
type Room      = "bedroom" | "living_room" | "office" | "nursery" | "kitchen" | "other";
type Pref      = "natural_light" | "max_blocking" | "balanced";

interface RankedCategory {
  id: string;
  name: string;
  tier: "budget" | "mid" | "premium";
  blurb: string;
  fitScore: number;
}

interface CalcResult {
  ok: boolean;
  id: string | null;
  score: number;
  band: "Low" | "Moderate" | "High" | "Very High";
  headline: string;
  summary: string;
  rankings: RankedCategory[];
  bestOverall: RankedCategory;
  bestBudget: RankedCategory | null;
  bestPremium: RankedCategory | null;
}

type Stage =
  | "input"
  | "calculating"
  | "results"
  | "sending_email"
  | "sent"
  | "booking"
  | "booked";

// ─── Styling tokens (shared with /audit) ──────────────────────

const ORANGE = "#d65a31";
const TEXT_PRIMARY = "#1c1c1e";
const TEXT_SECONDARY = "rgba(60,60,67,0.6)";
const TEXT_MUTED = "rgba(60,60,67,0.45)";
const NAVY = "#1b2a4e";
const SURFACE_SOFT = "#fafaf9";
const INPUT_FILL = "rgba(60,60,67,0.06)";
const HAIRLINE = "0.5px solid rgba(60,60,67,0.08)";

// ─── Option groups ────────────────────────────────────────────

const DIRECTIONS: { value: Direction; label: string; hint: string }[] = [
  { value: "north", label: "North", hint: "cooler, less direct sun" },
  { value: "south", label: "South", hint: "year-round sun" },
  { value: "east",  label: "East",  hint: "morning sun" },
  { value: "west",  label: "West",  hint: "afternoon heat + glare" },
  { value: "unknown", label: "Not sure", hint: "we’ll estimate for you" },
];

const PROBLEMS: { value: Problem; label: string }[] = [
  { value: "heat",      label: "Heat" },
  { value: "uv",        label: "UV / fading" },
  { value: "glare",     label: "Glare" },
  { value: "privacy",   label: "Privacy" },
  { value: "darkening", label: "Room darkening" },
  { value: "energy",    label: "Energy savings" },
];

const ROOMS: { value: Room; label: string }[] = [
  { value: "bedroom",     label: "Bedroom" },
  { value: "living_room", label: "Living room" },
  { value: "office",      label: "Office" },
  { value: "nursery",     label: "Nursery" },
  { value: "kitchen",     label: "Kitchen" },
  { value: "other",       label: "Other" },
];

const PREFS: { value: Pref; label: string; hint: string }[] = [
  { value: "natural_light", label: "Keep natural light", hint: "prioritize view" },
  { value: "balanced",      label: "Balanced",           hint: "a bit of each" },
  { value: "max_blocking",  label: "Maximum blocking",   hint: "kill the sun" },
];

// ─── Page ─────────────────────────────────────────────────────

export default function SunCalculatorPage() {
  const [stage, setStage] = useState<Stage>("input");
  const [error, setError] = useState<string | null>(null);

  // Inputs
  const [address, setAddress] = useState("");
  const [facing, setFacing] = useState<Direction | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [pref, setPref] = useState<Pref | null>(null);

  // Result
  const [result, setResult] = useState<CalcResult | null>(null);

  // Lead capture form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Layer 3 booking form state
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookName, setBookName] = useState("");
  const [bookPhone, setBookPhone] = useState("");
  const [bookNotes, setBookNotes] = useState("");

  // Re-prefill "book a call" when they came back via emailed CTA.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const book = params.get("book");
    if (book) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowBookingForm(true);
    }
  }, []);

  const canCalculate = !!facing && !!problem && !!room && !!pref;

  async function runCalculation(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canCalculate) {
      setError("Answer the 4 questions below so we can give you a real recommendation.");
      return;
    }
    setStage("calculating");
    try {
      const utm = typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
      const res = await fetch("/api/sun-calc/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: address.trim() || undefined,
          facing, problem, room, preference: pref,
          utm_source: utm.get("utm_source") || undefined,
          utm_medium: utm.get("utm_medium") || undefined,
          utm_campaign: utm.get("utm_campaign") || undefined,
          utm_term: utm.get("utm_term") || undefined,
          utm_content: utm.get("utm_content") || undefined,
          referer: typeof document !== "undefined" ? document.referrer : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Something went wrong. Try again in a moment.");
        setStage("input");
        return;
      }
      // Delay briefly so the "calculating" state feels earned
      setTimeout(() => {
        setResult(data as CalcResult);
        setStage("results");
      }, 500);
    } catch (err) {
      setError((err as Error).message || "Network error.");
      setStage("input");
    }
  }

  async function submitLead(e: React.FormEvent) {
    e.preventDefault();
    if (!result?.id) return;
    setError(null);
    const trimName = name.trim();
    const trimEmail = email.trim().toLowerCase();
    if (!trimName) { setError("Share your name so Steve knows who this is for."); return; }
    if (!trimEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimEmail)) { setError("That email doesn’t look right."); return; }
    setStage("sending_email");
    try {
      const res = await fetch("/api/sun-calc/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: result.id, name: trimName, email: trimEmail, phone: phone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Something went wrong. Try again.");
        setStage("results");
        return;
      }
      setStage("sent");
    } catch (err) {
      setError((err as Error).message || "Network error.");
      setStage("results");
    }
  }

  async function bookCall(e: React.FormEvent) {
    e.preventDefault();
    if (!result?.id) return;
    setError(null);
    if (!bookName.trim()) { setError("Share your name first."); return; }
    if (!bookPhone.trim() && !email.trim()) { setError("Leave a phone or email so Steve can reach you."); return; }
    setStage("booking");
    try {
      const res = await fetch("/api/sun-calc/book-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: result.id,
          name: bookName.trim(),
          email: email.trim() || undefined,
          phone: bookPhone.trim() || undefined,
          notes: bookNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Couldn’t book that right now.");
        setStage("results");
        return;
      }
      setStage("booked");
    } catch (err) {
      setError((err as Error).message || "Network error.");
      setStage("results");
    }
  }

  return (
    <div style={{ background: "#fff", color: TEXT_PRIMARY, minHeight: "100vh" }}>
      <Nav />

      <main style={{ padding: "40px 20px 96px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <Hero />

          {(stage === "input" || stage === "calculating") && (
            <form onSubmit={runCalculation} style={{ marginTop: 8 }}>
              <QuestionBlock label="1. Your address or ZIP (optional)" hint="Just helps us factor in climate — no exact location needed.">
                <input
                  type="text"
                  inputMode="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="e.g. Mapleton, UT 84664"
                  style={pillInputStyle}
                />
              </QuestionBlock>

              <QuestionBlock label="2. Which direction do the problem windows face?">
                <PillGrid cols={3}>
                  {DIRECTIONS.map((d) => (
                    <PillOption
                      key={d.value}
                      active={facing === d.value}
                      onClick={() => setFacing(d.value)}
                      label={d.label}
                      hint={d.hint}
                    />
                  ))}
                </PillGrid>
              </QuestionBlock>

              <QuestionBlock label="3. What’s your main problem?">
                <PillGrid cols={3}>
                  {PROBLEMS.map((p) => (
                    <PillOption
                      key={p.value}
                      active={problem === p.value}
                      onClick={() => setProblem(p.value)}
                      label={p.label}
                    />
                  ))}
                </PillGrid>
              </QuestionBlock>

              <QuestionBlock label="4. What kind of room?">
                <PillGrid cols={3}>
                  {ROOMS.map((r) => (
                    <PillOption
                      key={r.value}
                      active={room === r.value}
                      onClick={() => setRoom(r.value)}
                      label={r.label}
                    />
                  ))}
                </PillGrid>
              </QuestionBlock>

              <QuestionBlock label="5. Your preference">
                <PillGrid cols={3}>
                  {PREFS.map((p) => (
                    <PillOption
                      key={p.value}
                      active={pref === p.value}
                      onClick={() => setPref(p.value)}
                      label={p.label}
                      hint={p.hint}
                    />
                  ))}
                </PillGrid>
              </QuestionBlock>

              {error && (
                <div style={errorBannerStyle}>{error}</div>
              )}

              <div style={{ marginTop: 22, textAlign: "center" }}>
                <button
                  type="submit"
                  disabled={!canCalculate || stage === "calculating"}
                  style={{
                    background: canCalculate ? ORANGE : "rgba(60,60,67,0.2)",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    padding: "12px 26px",
                    borderRadius: 999,
                    border: "none",
                    cursor: canCalculate ? "pointer" : "default",
                    letterSpacing: "-0.012em",
                  }}
                  className="active:scale-[0.97] transition-transform"
                >
                  {stage === "calculating" ? "Calculating…" : "Calculate my recommendation"}
                </button>
                <div style={{ marginTop: 12, fontSize: 12.5, color: TEXT_MUTED, letterSpacing: "-0.003em" }}>
                  No signup · Free · Takes 20 seconds
                </div>
              </div>
            </form>
          )}

          {result && (stage === "results" || stage === "sending_email" || stage === "sent" || stage === "booking" || stage === "booked") && (
            <ResultsView
              result={result}
              stage={stage}
              name={name} setName={setName}
              email={email} setEmail={setEmail}
              phone={phone} setPhone={setPhone}
              onSubmitLead={submitLead}
              showBookingForm={showBookingForm}
              setShowBookingForm={setShowBookingForm}
              bookName={bookName} setBookName={setBookName}
              bookPhone={bookPhone} setBookPhone={setBookPhone}
              bookNotes={bookNotes} setBookNotes={setBookNotes}
              onBookCall={bookCall}
              error={error}
              onRestart={() => {
                setStage("input");
                setResult(null);
                setError(null);
                setName(""); setEmail(""); setPhone("");
                setBookName(""); setBookPhone(""); setBookNotes("");
                setShowBookingForm(false);
                if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Components ───────────────────────────────────────────────

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
        <div style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
          <Link href="/audit" style={{ fontSize: 13, color: TEXT_SECONDARY, textDecoration: "none", letterSpacing: "-0.012em" }}>
            Website audit
          </Link>
          <Link
            href="/signup"
            style={{
              fontSize: 14, fontWeight: 600, color: "#fff", background: ORANGE,
              textDecoration: "none", padding: "8px 16px", borderRadius: 999, letterSpacing: "-0.012em",
            }}
          >
            Try ZeroRemake
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <div style={{ textAlign: "center", marginBottom: 30 }}>
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
        Free · For homeowners
      </div>
      <h1
        style={{
          fontFamily: "var(--zr-font-display)",
          fontSize: 36,
          fontWeight: 800,
          letterSpacing: "-0.025em",
          lineHeight: 1.12,
          color: TEXT_PRIMARY,
          margin: 0,
        }}
      >
        What should you actually
        <br />
        <span style={{ color: ORANGE }}>put on your windows?</span>
      </h1>
      <p
        style={{
          fontSize: 15.5,
          color: TEXT_SECONDARY,
          lineHeight: 1.55,
          marginTop: 14,
          maxWidth: 540,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        Five questions. A real recommendation based on your sun exposure, the problem
        you’re solving, and how you actually live in the room.
      </p>
    </div>
  );
}

function QuestionBlock({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: TEXT_PRIMARY,
          letterSpacing: "-0.012em",
          marginBottom: hint ? 2 : 8,
          paddingLeft: 4,
        }}
      >
        {label}
      </div>
      {hint && (
        <div style={{ fontSize: 12.5, color: TEXT_MUTED, marginBottom: 10, letterSpacing: "-0.003em", paddingLeft: 4 }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

function PillGrid({ cols, children }: { cols: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function PillOption({
  active, onClick, label, hint,
}: {
  active: boolean; onClick: () => void; label: string; hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: active ? "rgba(214,90,49,0.10)" : INPUT_FILL,
        border: active ? `1.5px solid ${ORANGE}` : `1.5px solid transparent`,
        borderRadius: 14,
        padding: hint ? "10px 10px" : "11px 10px",
        cursor: "pointer",
        textAlign: "center",
        transition: "all 120ms ease",
      }}
      className="active:scale-[0.98]"
    >
      <div
        style={{
          fontSize: 13.5,
          fontWeight: active ? 600 : 500,
          color: active ? ORANGE : TEXT_PRIMARY,
          letterSpacing: "-0.008em",
        }}
      >
        {label}
      </div>
      {hint && (
        <div
          style={{
            fontSize: 11.5,
            color: active ? "rgba(214,90,49,0.7)" : TEXT_MUTED,
            marginTop: 2,
            letterSpacing: "-0.003em",
          }}
        >
          {hint}
        </div>
      )}
    </button>
  );
}

// ─── Results view ─────────────────────────────────────────────

function ResultsView(props: {
  result: CalcResult;
  stage: Stage;
  name: string; setName: (s: string) => void;
  email: string; setEmail: (s: string) => void;
  phone: string; setPhone: (s: string) => void;
  onSubmitLead: (e: React.FormEvent) => void;
  showBookingForm: boolean; setShowBookingForm: (v: boolean) => void;
  bookName: string; setBookName: (s: string) => void;
  bookPhone: string; setBookPhone: (s: string) => void;
  bookNotes: string; setBookNotes: (s: string) => void;
  onBookCall: (e: React.FormEvent) => void;
  error: string | null;
  onRestart: () => void;
}) {
  const { result } = props;
  const color = result.score >= 75 ? "#c6443a"
              : result.score >= 55 ? "#d65a31"
              : result.score >= 35 ? "#e08a00" : "#1d8052";

  return (
    <>
      <AnimatedScoreBlock score={result.score} color={color} band={result.band} headline={result.headline} />

      <div
        style={{
          marginTop: 24,
          padding: "18px 20px",
          background: SURFACE_SOFT,
          borderRadius: 16,
          fontSize: 14.5,
          color: TEXT_PRIMARY,
          lineHeight: 1.6,
          letterSpacing: "-0.005em",
        }}
      >
        {result.summary}
      </div>

      <div style={{ marginTop: 30 }}>
        <SectionLabel>Your top recommendations</SectionLabel>
        <RecoCard label="Best overall" labelColor={ORANGE} cat={result.bestOverall} primary />
        {result.bestBudget && result.bestBudget.id !== result.bestOverall.id && (
          <RecoCard label="Best budget option" labelColor="#1d8052" cat={result.bestBudget} />
        )}
        {result.bestPremium && result.bestPremium.id !== result.bestOverall.id && (
          <RecoCard label="Best premium option" labelColor={NAVY} cat={result.bestPremium} />
        )}
      </div>

      {/* Primary CTA — email capture */}
      {props.stage !== "sent" && props.stage !== "booked" && (
        <form
          onSubmit={props.onSubmitLead}
          style={{
            marginTop: 32,
            padding: "24px 22px",
            background: SURFACE_SOFT,
            borderRadius: 18,
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.018em",
              color: TEXT_PRIMARY,
              marginBottom: 6,
              lineHeight: 1.25,
            }}
          >
            Get my window treatment recommendation
          </div>
          <div
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              lineHeight: 1.5,
              marginBottom: 16,
              letterSpacing: "-0.005em",
            }}
          >
            I’ll email you this recommendation plus a short note on what to look out for when you shop.
          </div>
          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <LabeledInput label="Your name" value={props.name} onChange={props.setName} placeholder="Steve Rogers" />
            <LabeledInput label="Email" value={props.email} onChange={props.setEmail} placeholder="you@example.com" type="email" />
            <LabeledInput label="Phone (optional)" value={props.phone} onChange={props.setPhone} placeholder="(801) 555-1234" type="tel" />
          </div>
          <button
            type="submit"
            disabled={props.stage === "sending_email"}
            style={{
              background: ORANGE,
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              padding: "12px 22px",
              borderRadius: 14,
              border: "none",
              cursor: props.stage === "sending_email" ? "default" : "pointer",
              letterSpacing: "-0.012em",
              width: "100%",
              opacity: props.stage === "sending_email" ? 0.7 : 1,
            }}
            className="active:scale-[0.98]"
          >
            {props.stage === "sending_email" ? "Sending…" : "Send me my recommendation →"}
          </button>
          {props.error && <div style={{ ...errorBannerStyle, marginTop: 12 }}>{props.error}</div>}
          <div style={{ marginTop: 12, fontSize: 12, color: TEXT_MUTED, letterSpacing: "-0.003em" }}>
            One email. No newsletter spam. Reply to unsubscribe anytime.
          </div>
        </form>
      )}

      {props.stage === "sent" && (
        <div style={{ ...successBannerStyle, marginTop: 28 }}>
          Check your email — your recommendation is on the way.
        </div>
      )}

      {/* Secondary CTA — call with Steve */}
      {!props.showBookingForm && props.stage !== "booking" && props.stage !== "booked" && (
        <div
          style={{
            marginTop: 24,
            padding: "20px 22px",
            border: HAIRLINE,
            borderRadius: 16,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: TEXT_MUTED,
              marginBottom: 10,
            }}
          >
            Or — want a second opinion?
          </div>
          <button
            type="button"
            onClick={() => {
              props.setShowBookingForm(true);
              requestAnimationFrame(() => {
                if (typeof window !== "undefined") window.scrollBy({ top: 180, behavior: "smooth" });
              });
            }}
            style={{
              background: "transparent",
              color: ORANGE,
              fontSize: 15.5,
              fontWeight: 600,
              padding: "10px 20px",
              borderRadius: 999,
              border: `1.5px solid ${ORANGE}`,
              cursor: "pointer",
              letterSpacing: "-0.012em",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
            className="transition-opacity active:opacity-60"
          >
            Talk through this with Steve
            <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>→</span>
          </button>
          <div
            style={{
              marginTop: 12,
              fontSize: 13.5,
              color: TEXT_SECONDARY,
              lineHeight: 1.5,
              letterSpacing: "-0.003em",
              maxWidth: 480,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            I’ve been in thousands of homes measuring and installing window treatments. I can help you avoid buying the wrong product.
          </div>
        </div>
      )}

      {/* Booking form (revealed by CTA click) */}
      {props.showBookingForm && props.stage !== "booked" && (
        <form
          onSubmit={props.onBookCall}
          style={{
            marginTop: 28,
            padding: "24px 22px",
            background: SURFACE_SOFT,
            borderRadius: 18,
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 700, color: TEXT_PRIMARY, letterSpacing: "-0.018em", marginBottom: 8 }}>
            Talk through this with Steve
          </div>
          <div style={{ fontSize: 14, color: TEXT_SECONDARY, lineHeight: 1.5, marginBottom: 16, letterSpacing: "-0.005em" }}>
            Twenty minutes, no pitch. Leave a way to reach you and I’ll be in touch within a day.
          </div>
          <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
            <LabeledInput label="Your name" value={props.bookName} onChange={props.setBookName} placeholder="Steve Rogers" />
            <LabeledInput label="Phone (optional)" value={props.bookPhone} onChange={props.setBookPhone} placeholder="(801) 555-1234" type="tel" />
            <LabeledTextarea label="Anything specific you’d like to cover?" value={props.bookNotes} onChange={props.setBookNotes} />
          </div>
          <button
            type="submit"
            disabled={props.stage === "booking"}
            style={{
              background: ORANGE,
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              padding: "12px 22px",
              borderRadius: 14,
              border: "none",
              cursor: props.stage === "booking" ? "default" : "pointer",
              letterSpacing: "-0.012em",
              width: "100%",
              opacity: props.stage === "booking" ? 0.7 : 1,
            }}
            className="active:scale-[0.98]"
          >
            {props.stage === "booking" ? "Sending…" : "Book the call"}
          </button>
          {props.error && <div style={{ ...errorBannerStyle, marginTop: 12 }}>{props.error}</div>}
        </form>
      )}

      {props.stage === "booked" && (
        <div style={{ ...successBannerStyle, marginTop: 28 }}>
          Got it — Steve will reach out within a day.
        </div>
      )}

      <div style={{ marginTop: 28, textAlign: "center" }}>
        <button
          type="button"
          onClick={props.onRestart}
          style={{
            background: "transparent",
            border: "none",
            color: ORANGE,
            fontSize: 13.5,
            fontWeight: 500,
            letterSpacing: "-0.012em",
            cursor: "pointer",
            padding: 8,
          }}
          className="active:opacity-60"
        >
          Run another window
        </button>
      </div>
    </>
  );
}

function AnimatedScoreBlock({ score, color, band, headline }: { score: number; color: string; band: string; headline: string }) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const duration = 900;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setValue(Math.round(score * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  return (
    <div
      style={{
        marginTop: 24,
        padding: "24px 22px",
        background: SURFACE_SOFT,
        borderRadius: 18,
        display: "flex",
        alignItems: "center",
        gap: 20,
      }}
    >
      <div
        style={{
          fontSize: 54,
          fontWeight: 800,
          color,
          letterSpacing: "-0.03em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
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
          Sun &amp; heat exposure
        </div>
        <div
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: "-0.018em",
            color: TEXT_PRIMARY,
          }}
        >
          {band}
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: TEXT_SECONDARY,
            marginTop: 2,
            letterSpacing: "-0.003em",
          }}
        >
          {headline}
        </div>
      </div>
    </div>
  );
}

function RecoCard({ label, labelColor, cat, primary }: { label: string; labelColor: string; cat: RankedCategory; primary?: boolean }) {
  return (
    <div
      style={{
        padding: "16px 18px",
        marginTop: 10,
        background: primary ? SURFACE_SOFT : "transparent",
        borderRadius: 14,
        borderTop: primary ? "none" : HAIRLINE,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: labelColor,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 16.5,
          fontWeight: 700,
          color: TEXT_PRIMARY,
          letterSpacing: "-0.012em",
          marginBottom: 4,
        }}
      >
        {cat.name}
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: TEXT_SECONDARY,
          lineHeight: 1.5,
          letterSpacing: "-0.003em",
        }}
      >
        {cat.blurb}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.08em",
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

function LabeledInput({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 12.5,
          color: TEXT_SECONDARY,
          marginBottom: 4,
          paddingLeft: 4,
          fontWeight: 500,
          letterSpacing: "-0.003em",
        }}
      >
        {label}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={pillInputStyle}
      />
    </label>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          display: "block",
          fontSize: 12.5,
          color: TEXT_SECONDARY,
          marginBottom: 4,
          paddingLeft: 4,
          fontWeight: 500,
          letterSpacing: "-0.003em",
        }}
      >
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        style={{ ...pillInputStyle, resize: "vertical", fontFamily: "inherit" }}
      />
    </label>
  );
}

const pillInputStyle: React.CSSProperties = {
  width: "100%",
  background: INPUT_FILL,
  color: TEXT_PRIMARY,
  fontSize: 14.5,
  letterSpacing: "-0.012em",
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  outline: "none",
};

const errorBannerStyle: React.CSSProperties = {
  marginTop: 12,
  padding: "10px 14px",
  background: "rgba(214,68,58,0.08)",
  color: "#c6443a",
  fontSize: 13.5,
  borderRadius: 12,
  letterSpacing: "-0.005em",
};

const successBannerStyle: React.CSSProperties = {
  padding: "12px 16px",
  background: "rgba(48,164,108,0.10)",
  color: "#1d8052",
  borderRadius: 12,
  fontSize: 13.5,
  fontWeight: 500,
  letterSpacing: "-0.003em",
  lineHeight: 1.5,
  textAlign: "center",
};
