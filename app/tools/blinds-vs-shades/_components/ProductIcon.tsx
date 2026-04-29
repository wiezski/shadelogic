"use client";

import type { ProductId } from "../_types";

/**
 * Small schematic SVG icons for each product category.
 *
 * Used in the recommendation callout. Designed to be:
 *   - 56px square, fits inside a 64px container
 *   - currentColor stroke/fill so they inherit the surrounding text color
 *   - schematic, not photographic — communicates form factor at a glance
 *
 * No external assets required. No animations. No accent color hardcoded
 * (color comes from the parent via CSS).
 */

type Props = {
  productId: ProductId;
  size?: number;
  className?: string;
};

export function ProductIcon({ productId, size = 56, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 56 56"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={className}
      style={{ color: "var(--tool-accent)" }}
    >
      {iconBody(productId)}
    </svg>
  );
}

function iconBody(productId: ProductId): React.ReactElement {
  const frame = (
    <rect
      x="6"
      y="6"
      width="44"
      height="44"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
    />
  );

  switch (productId) {
    case "wood_blinds":
    case "faux_blinds":
      return (
        <g>
          {frame}
          {[14, 21, 28, 35, 42].map((y) => (
            <line
              key={y}
              x1="9"
              y1={y}
              x2="47"
              y2={y}
              stroke="currentColor"
              strokeWidth="1.5"
            />
          ))}
        </g>
      );

    case "vertical_blinds":
      return (
        <g>
          {frame}
          {[14, 21, 28, 35, 42].map((x) => (
            <line
              key={x}
              x1={x}
              y1="9"
              x2={x}
              y2="47"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          ))}
        </g>
      );

    case "shutters":
      return (
        <g>
          {frame}
          <line
            x1="28"
            y1="9"
            x2="28"
            y2="47"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          {[15, 22, 29, 36, 43].map((y) => (
            <g key={y}>
              <line x1="10" y1={y} x2="26" y2={y} stroke="currentColor" strokeWidth="1.5" />
              <line x1="30" y1={y} x2="46" y2={y} stroke="currentColor" strokeWidth="1.5" />
            </g>
          ))}
        </g>
      );

    case "cellular":
      return (
        <g>
          {frame}
          {[10, 18, 26, 34, 42].map((y) => (
            <rect
              key={y}
              x="11"
              y={y}
              width="34"
              height="6"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          ))}
        </g>
      );

    case "vertical_cellular":
      return (
        <g>
          {frame}
          {[10, 18, 26, 34, 42].map((x) => (
            <rect
              key={x}
              x={x}
              y="11"
              width="6"
              height="34"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.2"
              fill="none"
            />
          ))}
        </g>
      );

    case "roller":
      return (
        <g>
          {frame}
          <rect x="9" y="10" width="38" height="3" rx="1" fill="currentColor" />
          <rect
            x="11"
            y="14"
            width="34"
            height="32"
            fill="currentColor"
            opacity="0.18"
          />
          <line x1="11" y1="46" x2="45" y2="46" stroke="currentColor" strokeWidth="1.5" />
        </g>
      );

    case "screen":
      return (
        <g>
          {frame}
          <rect x="9" y="10" width="38" height="3" rx="1" fill="currentColor" />
          <rect
            x="11"
            y="14"
            width="34"
            height="32"
            fill="currentColor"
            opacity="0.10"
          />
          {[18, 24, 30, 36, 42].map((y) =>
            [14, 20, 26, 32, 38, 44].map((x) => (
              <circle key={`${x}-${y}`} cx={x} cy={y} r="0.8" fill="currentColor" opacity="0.5" />
            ))
          )}
        </g>
      );

    case "roman":
      return (
        <g>
          {frame}
          {[12, 18, 24, 30].map((y, i) => (
            <path
              key={y}
              d={`M9 ${y} Q28 ${y + 3} 47 ${y}`}
              stroke="currentColor"
              strokeWidth="1.5"
              fill="currentColor"
              fillOpacity={0.08 + i * 0.02}
            />
          ))}
          <rect
            x="11"
            y="34"
            width="34"
            height="11"
            fill="currentColor"
            opacity="0.18"
          />
        </g>
      );

    case "woven":
      return (
        <g>
          {frame}
          {/* Cross-hatch weave pattern */}
          {[12, 18, 24, 30, 36, 42].map((y) => (
            <line
              key={`h-${y}`}
              x1="9"
              y1={y}
              x2="47"
              y2={y}
              stroke="currentColor"
              strokeWidth="0.8"
              opacity="0.55"
            />
          ))}
          {[12, 18, 24, 30, 36, 42].map((x) => (
            <line
              key={`v-${x}`}
              x1={x}
              y1="9"
              x2={x}
              y2="47"
              stroke="currentColor"
              strokeWidth="0.8"
              opacity="0.55"
            />
          ))}
        </g>
      );

    case "zebra":
      return (
        <g>
          {frame}
          {/* Alternating opaque + sheer bands */}
          {[10, 18, 26, 34, 42].map((y, i) => (
            <rect
              key={y}
              x="9"
              y={y}
              width="38"
              height="6"
              fill="currentColor"
              opacity={i % 2 === 0 ? 0.5 : 0.12}
            />
          ))}
        </g>
      );

    case "panel_track":
      return (
        <g>
          {frame}
          <rect x="9" y="9" width="38" height="3" fill="currentColor" />
          {[19, 30, 41].map((x) => (
            <line
              key={x}
              x1={x}
              y1="13"
              x2={x}
              y2="47"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          ))}
          <rect
            x="9"
            y="13"
            width="38"
            height="33"
            fill="currentColor"
            opacity="0.10"
          />
        </g>
      );

    case "drapery":
      return (
        <g>
          {frame}
          <line x1="6" y1="11" x2="50" y2="11" stroke="currentColor" strokeWidth="1.5" />
          {/* Left curtain */}
          <path
            d="M10 13 Q12 28 10 47 M14 13 Q16 28 14 47 M18 13 Q20 28 18 47 M22 13 Q24 28 22 47"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
            opacity="0.7"
          />
          {/* Right curtain */}
          <path
            d="M34 13 Q36 28 34 47 M38 13 Q40 28 38 47 M42 13 Q44 28 42 47 M46 13 Q48 28 46 47"
            stroke="currentColor"
            strokeWidth="1"
            fill="none"
            opacity="0.7"
          />
        </g>
      );
  }
}
