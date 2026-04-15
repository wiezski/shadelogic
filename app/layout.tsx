import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ShadeLogic",
  description: "Window treatment CRM & scheduling",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="sticky top-0 z-40 bg-black text-white shrink-0">
          <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-none">
            <Link href="/" className="font-bold text-white tracking-tight text-base shrink-0 mr-1">SL</Link>
            <span className="text-white/20 shrink-0">|</span>
            <Link href="/"
              className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
              Home
            </Link>
            <Link href="/schedule"
              className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
              Schedule
            </Link>
            <Link href="/analytics"
              className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
              Analytics
            </Link>
            <Link href="/products"
              className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
              Products
            </Link>
            <Link href="/payments"
              className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
              Payments
            </Link>
            <Link href="/reminders"
              className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
              Reminders
            </Link>
            <Link href="/settings"
              className="shrink-0 px-2.5 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors whitespace-nowrap">
              Settings
            </Link>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
