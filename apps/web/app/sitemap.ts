import type { MetadataRoute } from "next";

/**
 * sitemap.ts — gera sitemap dinâmico para SEO.
 *
 * Adicione novas rotas conforme o app cresce.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://your-domain.com";
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
