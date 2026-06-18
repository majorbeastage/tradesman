import type { VercelRequest, VercelResponse } from "@vercel/node"
import { callScreeningHandler } from "./_callScreeningHandler.js"

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await callScreeningHandler(req, res)
}
