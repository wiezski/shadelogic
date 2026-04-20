"use client";

import { useEffect, useRef, useState } from "react";

// Cloudflare Turnstile human verification widget.
// Set NEXT_PUBLIC_TURNSTILE_SITE_KEY env var to enable.
// When not set, the widget is hidden and getToken() returns null (allows login without CAPTCHA).

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoaded?: () => void;
  }
}

export function useTurnstile() {
  const [token, setToken] = useState<string | null>(null);
  const enabled = !!SITE_KEY;
  return { token, setToken, enabled };
}

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  if (!SITE_KEY) return null;

  useEffect(() => {
    // Load the Turnstile script if not already loaded
    if (!document.getElementById("cf-turnstile-script")) {
      const script = document.createElement("script");
      script.id = "cf-turnstile-script";
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoaded";
      script.async = true;
      window.onTurnstileLoaded = () => setLoaded(true);
      document.head.appendChild(script);
    } else if (window.turnstile) {
      setLoaded(true);
    } else {
      const prev = window.onTurnstileLoaded;
      window.onTurnstileLoaded = () => { prev?.(); setLoaded(true); };
    }
  }, []);

  useEffect(() => {
    if (!loaded || !window.turnstile || !containerRef.current) return;
    // Clean up any existing widget
    if (widgetIdRef.current) {
      try { window.turnstile!.remove(widgetIdRef.current); } catch {}
    }
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (t: string) => onToken(t),
      theme: "dark",
      size: "flexible",
    });
    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch {}
      }
    };
  }, [loaded]); // eslint-disable-line

  return <div ref={containerRef} className="my-2" />;
}

// Server-side verification helper — call from API routes
export async function verifyTurnstileToken(token: string | null): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // Not configured — allow through
  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token }),
    });
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
