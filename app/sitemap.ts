import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://zeroremake.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/audit", priority: 0.9, changeFrequency: "weekly" },
    { path: "/login", priority: 0.5, changeFrequency: "yearly" },
    { path: "/signup", priority: 0.9, changeFrequency: "monthly" },
    { path: "/forgot-password", priority: 0.3, changeFrequency: "yearly" },
  ];
  return pages.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
