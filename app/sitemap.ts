import type { MetadataRoute } from "next";
import { ALL_GUIDE_SLUGS } from "./guides/_data/guides";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zeroremake.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const corePages: {
    path: string;
    priority: number;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  }[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/audit", priority: 0.9, changeFrequency: "weekly" },
    { path: "/sun-calculator", priority: 0.9, changeFrequency: "weekly" },
    { path: "/tools/blinds-vs-shades", priority: 0.9, changeFrequency: "weekly" },
    { path: "/login", priority: 0.5, changeFrequency: "yearly" },
    { path: "/signup", priority: 0.9, changeFrequency: "monthly" },
    { path: "/forgot-password", priority: 0.3, changeFrequency: "yearly" },
  ];

  const guidePages = ALL_GUIDE_SLUGS.map((slug) => ({
    path: `/guides/${slug}`,
    priority: 0.7,
    changeFrequency: "monthly" as const,
  }));

  return [...corePages, ...guidePages].map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
