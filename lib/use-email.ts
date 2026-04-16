"use client";

// ── useEmail hook ─────────────────────────────────────────────
// Client-side hook for sending emails via the /api/send-email route.
// Handles loading state and error feedback.

import { useState } from "react";

type EmailPayload = Record<string, any> & {
  type: string;
  to: string;
  companyId: string;
};

export function useEmail() {
  const [sending, setSending] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  async function send(payload: EmailPayload): Promise<boolean> {
    setSending(true);
    setLastError(null);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setLastError(data.error || "Failed to send email");
        setSending(false);
        return false;
      }
      setSending(false);
      return true;
    } catch (err: any) {
      setLastError(err.message || "Network error");
      setSending(false);
      return false;
    }
  }

  return { send, sending, lastError };
}
