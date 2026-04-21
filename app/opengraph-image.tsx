import { ImageResponse } from "next/og";

// Next.js Open Graph image generation.
// Served at /opengraph-image automatically; used by Facebook, LinkedIn, iMessage previews.

export const runtime = "edge";
export const alt = "ZeroRemake — Run your blinds business from your phone.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #ffffff 0%, #fff7f4 55%, #ffe4d8 100%)",
          padding: "72px 80px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          color: "#111827",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Logo mark */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: "#e63000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 40,
              fontWeight: 900,
              letterSpacing: "-2px",
            }}
          >
            Z
          </div>
          <div
            style={{
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: "-0.5px",
              display: "flex",
            }}
          >
            <span>Zero</span>
            <span style={{ color: "#e63000" }}>Remake</span>
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            marginTop: 72,
            fontSize: 86,
            fontWeight: 900,
            lineHeight: 1.02,
            letterSpacing: "-2.5px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Run your blinds business</span>
          <span style={{ color: "#e63000" }}>from your phone.</span>
        </div>

        {/* Subheadline */}
        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#4b5563",
            lineHeight: 1.35,
            maxWidth: 960,
            display: "flex",
          }}
        >
          CRM, measuring, quoting, scheduling, order tracking & invoicing — built
          for window treatment pros.
        </div>

        <div style={{ flex: 1 }} />

        {/* Footer row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 26,
            fontWeight: 600,
            color: "#374151",
          }}
        >
          <span>zeroremake.com</span>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              background: "#111827",
              color: "#fff",
              padding: "14px 24px",
              borderRadius: 999,
              fontSize: 22,
              fontWeight: 700,
            }}
          >
            14-day free trial
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}
