"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Answers, EngineOutput } from "../_types";
import { QUESTIONS } from "../_data/questions";
import { runEngine } from "../engine";
import { RecommendationResult } from "./RecommendationResult";

type AnswerMap = Partial<Answers>;

const AUTO_ADVANCE_MS = 250;
const FADE_OUT_MS = 120;

export function DecisionTool() {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);
  const total = QUESTIONS.length;
  const isComplete = step >= total;

  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const result: EngineOutput | null = useMemo(() => {
    if (!isComplete) return null;
    if (Object.keys(answers).length < total) return null;
    return runEngine(answers as Answers);
  }, [isComplete, answers, total]);

  const current = QUESTIONS[step];
  const currentValue = current ? (answers[current.id] as string | undefined) : undefined;

  // Cleanup any pending timers on unmount
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current) clearTimeout(advanceTimerRef.current);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  function clearTimers() {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
    if (exitTimerRef.current) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }

  function transitionToNextStep() {
    setExiting(true);
    exitTimerRef.current = setTimeout(() => {
      setStep((s) => Math.min(s + 1, total));
      setExiting(false);
      exitTimerRef.current = null;
    }, FADE_OUT_MS);
  }

  function selectOption(value: string) {
    if (!current) return;
    if (exiting) return; // ignore clicks during the fade-out window

    setAnswers((prev) => ({ ...prev, [current.id]: value }));

    // Restart auto-advance timer on every selection — gives user time to change their mind
    clearTimers();
    advanceTimerRef.current = setTimeout(() => {
      transitionToNextStep();
    }, AUTO_ADVANCE_MS);
  }

  function next() {
    if (!current) return;
    if (!answers[current.id]) return;
    if (exiting) return;
    clearTimers();
    transitionToNextStep();
  }

  function back() {
    if (exiting) return;
    clearTimers();
    setStep((s) => Math.max(s - 1, 0));
  }

  function restart() {
    clearTimers();
    setAnswers({});
    setExiting(false);
    setStep(0);
  }

  function backToLastQuestion() {
    clearTimers();
    setExiting(false);
    setStep(total - 1);
  }

  function refine(changes: Partial<Answers>) {
    clearTimers();
    setAnswers((prev) => ({ ...prev, ...changes }));
    // Stay on the result step — the useMemo recomputes from new answers
  }

  return (
    <div className="blinds-card">
      {isComplete && result ? (
        <RecommendationResult
          result={result}
          onRestart={restart}
          onBackToLastQuestion={backToLastQuestion}
          onRefine={refine}
        />
      ) : (
        current && (
          <QuestionView
            step={step}
            total={total}
            questionId={current.id as string}
            questionText={current.text}
            options={current.options}
            currentValue={currentValue}
            exiting={exiting}
            onSelect={selectOption}
            onBack={back}
            onNext={next}
            isLast={step === total - 1}
          />
        )
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Question view (single question + nav)
// ─────────────────────────────────────────────────────────────

type QuestionViewProps = {
  step: number;
  total: number;
  questionId: string;
  questionText: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  currentValue: string | undefined;
  exiting: boolean;
  onSelect: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
  isLast: boolean;
};

function QuestionView({
  step,
  total,
  questionId,
  questionText,
  options,
  currentValue,
  exiting,
  onSelect,
  onBack,
  onNext,
  isLast,
}: QuestionViewProps) {
  return (
    <div>
      <ProgressIndicator current={step + 1} total={total} />

      <div
        key={questionId}
        className={exiting ? "blinds-fade-out mt-7" : "blinds-fade-in mt-7"}
        aria-live="polite"
      >
        <h2
          className="text-[20px] font-semibold leading-[1.3] tracking-[-0.012em] md:text-[22px]"
          style={{ color: "var(--tool-text)" }}
        >
          {questionText}
        </h2>
        <p
          className="mt-1.5 text-[12px]"
          style={{ color: "var(--tool-text-tertiary)" }}
        >
          Choose the closest match.
        </p>

        <div className="blinds-options mt-5 grid gap-2.5">
          {options.map((option) => {
            const selected = currentValue === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className="blinds-tile"
                data-selected={selected ? "true" : "false"}
                onClick={() => onSelect(option.value)}
                disabled={exiting}
              >
                <span className="blinds-tile-check" aria-hidden>
                  <CheckIcon />
                </span>
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-7 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 0 || exiting}
          className="blinds-btn-text"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!currentValue || exiting}
          className="blinds-btn-primary"
        >
          {isLast ? "See recommendation" : "Next"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Progress indicator (text + bar)
// ─────────────────────────────────────────────────────────────

function ProgressIndicator({ current, total }: { current: number; total: number }) {
  const pct = (current / total) * 100;
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div
          className="text-[11px] font-medium uppercase tracking-[0.1em]"
          style={{ color: "var(--tool-text-tertiary)" }}
        >
          Question {current} of {total}
        </div>
        <div
          className="text-[11px] font-medium tabular-nums"
          style={{ color: "var(--tool-text-tertiary)" }}
        >
          {Math.round(pct)}%
        </div>
      </div>
      <div className="blinds-progress mt-2">
        <div
          className="blinds-progress-fill"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={current}
          aria-valuemin={1}
          aria-valuemax={total}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Inline icon
// ─────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 14 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M3 7.5L6 10.5L11 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
