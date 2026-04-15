"use client";

import Link from "next/link";
import { useAuth } from "./auth-provider";

export function NavBar() {
  const { user, signOut } = useAuth();

  // Don't show nav on public pages
  if (!user) return null;

  return (
    <header className="sticky top-0 z-40 bg-black text-white shrink-0">
      <div className="flex items-center gap-0.5 px-3 py-2 overflow-x-auto scrollbar-none">
        <Link href="/" className="font-bold text-white tracking-tight text-base shrink-0 mr-2">SL</Link>
        <span className="text-white/20 shrink-0 mr-0.5">|</span>
        {[
          { href: "/",          label: "Home"     },
          { href: "/schedule",  label: "Schedule" },
          { href: "/analytics", label: "Analytics"},
          { href: "/products",  label: "Products" },
          { href: "/payments",  label: "Payments" },
          { href: "/reminders", label: "Reminders"},
          { href: "/settings",  label: "Settings" },
        ].map(({ href, label }) => (
          <Link key={href} href={href}
            className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
            {label}
          </Link>
        ))}
        <div className="flex-1" />
        <button onClick={signOut}
          className="shrink-0 px-2.5 py-1.5 rounded text-xs text-gray-500 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap ml-1">
          Sign Out
        </button>
      </div>
    </header>
  );
}
