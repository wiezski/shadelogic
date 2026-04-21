import type { Metadata, Viewport } from "next";
import { AuthProvider } from "./auth-provider";
import { NavBar } from "./nav-bar";
import { FeedbackWidget } from "./feedback-widget";
import { ToastProvider } from "./ui";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zeroremake.com";
const SITE_NAME = "ZeroRemake";
const TAGLINE = "Run your blinds business from your phone.";
const DESCRIPTION =
  "All-in-one software for window treatment pros — CRM, measuring, quoting, scheduling, order tracking, and invoicing. Built for solo installers and small blinds & shades teams. 14-day free trial.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} — ${TAGLINE}`,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "window treatment software",
    "blinds business software",
    "shade installer software",
    "blinds CRM",
    "window covering CRM",
    "blinds quoting software",
    "measure and install software",
    "window treatment scheduling",
    "blinds invoicing",
    "solo installer software",
    "shutter installer software",
    "window treatment estimating",
    "blinds business app",
    "ZeroRemake",
  ],
  authors: [{ name: "ZeroRemake" }],
  creator: "ZeroRemake",
  publisher: "ZeroRemake",
  category: "business",
  manifest: "/manifest.json",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
    // opengraph-image.tsx auto-generates /opengraph-image; Next resolves it.
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${TAGLINE}`,
    description: DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: SITE_NAME,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Verification placeholders — drop the token in here once you've added the
  // property in Google Search Console / Bing Webmaster.
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
    other: {
      // Example: "facebook-domain-verification": ["abc123"],
    },
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#e63000",
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
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
