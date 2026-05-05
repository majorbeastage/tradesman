/**
 * Crawlable Terms HTML from `platform_settings` key `tradesman_terms`.
 * GET /api/terms — also routed as /terms via vercel.json rewrite.
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { setLegalSupabaseEnvHeader } from "./_legalSupabaseEnv.js"
import { publicRequestOrigin } from "./_requestOrigin.js"
import { renderPublicLegalHtmlPage } from "./_renderPublicLegalHtml.js"

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
    const html = await renderPublicLegalHtmlPage("terms", { requestOrigin: publicRequestOrigin(req) })
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=300")
    res.status(200).send(html)
  } catch (e) {
    console.error("[api/terms]", e)
    res
      .status(500)
      .setHeader("Content-Type", "text/html; charset=utf-8")
      .send(
        '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><title>Terms</title></head><body><p>Unable to load the terms and conditions. Please try again later.</p></body></html>',
      )
  }
}
