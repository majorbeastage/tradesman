/**
 * Crawlable SMS CTA guidance HTML from platform_settings key tradesman_sms_cta.
 * GET /api/sms-cta-guidance — routed as /sms-cta via vercel.json rewrites.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { setLegalSupabaseEnvHeader } from "./_legalSupabaseEnv.js"
import { publicRequestOrigin } from "./_requestOrigin.js"
import { renderSmsCtaGuidanceHtmlPage } from "./_renderSmsCtaGuidanceHtml.js"

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS")

  if (req.method === "OPTIONS") {
    res.status(204).end()
    return
  }
  if (req.method !== "GET") {
    res.status(405).setHeader("Allow", "GET, OPTIONS").json({ error: "Method not allowed" })
    return
  }

  setLegalSupabaseEnvHeader(res)

  try {
    const html = await renderSmsCtaGuidanceHtmlPage({ requestOrigin: publicRequestOrigin(req) })
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300")
    res.status(200).send(html)
  } catch (e) {
    console.error("[api/sms-cta-guidance]", e)
    res
      .status(500)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>SMS CTA guidance</title></head><body><p>Unable to load SMS CTA guidance. Please try again later.</p></body></html>',
      )
  }
}