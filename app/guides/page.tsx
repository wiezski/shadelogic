import type { Metadata } from "next";
import { GUIDES, ALL_GUIDE_SLUGS } from "./_data/guides";

/*
 * /guides — index of all ShadeLogic homeowner guides.
 *
 * Server component. Reads the guide list from the existing data source
 * so adding a new guide automatically updates this page. No external
 * dependencies, no markdown parser.
 */

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zeroremake.com";

export const metadata: Metadata = {
  title: { absolute: "Window Treatment Guides | ShadeLogic" },
  description:
    "Practical homeowner advice on choosing window treatments — written from real installer experience. What actually works, not what the showroom says.",
  alternates: { canonical: `${SITE_URL}/guides` },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/guides`,
    title: "Window Treatment Guides | ShadeLogic",
    description:
      "Practical homeowner advice on choosing window treatments — written from real installer experience.",
    siteName: "ShadeLogic",
  },
  twitter: {
    card: "summary_large_image",
    title: "Window Treatment Guides | ShadeLogic",
    description: "Practical homeowner advice on window treatments.",
  },
};

export default function GuidesIndexPage() {
  return (
    <article className="guides-article my-6 md:my-10">
      <p className="guides-eyebrow">ShadeLogic</p>
      <h1>Window Treatment Guides</h1>
      <p className="lead">
        Practical advice based on real-world use &mdash; not showroom theory.
      </p>

      <div className="guides-index-list">
        {ALL_GUIDE_SLUGS.map((slug) => {
          const guide = GUIDES[slug];
          if (!guide) return null;
          return (
            <section key={slug} className="guides-index-entry">
              <h2>
                <a href={`/guides/${slug}`} className="guides-index-link">
                  {guide.title}
                </a>
              </h2>
              <p>{guide.description}</p>
            </section>
          );
        })}
      </div>
    </article>
  );
}
