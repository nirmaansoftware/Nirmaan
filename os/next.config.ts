import type { NextConfig } from "next";
import path from "path";

/**
 * Baseline security headers for every route. The OS is an internal tool and
 * the client pages carry secret links, so: no framing, no MIME sniffing, no
 * referrer leakage, and no access to device features we never use.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  // The repo root has its own package-lock.json (for the static site's build).
  // Pin Turbopack's workspace root to this directory so it doesn't try to
  // infer it from that sibling lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // The Phase 3 dashboard lived at /dashboard; keep old links working.
  async redirects() {
    return [
      { source: "/dashboard", destination: "/os/projects", permanent: true },
      { source: "/dashboard/approvals", destination: "/os/approvals", permanent: true },
      { source: "/dashboard/projects/:id", destination: "/os/projects/:id", permanent: true },
    ];
  },
};

export default nextConfig;
