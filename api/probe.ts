import type { VercelRequest, VercelResponse } from "@vercel/node"

/** Minimal route to verify /api/* reaches Node functions (not the SPA). */
export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate")
  res.status(200).json({ ok: true, route: "probe", hint: "If you see HTML instead, routing still sends /api to the SPA." })
}
