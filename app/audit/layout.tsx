import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Website Health Check for Window Treatment Pros",
  description:
    "Get a score, top issues, and what to fix — instantly. Built by a 3rd-generation window treatment installer. No signup, free instant scan.",
  openGraph: {
    title: "Free Website Health Check for Window Treatment Pros",
    description:
      "Get a score, top issues, and what to fix — instantly. Free instant scan, no signup.",
    type: "website",
    url: "https://zeroremake.com/audit",
  },
  twitter: {
    card: "summary_large_image",
    title: "Free Website Health Check for Window Treatment Pros",
    description:
      "Get a score, top issues, and what to fix — instantly.",
  },
  alternates: { canonical: "https://zeroremake.com/audit" },
};

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
