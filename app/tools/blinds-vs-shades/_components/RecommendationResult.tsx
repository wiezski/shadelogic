"use client";

import type {
  Answers,
  ConflictOutput,
  Confidence,
  EngineOutput,
  PlaceholderOutput,
  StandardOutput,
} from "../_types";
import { ProductIcon } from "./ProductIcon";
import { GapDiagram } from "./GapDiagram";

type Props = {
  result: EngineOutput;
  onRestart: () => void;
  onBackToLastQuestion: () => void;
  onRefine: (changes: Partial<Answers>) => void;
};

export function RecommendationResult({
  result,
  onRestart,
  onBackToLastQuestion,
  onRefine,
}: Props) {
  if (result.mode === "standard") {
    return (
      <StandardResult
        result={result}
        onRestart={onRestart}
        onBackToLastQuestion={onBackToLastQuestion}
        onRefine={onRefine}
      />
    );
  }
  if (result.mode === "conflict") {
    return (
      <ConflictResult
        result={result}
        onRestart={onRestart}
        onBackToLastQuestion={onBackToLastQuestion}
      />
    );
  }
  return (
    <PlaceholderResult
      result={result}
      onRestart={onRestart}
      onBackToLastQuestion={onBackToLastQuestion}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Standard result — report-style layout, full structure
// ─────────────────────────────────────────────────────────────

function StandardResult({
  result,
  onRestart,
  onBackToLastQuestion,
  onRefine,
}: {
  result: StandardOutput;
  onRestart: () => void;
  onBackToLastQuestion: () => void;
  onRefine: (changes: Partial<Answers>) => void;
}) {
  return (
    <div className="blinds-fade-in">
      {/* 1. Final recommendation */}
      <div className="blinds-recommendation-callout">
        <div className="blinds-callout-row">
          <div className="blinds-callout-text">
            <Eyebrow>Final recommendation</Eyebrow>
            <h2
              className="mt-2 text-[24px] font-semibold leading-[1.2] tracking-[-0.018em] md:text-[28px]"
              style={{ color: "var(--tool-text)" }}
            >
              {result.productLabel}
            </h2>
            <p
              className="mt-1.5 text-[14px] leading-[1.5] md:text-[15px]"
              style={{ color: "var(--tool-text-secondary)" }}
            >
              {result.configurationLabel}
            </p>
            {result.bestFor.length > 0 && (
              <p
                className="mt-3 text-[14px] leading-[1.55] md:text-[15px]"
                style={{ color: "var(--tool-text-secondary)" }}
              >
                <strong style={{ color: "var(--tool-text)", fontWeight: 600 }}>Best for:</strong>{" "}
                {result.bestFor.join(", ")}
              </p>
            )}
          </div>
          <div className="blinds-callout-icon" aria-hidden>
            <ProductIcon productId={result.productId} />
          </div>
        </div>
        <ConfidenceSignal confidence={result.confidence} />
      </div>

      {/* 2. Why this fits */}
      <Divider />
      <Section label="Why this fits">
        <Paragraph>{result.whyThisFits}</Paragraph>
      </Section>

      {/* 3. What to expect */}
      <Divider />
      <Section label="What to expect">
        <CheckList items={result.whatToExpect} />
      </Section>

      {/* 4. Tradeoff */}
      <Divider />
      <Section label="The tradeoff">
        <Paragraph>{result.tradeoff}</Paragraph>
      </Section>

      {/* 5. Worth knowing */}
      {result.worthKnowing.length > 0 && (
        <>
          <Divider />
          <Section label="Worth knowing before you buy">
            <GapDiagram variant={result.gapVariant} />
            <DotList items={result.worthKnowing} />
          </Section>
        </>
      )}

      {/* 6. Why not the others */}
      {result.whyNotOthers.length > 0 && (
        <>
          <Divider />
          <Section label="Why not the others">
            <ul className="grid gap-5">
              {result.whyNotOthers.map((block) => (
                <li key={block.productId}>
                  <p
                    className="text-[15px] font-semibold leading-snug tracking-[-0.005em]"
                    style={{ color: "var(--tool-text)" }}
                  >
                    {block.label}
                  </p>
                  <ul className="mt-2 blinds-list">
                    {block.reasons.map((reason, idx) => (
                      <li key={idx} className="blinds-list-item">
                        {reason}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {/* 7. Also consider */}
      {result.alternatives.length > 0 && (
        <>
          <Divider />
          <Section label="Also consider">
            <ul className="grid gap-4">
              {result.alternatives.map((alt) => (
                <li key={alt.productId}>
                  <p
                    className="text-[15px] font-semibold tracking-[-0.005em]"
                    style={{ color: "var(--tool-text)" }}
                  >
                    {alt.label}
                  </p>
                  <p
                    className="text-[13px] leading-[1.5]"
                    style={{ color: "var(--tool-text-tertiary)" }}
                  >
                    {alt.configurationLabel}
                  </p>
                  <p
                    className="mt-1 text-[15px] leading-[1.55] md:text-[16px]"
                    style={{ color: "var(--tool-text-secondary)" }}
                  >
                    Better {alt.whenItsBetter}.
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {/* 8. When this might not work */}
      <Divider />
      <Section label="When this might not work">
        <DotList items={result.whenThisMightNotWork} />
      </Section>

      {/* 9. Refine your result */}
      {result.refineActions.length > 0 && (
        <>
          <Divider />
          <Section label="Refine your result">
            <p
              className="mb-3 text-[14px] leading-[1.55]"
              style={{ color: "var(--tool-text-tertiary)" }}
            >
              Try a different priority and see how the recommendation shifts.
            </p>
            <div className="flex flex-wrap gap-2">
              {result.refineActions.map((action, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="blinds-refine-btn"
                  onClick={() => onRefine(action.changes)}
                >
                  <span aria-hidden className="blinds-refine-btn-plus">+</span>
                  {action.label}
                </button>
              ))}
            </div>
          </Section>
        </>
      )}

      {/* 10. Next steps */}
      <Divider />
      <Section label="Next steps">
        <DotList items={result.nextSteps} />
      </Section>

      <Divider />
      <NavFooter onRestart={onRestart} onBackToLastQuestion={onBackToLastQuestion} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Conflict result
// ─────────────────────────────────────────────────────────────

function ConflictResult({
  result,
  onRestart,
  onBackToLastQuestion,
}: {
  result: ConflictOutput;
  onRestart: () => void;
  onBackToLastQuestion: () => void;
}) {
  return (
    <div className="blinds-fade-in">
      <div className="blinds-recommendation-callout">
        <Eyebrow>Honest answer</Eyebrow>
        <h2
          className="mt-2 text-[22px] font-semibold leading-[1.25] tracking-[-0.016em] md:text-[26px]"
          style={{ color: "var(--tool-text)" }}
        >
          {result.summary}
        </h2>
        <p
          className="mt-4 text-[15px] leading-[1.55] md:text-[16px]"
          style={{ color: "var(--tool-text-secondary)" }}
        >
          {result.opener}
        </p>
      </div>

      <Divider />
      <Section label="The honest answer">
        <Paragraph>{result.honestAnswer}</Paragraph>
      </Section>

      <Divider />
      <Section label="Your realistic options">
        <ul className="grid gap-3">
          {result.options.map((opt, idx) => (
            <li
              key={idx}
              className="rounded-[12px] p-4 md:p-5"
              style={{
                background: "var(--tool-surface)",
                border: "1px solid var(--tool-border)",
              }}
            >
              <div
                className="text-[10px] font-medium uppercase tracking-[0.1em]"
                style={{ color: "var(--tool-text-tertiary)" }}
              >
                Option {String.fromCharCode(65 + idx)}
              </div>
              <p
                className="mt-1.5 text-[16px] font-semibold leading-snug tracking-[-0.005em]"
                style={{ color: "var(--tool-text)" }}
              >
                {opt.label}
              </p>
              <p
                className="mt-2 text-[14px] leading-[1.55] md:text-[15px]"
                style={{ color: "var(--tool-text-secondary)" }}
              >
                {opt.description}
              </p>
              <div className="mt-3 grid gap-1 text-[13px] leading-[1.5]">
                <div>
                  <span style={{ color: "var(--tool-text-tertiary)" }}>Tradeoff: </span>
                  <span style={{ color: "var(--tool-text-secondary)" }}>{opt.tradeoff}</span>
                </div>
                <div>
                  <span style={{ color: "var(--tool-text-tertiary)" }}>Best if: </span>
                  <span style={{ color: "var(--tool-text-secondary)" }}>{opt.bestIf}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Divider />
      <Section label="What we'd probably do">
        <Paragraph>{result.whatWedDo}</Paragraph>
      </Section>

      <Divider />
      <Section label="Next steps">
        <DotList items={result.nextSteps} />
      </Section>

      <Divider />
      <NavFooter onRestart={onRestart} onBackToLastQuestion={onBackToLastQuestion} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Placeholder result
// ─────────────────────────────────────────────────────────────

function PlaceholderResult({
  result,
  onRestart,
  onBackToLastQuestion,
}: {
  result: PlaceholderOutput;
  onRestart: () => void;
  onBackToLastQuestion: () => void;
}) {
  return (
    <div className="blinds-fade-in">
      <div className="blinds-recommendation-callout">
        <Eyebrow>Specialty category</Eyebrow>
        <h2
          className="mt-2 text-[22px] font-semibold leading-[1.25] tracking-[-0.016em] md:text-[26px]"
          style={{ color: "var(--tool-text)" }}
        >
          {result.summary}
        </h2>
        <p
          className="mt-4 text-[15px] leading-[1.55] md:text-[16px]"
          style={{ color: "var(--tool-text-secondary)" }}
        >
          {result.opener}
        </p>
      </div>

      <Divider />
      <Section label="Why this category needs a specialist">
        <Paragraph>{result.body}</Paragraph>
      </Section>

      <Divider />
      <Section label="Next steps">
        <DotList items={result.nextSteps} />
      </Section>

      <Divider />
      <NavFooter onRestart={onRestart} onBackToLastQuestion={onBackToLastQuestion} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Confidence signal
// ─────────────────────────────────────────────────────────────

function ConfidenceSignal({ confidence }: { confidence: Confidence }) {
  const label =
    confidence === "high"
      ? "High"
      : confidence === "medium"
      ? "Medium"
      : "Split decision";

  const color =
    confidence === "high"
      ? "var(--tool-accent)"
      : confidence === "medium"
      ? "var(--tool-text)"
      : "var(--tool-text-secondary)";

  return (
    <div className="blinds-confidence">
      <span
        className="text-[11px] font-medium uppercase tracking-[0.1em]"
        style={{ color: "var(--tool-text-tertiary)" }}
      >
        Confidence:
      </span>
      <span
        className="text-[13px] font-semibold tracking-[-0.005em]"
        style={{ color }}
      >
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Navigation footer (restart + back to last question)
// ─────────────────────────────────────────────────────────────

function NavFooter({
  onRestart,
  onBackToLastQuestion,
}: {
  onRestart: () => void;
  onBackToLastQuestion: () => void;
}) {
  return (
    <div className="pt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
      <button
        type="button"
        onClick={onBackToLastQuestion}
        className="font-medium underline-offset-4 hover:underline"
        style={{ color: "var(--tool-accent)" }}
      >
        ← Go back to last question
      </button>
      <span style={{ color: "var(--tool-text-tertiary)" }}>·</span>
      <button
        type="button"
        onClick={onRestart}
        className="font-medium underline-offset-4 hover:underline"
        style={{ color: "var(--tool-text-secondary)" }}
      >
        Start over
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Shared layout primitives
// ─────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-medium uppercase tracking-[0.1em]"
      style={{ color: "var(--tool-accent)" }}
    >
      {children}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="py-5 md:py-6">
      <h3
        className="text-[11px] font-medium uppercase tracking-[0.1em]"
        style={{ color: "var(--tool-text-tertiary)" }}
      >
        {label}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[15px] leading-[1.6] md:text-[16px]"
      style={{ color: "var(--tool-text-secondary)" }}
    >
      {children}
    </p>
  );
}

function CheckList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="blinds-checklist">
      {items.map((item, idx) => (
        <li key={idx} className="blinds-checklist-item">
          <span className="blinds-checklist-icon" aria-hidden>
            <ListCheckIcon />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DotList({ items }: { items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className="blinds-list">
      {items.map((item, idx) => (
        <li key={idx} className="blinds-list-item">
          {item}
        </li>
      ))}
    </ul>
  );
}

function Divider() {
  return <hr className="blinds-divider" />;
}

function ListCheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2.5 7.5L5.5 10.5L11.5 3.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
