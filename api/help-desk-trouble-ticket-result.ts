import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv, normalizePhone, pickFirstString } from "./_communications.js"

function sendTwiml(res: VercelResponse, body: string): VercelResponse {
  res.setHeader("Content-Type", "text/xml; charset=utf-8")
  return res.status(200).send(body)
}

function requestPublicOrigin(req: VercelRequest): string {
  const proto = pickFirstString(req.headers["x-forwarded-proto"], "https")
  const host = pickFirstString(req.headers["x-forwarded-host"], req.headers.host)
  if (host) return `${proto}://${host}`
  const v = firstEnv("VERCEL_URL")
  if (v) return `https://${v.replace(/^https?:\/\//, "")}`
  return "http://localhost:3000"
}

const SAY = `voice="Polly.Matthew" language="en-US"`
const DEFAULT_HELP_DESK_TO = "helpdesk@tradesman-us.com"

async function notifyTicketEmail(params: {
  origin: string
  ticketNumber: string
  title: string
  lines: string[]
}): Promise<void> {
  const userId = firstEnv("HELP_DESK_TICKET_EMAIL_USER_ID", "HELP_DESK_LOG_USER_ID")
  const to = firstEnv("HELP_DESK_TICKET_NOTIFY_EMAIL", DEFAULT_HELP_DESK_TO)
  if (!userId || !to) {
    console.warn("[help-desk-trouble-ticket] Skipping email: set HELP_DESK_TICKET_EMAIL_USER_ID (or HELP_DESK_LOG_USER_ID) and HELP_DESK_TICKET_NOTIFY_EMAIL")
    return
  }
  const subject = `[${params.ticketNumber}] ${params.title}`.slice(0, 200)
  const body = params.lines.filter(Boolean).join("\n")
  try {
    const r = await fetch(`${params.origin}/api/send-email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        to,
        subject,
        body,
      }),
    })
    if (!r.ok) {
      const t = await r.text()
      console.error("[help-desk-trouble-ticket] send-email failed", r.status, t)
    }
  } catch (e) {
    console.error("[help-desk-trouble-ticket] send-email error", e instanceof Error ? e.message : e)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    return res.status(405).send("Method not allowed")
  }

  const phase = pickFirstString(req.query?.phase).toLowerCase() || "record"
  const origin = requestPublicOrigin(req)
  const supabase = createServiceSupabase()

  if (phase === "record") {
    const from = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
    const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
    const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)
    const recordingUrl = pickFirstString(req.body?.RecordingUrl, req.query?.RecordingUrl)

    if (!recordingSid || !recordingUrl) {
      return sendTwiml(
        res,
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>We could not capture your message. Goodbye.</Say><Hangup/></Response>`
      )
    }

    const title = "Help desk trouble — voicemail received"
    const { data: row, error } = await supabase
      .from("support_tickets")
      .insert({
        type: "phone",
        name: from ? `Caller ${from}` : "Help desk caller",
        phone: from || "",
        email: "",
        business_name: null,
        title,
        message: "Transcription pending.",
        call_from_phone: from || null,
        twilio_call_sid: callSid || null,
        recording_sid: recordingSid,
        recording_url: recordingUrl,
      })
      .select("id, ticket_number")
      .single()

    if (error) {
      if (error.code === "23505") {
        // duplicate recording callback
      } else {
        console.error("[help-desk-trouble-ticket] insert", error.message)
      }
    } else if (row?.id) {
      await supabase.from("support_ticket_notes").insert({
        ticket_id: row.id,
        body: `Voicemail recording received.\nFrom: ${from || "unknown"}\nRecording: ${recordingUrl}`,
        author_label: "system",
      })
      void notifyTicketEmail({
        origin,
        ticketNumber: String(row.ticket_number),
        title,
        lines: [
          `New trouble ticket ${row.ticket_number} (help desk phone).`,
          `Caller: ${from || "unknown"}`,
          `Recording: ${recordingUrl}`,
          "Transcript will follow in a separate email when ready.",
        ],
      })
    }

    return sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>Thank you. We have your message and will get back to you as soon as possible. Goodbye.</Say><Hangup/></Response>`
    )
  }

  if (phase === "transcribe") {
    const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)
    const transcriptionText = pickFirstString(req.body?.TranscriptionText, req.query?.TranscriptionText)
    const status = pickFirstString(req.body?.TranscriptionStatus, req.query?.TranscriptionStatus)

    if (!recordingSid) {
      return res.status(200).send("OK")
    }

    const { data: existing } = await supabase
      .from("support_tickets")
      .select("id, ticket_number, call_from_phone, recording_url")
      .eq("recording_sid", recordingSid)
      .limit(1)
      .maybeSingle()

    if (!existing?.id) {
      console.warn("[help-desk-trouble-ticket] transcribe: no ticket for recording", recordingSid)
      return res.status(200).send("OK")
    }

    const summaryTitle =
      transcriptionText && transcriptionText.trim()
        ? transcriptionText.trim().slice(0, 120) + (transcriptionText.length > 120 ? "…" : "")
        : status === "failed"
          ? "Help desk trouble — transcription failed"
          : "Help desk trouble — no transcript"

    await supabase
      .from("support_tickets")
      .update({
        transcription: transcriptionText || null,
        title: summaryTitle,
        message: transcriptionText || existing.recording_url || "No transcript text returned.",
      })
      .eq("id", existing.id)

    await supabase.from("support_ticket_notes").insert({
      ticket_id: existing.id,
      body:
        status === "failed"
          ? "Twilio transcription failed or returned no text."
          : `Transcript (AI voice-to-text):\n${transcriptionText || "(empty)"}`,
      author_label: "Twilio transcription",
    })

    void notifyTicketEmail({
      origin,
      ticketNumber: String(existing.ticket_number),
      title: summaryTitle,
      lines: [
        `Ticket ${existing.ticket_number} — transcript update`,
        `Caller: ${existing.call_from_phone || "unknown"}`,
        `Recording: ${existing.recording_url || "—"}`,
        "",
        transcriptionText || "(No transcript text)",
      ],
    })

    return res.status(200).send("OK")
  }

  return res.status(400).send("Unknown phase")
}
