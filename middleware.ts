import { next } from "@vercel/functions"

/**
 * Edge middleware before static routing. Vite deployments were serving index.html for /api/*;
 * we handle GET/OPTIONS for probe + incoming-email here. POST /api/incoming-email uses next() → Node api/incoming-email.ts.
 *
 * Matcher is `/api/:path*` so path-to-regexp matches nested routes; exact paths are checked in code.
 */
export const config = {
  matcher: "/api/:path*",
}

const corsJson = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate, pragma: no-cache",
  "access-control-allow-origin": "*",
} as const

export default function middleware(request: Request): Response {
  const url = new URL(request.url)
  const path = url.pathname

  if (path === "/api/probe") {
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          route: "probe",
          via: "edge-middleware",
          hint: "If you see this JSON, Edge middleware is running before the static shell.",
        }),
        { status: 200, headers: corsJson }
      )
    }
    return next()
  }

  if (path === "/api/incoming-email" || path === "/api/resend-inbound") {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsJson,
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type, svix-id, svix-timestamp, svix-signature",
        },
      })
    }
    if (request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          route: path === "/api/resend-inbound" ? "resend-inbound" : "incoming-email",
          via: "edge-middleware",
          hint:
            path === "/api/resend-inbound"
              ? "Alternate Resend URL (same Node handler as /api/incoming-email). POST webhooks here if the primary path fails."
              : "Configure Resend webhook (email.received) to POST here. POST is handled by the Node function after middleware.",
        }),
        { status: 200, headers: corsJson }
      )
    }
    return next()
  }

  return next()
}
