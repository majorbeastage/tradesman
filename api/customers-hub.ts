import type { VercelRequest, VercelResponse } from "@vercel/node"
import { handleCustomersHub } from "./_customersHub.js"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await handleCustomersHub(req, res)
  } catch (error) {
    console.error("[customers-hub]", error)
    if (!res.headersSent) res.status(500).json({ error: "Could not load customers" })
  }
}
