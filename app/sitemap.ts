import type { MetadataRoute } from "next";

const siteUrl = "https://ilyes-b-ai.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    { url: siteUrl, lastModified, changeFrequency: "weekly", priority: 1 },
    { url: `${siteUrl}/about`, lastModified, changeFrequency: "monthly", priority: 0.8 }
  ];
}
