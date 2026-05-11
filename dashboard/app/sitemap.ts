import type { MetadataRoute } from "next";

const SITE_URL = "https://tundrav35a.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`,         lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${SITE_URL}/failures`, lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${SITE_URL}/lifespan`, lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${SITE_URL}/vins`,     lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${SITE_URL}/submit`,   lastModified: now, changeFrequency: "monthly", priority: 0.6 },
  ];
}
