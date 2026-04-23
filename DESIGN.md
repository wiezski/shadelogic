# ZeroRemake Design System

**This is the canonical UI spec.** Every UI change must match this. Do not introduce new styles, reintroduce boxed UI, or add visual clutter. If you need to do something this doc doesn't cover, ask — don't invent.

The app is a mobile-first iOS-feeling web app used in the field (measuring, installing, quoting). Field usability beats decoration.

---

## Core rules

1. **Layout** — no heavy boxed cards everywhere. Use spacing instead of borders. Sections feel open.
2. **Typography** — three levels only: primary (titles, names), secondary (details), subtle (meta). No stacking four font sizes in one block.
3. **Buttons** — one primary action per screen. Secondary actions are plain orange text. No emoji icons. No random colored buttons.
4. **Icons** — no emoji, no mixed styles. Use the existing monochrome `Icon.*` set from `app/dashboard-widgets.tsx` (1.75–2.25 stroke, inline SVG), or none at all.
5. **Interaction** — feels like iOS: simple, obvious, minimal steps. Avoid toolbars and admin-style UI.
6. **Forms** — grouped into sections with uppercase micro-labels; pill-tinted inputs on soft gray; no harsh borders. Easy to scan and tap.
7. **Field usability** — one-handed operation, no off-screen primary actions, fast input beats visual complexity.

---

## Color tokens (from `app/globals.css`)

Only use these. Don't invent.

