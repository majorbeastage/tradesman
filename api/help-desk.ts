import type { VercelRequest, VercelResponse } from "@vercel/node"
import { helpDeskGreetingSaveHandler } from "./_helpDeskGreetingSaveHandler.js"
import { helpDeskTroubleTicketResultHandler } from "./_helpDeskTroubleTicketResultHandler.js"
import { helpDeskVoiceHandler } from "./_helpDeskVoiceHandler.js"

/**
 * Single Vercel entry for help-desk routes (Hobby plan: 12 serverless functions max).
 * Rewrites: help-desk-voice, help-desk-greeting-save, help-desk-trouble-ticket-result → ?__route=…
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
  if (key === "trouble-ticket-result") {
    await helpDeskTroubleTicketResultHandler(req, res)
    return
  }
  await helpDeskVoiceHandler(req, res)
}
