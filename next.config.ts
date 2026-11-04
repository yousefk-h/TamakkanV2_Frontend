import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-hosting on Hostinger (plain Node, not Cloudflare Workers) - this
  // makes `vinext build` emit a portable server at dist/standalone/server.js
  // instead of a Workers bundle. Safe here: this app doesn't use any
  // Workers-only feature (see build/sites-vite-plugin.ts's comment - the
  // BFF proxy routes just read process.env directly, identically under
  // plain Node).
  output: "standalone",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "img.youtube.com" }],
  },
  // vinext defaults this to Next.js's own 1MB Server Actions default, and
  // appears to apply the same cap to POST bodies passing through the
  // App Router pipeline generally - including the BFF proxy route
  // (app/api/backend/[...path]/route.ts) that forwards the end-of-week
  // video check-in upload. Raised to comfortably clear the backend's own
  // 80MB video ceiling (see the backend's MAX_END_OF_WEEK_VIDEO_UPLOAD_BYTES).
  experimental: {
    serverActions: {
      bodySizeLimit: "100mb",
    },
  },
};

export default nextConfig;
