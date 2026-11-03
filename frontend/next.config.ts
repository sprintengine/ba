import type { NextConfig } from "next";

/**
 * The browser only ever talks to `/api/*` on our own origin. Next rewrites those
 * calls to the Ktor backend, so there is no CORS and the backend origin is a
 * server-side concern. `/api/v1/me` → `${BACKEND_ORIGIN}/v1/me`.
 */
const backendOrigin = (process.env.BACKEND_ORIGIN ?? "http://localhost:8080").replace(/\/$/, "");

/**
 * `next dev` serves its scripts and HMR only to localhost. To open the dev server from a phone or another machine,
 * list its hosts: `ALLOWED_DEV_ORIGINS=192.0.2.10,my-mac.local`.
 */
const allowedDevOrigins = process.env.ALLOWED_DEV_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * WebMCP (lib/webmcp): Chrome and Edge offer `document.modelContext` to sites in their origin trials, each with its own
 * token per origin: register at https://developer.chrome.com/origintrials (`WEBMCP_ORIGIN_TRIAL_TOKEN`) and at
 * https://developer.microsoft.com/microsoft-edge/origin-trials (`WEBMCP_EDGE_ORIGIN_TRIAL_TOKEN`). Both go in one
 * `Origin-Trial` header (a comma-separated list); each browser uses the token it signed. Without them, only browsers
 * with WebMCP switched on (chrome://flags/#enable-webmcp-testing) see the pages' tools.
 */
const webmcpOriginTrialTokens = [
  process.env.WEBMCP_ORIGIN_TRIAL_TOKEN,
  process.env.WEBMCP_EDGE_ORIGIN_TRIAL_TOKEN,
]
  .map((token) => token?.trim())
  .filter(Boolean)
  .join(", ");

/**
 * The trial is per document, and visitors reach the pages with tools (the booking flow, Explore, My bookings) by
 * client-side navigation from any page, so every page carries it; API, MCP and static responses don't need it.
 */
const webmcpPages = "/((?!api/|mcp|_next/|\\.well-known/).*)";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins,
  poweredByHeader: false,
  devIndicators: { position: "bottom-right" },
  // Turbopack's cost-based CSS grouping: the landing's own CSS (Prism, the demos) no longer rides along on business
  // sites and the booking flow (-1.3 KB gzip there, no route grew), at the cost of a few more, smaller CSS files.
  //
  // turbopackChunking.minChunkSize (default 50 000 bytes of unminified code): below it, Turbopack merges a shared
  // group of small modules into each route's own chunk. Once lib/format lost date-fns' `format` and Radix's tooltip
  // left the root providers, the group they shared with other small UI modules fell under 50 000 and was copied into
  // ~33 page chunks (+200 KB gzip on disk). At 35 000 it stays one shared chunk: total JS is back to main's size and
  // the first-load savings hold, for 2–5 more requests per route than before (20 000 cut more bytes but added ~14).
  experimental: { cssChunking: "graph", turbopackChunking: { minChunkSize: 35_000 } },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendOrigin}/:path*` },
      // Customer MCP (architecture §20): MCP clients discover the OAuth server on this origin and connect to
      // `${APP}/mcp`. The consent page `/oauth/authorize` is ours; everything else is the backend.
      { source: "/mcp", destination: `${backendOrigin}/v1/mcp/customer` },
      // Business MCP (architecture §20.7): members' own AI apps manage their businesses. The backend answers 404 while
      // it is switched off (BUSINESS_MCP_ENABLED).
      { source: "/mcp/business", destination: `${backendOrigin}/v1/mcp/business` },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: `${backendOrigin}/.well-known/oauth-authorization-server`,
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: `${backendOrigin}/.well-known/oauth-protected-resource`,
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: `${backendOrigin}/.well-known/oauth-protected-resource/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        // The OAuth consent screen must never be framed (clickjacking an "Allow").
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      ...(webmcpOriginTrialTokens
        ? [{ source: webmcpPages, headers: [{ key: "Origin-Trial", value: webmcpOriginTrialTokens }] }]
        : []),
    ];
  },
  // No `images.remotePatterns`: next/image is not used (site photos are plain <img>, Unsplash requires
  // hotlinking), and allowing every https host would turn /_next/image into an open image proxy.
};

export default nextConfig;
