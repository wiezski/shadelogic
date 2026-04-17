"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function ThriftLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const navItems = [
    { href: "/thrift", label: "Inventory", icon: "📦" },
    { href: "/thrift/add", label: "Add Item", icon: "📷" },
  ];

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#f8f7f4" }}>
      {/* Top Header */}
      <header style={{
        background: "#1a1a2e",
        color: "white",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <Link href="/thrift" style={{ textDecoration: "none", color: "white" }}>
          <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 700, letterSpacing: "-0.5px" }}>
            ThriftFlow
          </h1>
          <p style={{ margin: 0, fontSize: "11px", opacity: 0.7 }}>Snap. List. Sell.</p>
        </Link>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: "16px", maxWidth: "600px", width: "100%", margin: "0 auto" }}>
        {children}
      </main>

      {/* Bottom Nav (mobile-style) */}
      <nav style={{
        background: "white",
        borderTop: "1px solid #e0e0e0",
        display: "flex",
        justifyContent: "space-around",
        padding: "8px 0 env(safe-area-inset-bottom, 8px)",
        position: "sticky",
        bottom: 0,
      }}>
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                textDecoration: "none",
                color: isActive ? "#1a1a2e" : "#888",
                fontSize: "12px",
                fontWeight: isActive ? 600 : 400,
                gap: "2px",
              }}
            >
              <span style={{ fontSize: "22px" }}>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
