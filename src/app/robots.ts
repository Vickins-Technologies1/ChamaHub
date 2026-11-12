import type { MetadataRoute } from "next";

const siteUrl = "https://chamapulse.vickinstechnologies.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/chama/", "/moderator/", "/member-login", "/member-signup", "/moderator-login", "/moderator-signup", "/forgot-password", "/reset-password"],
    }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
