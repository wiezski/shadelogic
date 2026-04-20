import type { Metadata } from "next";
import { AuthProvider } from "./auth-provider";
import { NavBar } from "./nav-bar";
import { FeedbackWidget } from "./feedback-widget";
import { ToastProvider } from "./ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZeroRemake",
  description: "Window treatment software — sale to install, done right.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ZeroRemake",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased" style={{ colorScheme: "light" }}>
      <body className="min-h-full flex flex-col" style={{ fontFamily: "var(--zr-font-body)" }}>
        <AuthProvider>
          <ToastProvider>
            <NavBar />
            {children}
            <FeedbackWidget />
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
