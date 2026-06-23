import type { NextConfig } from "next";

// Security response headers applied to every route. The app is a client-only
// SPA that talks to Supabase (REST + Auth) and Google OAuth; these headers
// don't restrict those (no CSP connect-src lockdown here — see note below),
// they just close the easy gaps: clickjacking, MIME sniffing, referrer leakage,
// and force HTTPS.
//
// NOTE: a full Content-Security-Policy (script/style/connect allowlist) is the
// natural next step but needs to be validated against the live Google OAuth +
// Supabase flow before shipping, since a wrong directive locks users out. The
// `frame-ancestors 'none'` below is the one CSP directive that's safe to set
// blind (pure anti-clickjacking, mirrors X-Frame-Options).
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
