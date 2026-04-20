"use client";

import { useAuth } from "./auth-provider";

/**
 * ZeroRemake logo lockup — SVG "Z" mark + wordmark.
 * Renders at 3 sizes: sm (nav), md (cards), lg (login/splash).
 * When tenant branding is active, swaps to tenant logo + name.
 * Respects --zr-orange CSS variable for white-label recoloring.
 */
export function ZRLogo({ size = "sm", iconOnly = false }: { size?: "sm" | "md" | "lg"; iconOnly?: boolean }) {
  // Try to get branding, but gracefully handle being outside AuthProvider
  let branding = null;
  try {
    const auth = useAuth();
    branding = auth.branding;
  } catch {
    // Outside AuthProvider (e.g., login page before auth loads)
  }

  const dims = size === "lg" ? 56 : size === "md" ? 40 : 28;
  const textSize = size === "lg" ? "text-[28px]" : size === "md" ? "text-[20px]" : "text-[16px]";

  // If tenant has a custom logo image, show that
  if (branding?.logoUrl) {
    return (
      <span className="inline-flex items-center gap-3 no-underline select-none">
        <img src={branding.logoUrl} alt="Logo" width={dims} height={dims} className="rounded-lg object-contain" />
        {size !== "sm" && branding.slug && (
          <span className={`font-black leading-none tracking-tight ${textSize}`} style={{ fontFamily: "var(--zr-font-display)", color: "var(--zr-text-primary)" }}>
            {branding.slug.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
          </span>
        )}
      </span>
    );
  }

  // Default ZeroRemake logo
  const mark = branding?.logoMark || "Z";

  return (
    <span className="inline-flex items-center gap-3 no-underline select-none">
      <svg width={dims} height={dims} viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="90" height="90" rx="20" fill="#1a1a1a" />
        <text x="45" y="63" fontFamily="'Lexend Exa', sans-serif" fontWeight="900" fontSize="54" fill="white" textAnchor="middle">{mark}</text>
        <rect x="5" y="41" width="80" height="8" rx="4" fill="var(--zr-orange, #e63000)" transform="rotate(-22 45 45)" />
      </svg>
      {!iconOnly && (
        <span className={`font-black leading-none tracking-tight ${textSize}`} style={{ fontFamily: "var(--zr-font-display)" }}>
          Zero<span style={{ color: "var(--zr-orange)" }}>Remake</span>
        </span>
      )}
    </span>
  );
}

/**
 * Standalone SVG icon (no wordmark) — for favicons, PWA icons, etc.
 */
export function ZRIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="90" height="90" rx="20" fill="#1a1a1a" />
      <text x="45" y="63" fontFamily="'Lexend Exa', sans-serif" fontWeight="900" fontSize="54" fill="white" textAnchor="middle">Z</text>
      <rect x="5" y="41" width="80" height="8" rx="4" fill="var(--zr-orange, #e63000)" transform="rotate(-22 45 45)" />
    </svg>
  );
}
