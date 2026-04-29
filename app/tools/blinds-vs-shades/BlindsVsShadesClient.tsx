"use client";

import { DecisionTool } from "./_components/DecisionTool";

/**
 * Top-level client wrapper for the blinds-vs-shades tool.
 *
 * Holds all interactive UI (page chrome + question flow + result render).
 * Lives separately from page.tsx so page.tsx can stay a pure server component
 * and metadata is guaranteed to render in <head>.
 */
export default function BlindsVsShadesClient() {
  return (
    <div className="blinds-tool-root flex-1">
      <Container>
        <header className="pt-10 pb-6 md:pt-16 md:pb-8">
          <h1
            className="max-w-[24ch] text-[30px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[40px]"
            style={{ color: "var(--tool-text)" }}
          >
            Blinds or shades?
          </h1>
          <p
            className="mt-3 max-w-[52ch] text-[15px] leading-[1.55] md:text-[16px]"
            style={{ color: "var(--tool-text-secondary)" }}
          >
            Nine quick questions. Real-world answers, not marketing copy.
            We&rsquo;ll tell you what to actually buy &mdash; or whether to
            buy anything at all.
          </p>
        </header>

        <DecisionTool />

        <footer className="mt-8 mb-12 text-[12px] leading-[1.5]" style={{ color: "var(--tool-text-tertiary)" }}>
          ShadeLogic — independent decision tools for homeowners. We don&rsquo;t
          sell window treatments; we help you figure out what to look for
          before you do.
        </footer>
      </Container>
    </div>
  );
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[45rem] px-4 md:px-8">
      {children}
    </div>
  );
}
