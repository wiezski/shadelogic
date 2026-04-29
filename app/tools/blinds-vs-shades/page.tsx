import type { Metadata } from "next";
import BlindsVsShadesClient from "./BlindsVsShadesClient";
import "./_styles.css";

/*
 * /tools/blinds-vs-shades
 *
 * Pure server component. Exports SEO metadata only; all UI is delegated
 * to BlindsVsShadesClient. Keeping this file fully server-side guarantees
 * the metadata export is honored by Next.js and rendered in <head>.
 */

export const metadata: Metadata = {
  title: "Blinds vs Shades Decision Tool | Window Tools",
  description:
    "Find the right window treatment using a real-world decision engine based on light, privacy, and installation factors.",
  alternates: { canonical: "/tools/blinds-vs-shades" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    title: "Blinds vs Shades Decision Tool | Window Tools",
    description:
      "Honest, plain-English window treatment recommendations based on real installer experience.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blinds vs Shades Decision Tool",
    description:
      "Honest, plain-English window treatment recommendations.",
  },
};

export default function Page() {
  return <BlindsVsShadesClient />;
}
