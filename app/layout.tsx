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
        <header className="sticky top-0 z-40 bg-black text-white flex items-center justify-between px-4 py-2.5 shrink-0">
          <Link href="/" className="font-bold text-white tracking-tight text-lg">ShadeLogic</Link>
          <nav className="flex items-center gap-1">
            <Link href="/"
              className="px-3 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
              Home
            </Link>
            <Link href="/schedule"
              className="px-3 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
              Schedule
            </Link>
            <Link href="/analytics"
              className="px-3 py-1.5 rounded text-sm text-gray-300 hover:text-white hover:bg-white/10 transition-colors">
              Analytics
            </Link>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
