import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Free Website Health Check for Window Treatment Pros",
  description:
    "Find out why your website isn't getting leads — in 10 seconds. Built from real audits of window treatment businesses, by someone who's run installs, managed teams, and fixed the problems you're dealing with. No signup, free instant scan.",
  openGraph: {
    title: "Find out why your website isn't getting leads — in 10 seconds",
    description:
      "Free website health check built from real audits of window treatment businesses. Score, top issues, and what to fix — instantly.",
    type: "website",
    url: "https://zeroremake.com/audit",
  },
  twitter: {
    card: "summary_large_image",
    title: "Find out why your website isn't getting leads — in 10 seconds",
    description:
      "Free website health check for window treatment businesses. Score, top issues, what to fix — instantly.",
  },
  alternates: { canonical: "https://zeroremake.com/audit" },
};

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return children;
}
