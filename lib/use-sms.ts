// ── SMS Hook ──────────────────────────────────────────────────
// Tries to send via Twilio API first; falls back to native sms: link.
// Components can call sendSMS(to, message) and get a consistent result.

"use client";

import { useAuth } from "../app/auth-provider";
import { useCallback } from "react";

type SMSResult = {
  sent: boolean;
  fallback: boolean;
  error?: string;
};

export function useSMS() {
  const { companyId } = useAuth();

  const sendSMS = useCallback(async (to: string, message: string): Promise<SMSResult> => {
    if (!companyId) {
      // No company context — fallback to native
      window.open(`sms:${to}?body=${encodeURIComponent(message)}`, "_blank");
      return { sent: false, fallback: true };
    }

    try {
      const res = await fetch("/api/sms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, message, companyId }),
      });

      const data = await res.json();

      if (data.sent) {
        return { sent: true, fallback: false };
      }

      // Twilio not enabled or failed — open native SMS
      if (data.smsLink) {
        window.open(data.smsLink, "_blank");
      } else {
        window.open(`sms:${to}?body=${encodeURIComponent(message)}`, "_blank");
      }

      return { sent: false, fallback: true, error: data.error };
    } catch {
      // Network error — fallback
      window.open(`sms:${to}?body=${encodeURIComponent(message)}`, "_blank");
      return { sent: false, fallback: true, error: "Network error" };
    }
  }, [companyId]);

  return { sendSMS };
}
