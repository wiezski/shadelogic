import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zeroremake.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/audit",
          "/sun-calculator",
          "/tools/blinds-vs-shades",
          "/guides/",
          "/login",
          "/signup",
          "/forgot-password",
        ],
        disallow: [
          "/api/",
          "/customers",
          "/customers/",
          "/quotes",
          "/quotes/",
          "/measure-jobs",
          "/measure-jobs/",
          "/invoices",
          "/invoices/",
          "/payments",
          "/payroll",
          "/analytics",
          "/schedule",
          "/settings",
          "/settings/",
          "/onboarding",
          "/builders",
          "/manufacturers",
          "/products",
          "/products/",
          "/calculator",
          "/intake",
          "/jobs",
          "/setup-guide",
          "/b/",
          "/i/",
          "/q/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