- Page canvas: `var(--zr-canvas)`
- Surfaces: `var(--zr-surface-1)` (white), `var(--zr-surface-2)`, `var(--zr-surface-3)` (segmented track)
- Brand orange: `var(--zr-orange)` (#d65a31)
- Text primary: `var(--zr-text-primary)` (#1c1c1e)
- Text secondary: `rgba(60,60,67,0.6–0.75)`
- Text muted: `rgba(60,60,67,0.45–0.55)`
- Hairline: `0.5px solid rgba(60,60,67,0.08)`
- Soft gray input/chip fill: `rgba(60,60,67,0.06)`
- Row hover: `rgba(60,60,67,0.04)`
- Row active: `rgba(60,60,67,0.06)`
- Semantic: `var(--zr-success)` (green, #30a46c), `var(--zr-info)` (blue, #0a84ff), `var(--zr-warning)` (amber, #e08a00)
- Softened red for status/overdue text: `#c6443a` — **never** use `bg-red-500`, `text-red-600`, etc.

### Soft tinted fills (action identity)

- Blue tint: `rgba(10,132,255,0.09–0.13)`
- Orange tint: `rgba(214,90,49,0.09–0.13)`
- Green tint: `rgba(48,164,108,0.10–0.14)`
- Red tint: `rgba(214,68,58,0.10)` — sparingly, for overdue-style rows only

---

## Typography scale

| Use | Size · weight · letter-spacing |
|---|---|
| Page title | 26–28px · 700 · -0.025em |
| Section title / row primary | 15–17px · 600 · -0.015/-0.022em |
| Body / input | 14px · 400/500 · -0.012em |
| Secondary / row subtitle | 13–13.5px · 400/500 · -0.005em |
| Muted meta | 12–12.5px · 400/500 · -0.003em |
| Uppercase section label | 11px · 500 · 0.02em · uppercase · `rgba(60,60,67,0.55)` |
| Tabular numbers | `fontVariantNumeric: "tabular-nums"` always for money/counts |

Line-height: 1.15 for titles, 1.25 for primary rows, 1.3–1.35 for body.

---

## Core patterns

### iOS back chevron (top of every inner screen)

```tsx
<Link href="/parent" style={{ color: "var(--zr-orange)", display: "inline-flex", alignItems: "center", gap: 2, fontSize: "15px", fontWeight: 400, letterSpacing: "-0.012em" }}
  className="transition-opacity active:opacity-60">
  <svg width="10" height="16" viewBox="0 0 10 16" fill="none" style={{ marginRight: 2 }}>
    <path d="M8 1 L2 8 L8 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
  Parent
</Link>
```

Label is the parent section name, not "Back". Never use "← Back to X" or underlined blue text.

### Page shell

```tsx
<main style={{ background: "var(--zr-canvas)", color: "var(--zr-text-primary)" }} className="min-h-screen pt-2 pb-24">
  <div className="mx-auto max-w-2xl px-4 sm:px-6">
    {/* back row */}
    {/* title block */}
    {/* sections */}
  </div>
</main>
```

### Title block

```tsx
<div className="mb-4 px-1">
  <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.025em", color: "var(--zr-text-primary)", lineHeight: 1.15 }}>
    Page Title
  </h1>
  <p style={{ fontSize: "13.5px", color: "rgba(60,60,67,0.6)", marginTop: 4, letterSpacing: "-0.005em", lineHeight: 1.35 }}>
    Optional subtitle / count
  </p>
</div>
```

### Section label (above a list or stat strip)

```tsx
<div className="mb-1 px-5">
  <span className="zr-v2-section-label" style={{ padding: 0 }}>Section name</span>
</div>
```

`.zr-v2-section-label` is defined in `globals.css` — use it rather than re-rolling the style inline.

### Canvas row list (the "Shipments" pattern)

No card wrapper. Rows sit directly on the page canvas with 0.5px hairline dividers. No chevron.

```tsx
<div>
  {items.map((item, i, arr) => (
    <Link key={item.id} href={...}
      className="zr-ios-row"
      style={{
        display: "block",
        padding: "18px 20px 16px",
        borderBottom: i < arr.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none",
        textDecoration: "none",
        color: "inherit",
        transition: "background-color 120ms ease",
      }}>
      {/* Line 1: primary bold + right-anchored muted status */}
      {/* Line 2: muted secondary */}
      {/* Line 3 (optional): lightest meta */}
    </Link>
  ))}
</div>
```

### Segmented pill control (Dashboard/Customers pattern)

```tsx
<div className="grid grid-cols-N p-1 rounded-full" style={{ background: "var(--zr-surface-3)" }}>
  {options.map(opt => {
    const active = value === opt.key;
    return (
      <button key={opt.key} onClick={...}
        className="py-1.5 text-[13px] font-semibold rounded-full transition-all"
        style={active
          ? { background: "var(--zr-surface-1)", color: "var(--zr-text-primary)", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }
          : { background: "transparent", color: "var(--zr-text-secondary)" }}>
        {opt.label}
      </button>
    );
  })}
</div>
```

Use for: Dashboard/Customers, Day/Week/Month, 7d/30d/All, Inside/Outside mount type, Draft/Sent/Approved/Rejected, Browse/Alerts, Invoices/Quotes. Binary OR N-way.

### Soft pill select / chip (native <select> in a pill)

```tsx
<div className="relative">
  <select value={...} onChange={...}
    style={{
      background: "rgba(60,60,67,0.06)",
      color: "var(--zr-text-primary)",
      fontSize: "13px", fontWeight: 500, letterSpacing: "-0.012em",
      padding: "8px 28px 8px 12px",
      borderRadius: 999,
      border: "none",
      appearance: "none",
      WebkitAppearance: "none",
      cursor: "pointer",
    }}>
    <option value="all">Default label</option>
    {items.map(...)}
  </select>
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--zr-text-secondary)", pointerEvents: "none" }}>
    <path d="M6 9l6 6 6-6" />
  </svg>
</div>
```

### Category chip row (Specs filters pattern)

For one-tap filtering. Active = filled orange pill, inactive = soft gray pill.

```tsx
<div className="flex items-center gap-1.5 overflow-x-auto px-1" style={{ scrollbarWidth: "none" }}>
  {chips.map(chip => {
    const active = value === chip.key;
    return (
      <button key={chip.key} onClick={() => setValue(chip.key)}
        className="transition-all active:scale-[0.97] whitespace-nowrap shrink-0"
        style={{
          background: active ? "var(--zr-orange)" : "rgba(60,60,67,0.06)",
          color: active ? "#fff" : "var(--zr-text-primary)",
          fontSize: "13px",
          fontWeight: active ? 600 : 500,
          letterSpacing: "-0.012em",
          padding: "6px 14px",
          borderRadius: 999,
        }}>
        {chip.label}
      </button>
    );
  })}
</div>
```

### Primary button (pill)

```tsx
<button onClick={...}
  className="transition-all active:scale-[0.97]"
  style={{
    background: "var(--zr-orange)", color: "#fff",
    fontSize: "14px", fontWeight: 600,
    padding: "9px 22px",
    borderRadius: 999,
    letterSpacing: "-0.012em",
    opacity: disabled ? 0.5 : 1,
  }}>
  Primary action
</button>
```

Full-width submit gets `padding: "12px 20px"`, `borderRadius: 14`, `fontSize: "15px"`. One primary per screen.

### Secondary action

Plain orange text. Never a bordered button.

```tsx
<button onClick={...}
  style={{ color: "var(--zr-orange)", fontSize: "14px", fontWeight: 500, letterSpacing: "-0.012em" }}
  className="transition-opacity active:opacity-60">
  Secondary action
</button>
```

For very quiet secondaries (Sign Out, Cancel in modals), use `color: "rgba(60,60,67,0.7)"`.

### Form input (pill-tinted, no border)

```tsx
const fieldStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(60,60,67,0.06)",
  color: "var(--zr-text-primary)",
  fontSize: "14px",
  letterSpacing: "-0.012em",
  padding: "10px 14px",
  borderRadius: 12,
  border: "none",
  outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontSize: "13px", color: "rgba(60,60,67,0.6)", fontWeight: 500,
  display: "block", marginBottom: 4, paddingLeft: 4, letterSpacing: "-0.005em",
};
```

Group related fields under an uppercase section micro-label. Section spacing: `gap: 16–22px`.

### Modal / sheet

iOS sheet: slides up from bottom on mobile, centered on desktop. Backdrop blur, rounded-20 top corners, hairline under header, no borders.

```tsx
<div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
  style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }}>
  <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto"
    style={{
      background: "var(--zr-surface-1)",
      borderRadius: 20,
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      boxShadow: "0 -6px 30px rgba(0,0,0,0.12)",
    }}>
    <div className="sticky top-0 flex items-center justify-between z-10"
      style={{
        background: "var(--zr-surface-1)",
        padding: "16px 20px 12px",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        borderBottom: "0.5px solid rgba(60,60,67,0.08)",
      }}>
      <h2 style={{ fontSize: "17px", fontWeight: 700, letterSpacing: "-0.018em" }}>{title}</h2>
      <button onClick={onClose} aria-label="Close"
        style={{ color: "rgba(60,60,67,0.5)", fontSize: "22px", lineHeight: 1, padding: 4 }}
        className="transition-opacity active:opacity-60">×</button>
    </div>
    <div style={{ padding: "18px 20px 22px" }}>{children}</div>
  </div>
</div>
```

Modals end with `Cancel (plain text) · Primary (orange pill)`, right-aligned.

### Overlay popover (Focus Mode, Notifications)

Translucent white, backdrop-blur, hairlines between rows, no solid borders.

```tsx
<div className="absolute top-full mt-1.5 rounded-[14px] z-50 overflow-hidden"
  style={{
    background: "rgba(255,255,255,0.88)",
    backdropFilter: "saturate(180%) blur(20px)",
    WebkitBackdropFilter: "saturate(180%) blur(20px)",
    boxShadow: "0 6px 20px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.04)",
  }}>
  {items.map((item, i, arr) => (
    <button key={item.key} onClick={...}
      className="w-full flex items-center gap-3 text-left transition-colors"
      style={{
        padding: "11px 14px",
        background: "transparent",
        borderBottom: i < arr.length - 1 ? "0.5px solid rgba(60,60,67,0.08)" : "none",
        color: selected ? "var(--zr-orange)" : "var(--zr-text-primary)",
        fontSize: "15px",
        fontWeight: selected ? 600 : 400,
        letterSpacing: "-0.012em",
      }}>
      <span style={{ flex: 1 }}>{item.label}</span>
      {selected && <CheckIcon />}
    </button>
  ))}
</div>
```

### Leading status dot (list row priority marker)

5–7px circle, colored by priority. Primary text stays dark — color lives only on the dot.

- Red: `#c87070` (overdue, not alert)
- Amber: `var(--zr-warning)`
- Blue: `var(--zr-info)`
- Green: `var(--zr-success)`
- Neutral: `rgba(60,60,67,0.3)`

---

## Anti-patterns (do not ship)

- ❌ `border: 1px solid var(--zr-border)` wrapper cards for top-level content
- ❌ `--zr-black` as page background (use `--zr-canvas`)
- ❌ `bg-black text-white` active states (use the segmented pill pattern)
- ❌ Emoji in labels (📋, 📅, 🔔, ✍, 📍, 🎉, 🔧, ✓, 🗺, 📦, 📐, 💰, etc.)
- ❌ Radio buttons (use segmented pills)
- ❌ Wall of filled colored buttons (one primary, rest plain text)
- ❌ Raw Tailwind `text-red-600` / `text-red-500` / saturated red for status — use muted `#c6443a` or `#c87070`
- ❌ Heavy `1px solid var(--zr-border)` between list rows — always 0.5px 8%-alpha hairline
- ❌ Column borders in grids (use spacing or hairlines)
- ❌ `hover:underline` on orange links (use `transition-opacity active:opacity-60`)
- ❌ "← Back to {long full name}" — iOS chevron + single word
- ❌ Abbreviations in UI labels ("All mfgs" → "Manufacturer", "All cats" → chips)
- ❌ Bulky filled pill tabs as primary navigation (typography + underline or segmented control)

---

## When adding a new screen

1. Start from the page shell above.
2. iOS back chevron.
3. Title block (28pt).
4. One primary action if the screen has a "next step".
5. Sections with uppercase micro-labels. Canvas rows over cards.
6. Inputs: pill-tinted, no borders.
7. Segmented pills for binary/N-way state. Chip row for filters.
8. Soft tinted fills for identity/active states; never solid saturated colors.
9. Test one-handed tap targets: minimum 32pt height on primary controls.

When in doubt: look at `app/dashboard-widgets.tsx` (KPI Strip, Shipments, Today's Focus, Quick Actions) and `app/schedule/page.tsx` (segmented control, sticky blur header). Those are the references.
