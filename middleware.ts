import { next } from "@vercel/functions"

/**
 * Runs on the Edge before static assets. Vite + dist-only routing was serving the SPA for /api/*;
 * short-circuit GET (and OPTIONS) here so probes and Resend URL checks work. POST continues to the Node handler in api/incoming-email.ts.
 */
export const config = {
  matcher: ["/api/incoming-email", "/api/probe"],
}

const corsJson = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, no-cache, must-revalidate",
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

  if (path === "/api/incoming-email") {
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
          route: "incoming-email",
          via: "edge-middleware",
          hint: "Configure Resend webhook (email.received) to POST here. POST is handled by the Node function after middleware.",
        }),
        { status: 200, headers: corsJson }
      )
    }
    return next()
  }

  return next()
}
