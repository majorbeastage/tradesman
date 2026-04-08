import type { VercelRequest, VercelResponse } from "@vercel/node"
import { helpDeskGreetingSaveHandler } from "./_helpDeskGreetingSaveHandler.js"
import { helpDeskVoiceHandler } from "./_helpDeskVoiceHandler.js"

/**
 * Single Vercel Serverless Function for Hobby plan limits (12 max).
 * Rewrites map /api/help-desk-voice and /api/help-desk-greeting-save here with ?__route=…
 */
function routeKey(req: VercelRequest): string {
  const q = req.query?.__route
  if (typeof q === "string") return q.toLowerCase()
  if (Array.isArray(q) && typeof q[0] === "string") return q[0].toLowerCase()
  return ""
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const key = routeKey(req)
  if (key === "greeting-save") {
    await helpDeskGreetingSaveHandler(req, res)
    return
  }
  await helpDeskVoiceHandler(req, res)
}
