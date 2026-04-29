"use client";

import type { GapVariant } from "../_types";

/**
 * Compact diagram showing inside-mount light-gap behavior.
 *
 * Driven by the engine's `gapVariant` field — the engine decides whether
 * a gap diagram is meaningful for the recommended configuration. This
 * component only renders a visual when there's something to show.
 *
 * Returns null when:
 *   - product has side channels (gap is closed)
 *   - product is outside-mount only
 *   - product has different gap mechanics (shutters, drapery, etc.)
 */

type Props = {
  variant: GapVariant;
};

export function GapDiagram({ variant }: Props) {
  if (variant === "none") return null;

  const config = GAP_CONFIG[variant];

  return (
    <figure className="blinds-gap-diagram">
      <svg
        viewBox="0 0 220 70"
        width="100%"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        style={{ display: "block", maxWidth: 280 }}
      >
        {/* Window opening */}
        <rect
          x="1"
          y="1"
          width="218"
          height="68"
          rx="3"
          fill="none"
          stroke="var(--tool-border-hover)"
          strokeWidth="1.5"
        />
        {/* Shade body */}
        <rect
          x={config.shadeX}
          y="6"
          width={220 - config.shadeX * 2}
          height="58"
          fill="var(--tool-text)"
          opacity="0.10"
        />
        {/* Left gap (accent-tinted) */}
        <rect
          x="2"
          y="6"
          width={config.shadeX - 2}
          height="58"
          fill="var(--tool-accent)"
          opacity="0.18"
        />
        {/* Right gap */}
        <rect
          x={220 - config.shadeX}
          y="6"
          width={config.shadeX - 2}
          height="58"
          fill="var(--tool-accent)"
          opacity="0.18"
        />
        {/* Side guide lines */}
        <line
          x1={config.shadeX}
          y1="6"
          x2={config.shadeX}
          y2="64"
          stroke="var(--tool-accent)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
        <line
          x1={220 - config.shadeX}
          y1="6"
          x2={220 - config.shadeX}
          y2="64"
          stroke="var(--tool-accent)"
          strokeWidth="1"
          strokeDasharray="2 2"
        />
      </svg>
      <figcaption className="blinds-gap-caption">
        <span className="blinds-gap-caption-key" aria-hidden />
        Light leak at the sides — {config.label}
      </figcaption>
    </figure>
  );
}

const GAP_CONFIG: Record<Exclude<GapVariant, "none">, { shadeX: number; label: string }> = {
  small: {
    shadeX: 8,
    label: "about 1/4 inch per side at the narrowest point",
  },
  medium: {
    shadeX: 11,
    label: "roughly 3/8 inch overall (about 3/16 per side)",
  },
  large: {
    shadeX: 18,
    label: "about 1/2 inch per side — visible at oblique angles",
  },
};
