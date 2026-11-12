// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "chamahub.vickinstechnologies.com" }],
      destination: "https://chamapulse.vickinstechnologies.com/:path*",
      permanent: true,
    }];
  },
};

export default nextConfig;
