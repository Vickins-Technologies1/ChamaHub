import type { MetadataRoute } from "next";

const siteUrl = "https://chamapulse.vickinstechnologies.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/chama/", "/moderator/", "/auth/", "/member-login", "/member-setup", "/moderator-login", "/moderator-signup", "/admin-login", "/two-factor", "/forgot-password", "/reset-password"],
    }],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
