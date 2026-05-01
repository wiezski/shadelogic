import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Walkthrough your website with ZeroRemake",
  description:
    "Book a 20-minute walkthrough of your website. We'll show what's working, what's missing, and what to fix first — based on what actually drives leads.",
  openGraph: {
    title: "Walkthrough your website with ZeroRemake",
    description:
      "Twenty minutes, no pitch. We'll walk through your site and show you exactly what to fix first.",
    type: "website",
    url: "https://zeroremake.com/walkthrough",
  },
  twitter: {
    card: "summary_large_image",
    title: "Walkthrough your website with ZeroRemake",
    description: "Twenty minutes, no pitch. What to fix first, based on what drives leads.",
  },
  alternates: { canonical: "https://zeroremake.com/walkthrough" },
};

export default function WalkthroughLayout({ children }: { children: React.ReactNode }) {
  return children;
}
