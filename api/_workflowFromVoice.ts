/**
 * Turn spoken or typed workflow descriptions into step labels + arrow connections.
 * POST body: { utterance: string }
 */
import type { VercelRequest, VercelResponse } from "@vercel/node"
import { firstEnv, pickFirstString } from "./_communications.js"
import { openAiText } from "./_leadAutomation.js"

type VoiceConnection = {
  from: number
  to: number
  approval?: string
  label?: string
}

function jsonBody(req: VercelRequest): Record<string, unknown> {
  const b = req.body
  if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>
  return {}
}

function sequentialFallback(utterance: string): { title: string; steps: string[]; connections: VoiceConnection[] } {
  const cleaned = utterance
    .replace(/\band then\b/gi, "\n")
    .replace(/\bthen\b/gi, "\n")
    .replace(/[,;]+/g, "\n")
  const steps = cleaned
    .split(/\n+/)
    .map((s) => s.replace(/^[\d.)\s-]+/, "").trim())
    .filter((s) => s.length > 1)
    .slice(0, 20)
  const connections: VoiceConnection[] = []
  for (let i = 0; i < steps.length - 1; i++) {
    connections.push({ from: i, to: i + 1, approval: "approved" })
  }
  return { title: steps[0]?.slice(0, 60) || "Voice workflow", steps, connections }
}

export async function handleWorkflowFromVoice(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" })
    return
  }

  const body = jsonBody(req)
  const utterance = pickFirstString(body.utterance).slice(0, 8000)
  if (!utterance.trim()) {
    res.status(400).json({ error: "utterance required" })
    return
  }

  const openaiKey = firstEnv("OPENAI_API_KEY")
  if (!openaiKey) {
    const fb = sequentialFallback(utterance)
    res.status(200).json({
      ok: true,
      ...fb,
      fallback: true,
      note: "OpenAI not configured — built a simple step sequence from your words.",
    })
    return
  }

  const instructions = `You convert spoken business process descriptions into workflow diagrams for home-service contractors.
Reply with JSON only, no markdown:
{
  "title": "short workflow title",
  "steps": ["step label", ...],
  "connections": [
    {"from": 0, "to": 1, "approval": "approved"|"needs_approval"|"needs_multiple_approvals", "label": "optional arrow label"}
  ]
}
Rules:
- Max 18 steps. Use clear action labels (who does what).
- "from" and "to" are zero-based indexes into steps.
- Use needs_approval when a department or manager must sign off; needs_multiple_approvals when several paths merge; approved for normal handoffs.
- Include arrow labels when the speaker mentions approvals (e.g. "parts approval", "customer signature").
- If the description is linear, chain steps with approved arrows.
- Do not invent steps unrelated to what was said.`

  const raw =
    (await openAiText(instructions, utterance.slice(0, 6000), { maxTokens: 2200, timeoutMs: 50_000 }))?.trim() ?? "{}"

  let title = "Voice workflow"
  let steps: string[] = []
  let connections: VoiceConnection[] = []

  try {
    const j = JSON.parse(raw) as {
      title?: string
      steps?: unknown
      connections?: unknown
    }
    title = typeof j.title === "string" && j.title.trim() ? j.title.trim().slice(0, 120) : title
    if (Array.isArray(j.steps)) {
      steps = j.steps
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
        .map((s) => s.trim().slice(0, 200))
        .slice(0, 24)
    }
    if (Array.isArray(j.connections)) {
      for (const row of j.connections.slice(0, 40)) {
        if (!row || typeof row !== "object") continue
        const c = row as Record<string, unknown>
        const from = typeof c.from === "number" ? c.from : Number.parseInt(String(c.from ?? ""), 10)
        const to = typeof c.to === "number" ? c.to : Number.parseInt(String(c.to ?? ""), 10)
        if (!Number.isFinite(from) || !Number.isFinite(to)) continue
        const approvalRaw = String(c.approval ?? "approved").trim()
        const approval =
          approvalRaw === "needs_approval" || approvalRaw === "needs_multiple_approvals" ? approvalRaw : "approved"
        const label = typeof c.label === "string" ? c.label.trim().slice(0, 120) : undefined
        connections.push({ from, to, approval, ...(label ? { label } : {}) })
      }
    }
  } catch {
    const fb = sequentialFallback(utterance)
    res.status(200).json({ ok: true, ...fb, fallback: true, note: "Could not parse AI JSON — used sequential fallback." })
    return
  }

  if (!steps.length) {
    const fb = sequentialFallback(utterance)
    res.status(200).json({ ok: true, ...fb, fallback: true })
    return
  }

  res.status(200).json({ ok: true, title, steps, connections })
}
