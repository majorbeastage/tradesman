import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createServiceSupabase, firstEnv, normalizePhone, pickFirstString } from "./_communications.js"
import { mirrorTwilioRecordingToPublicUrl } from "./_mirrorTwilioToStorage.js"

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

export async function helpDeskTroubleTicketResultHandler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST")
    res.status(405).send("Method not allowed")
    return
  }

  const phase = pickFirstString(req.query?.phase).toLowerCase() || "record"
  const origin = requestPublicOrigin(req)

  if (phase === "record") {
    let supabase: ReturnType<typeof createServiceSupabase>
    try {
      supabase = createServiceSupabase()
    } catch (e) {
      console.error("[help-desk-trouble-ticket] record: Supabase not configured", e instanceof Error ? e.message : e)
      sendTwiml(
        res,
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>We could not save your message in our system right now. Please try the website or call back later.</Say><Hangup/></Response>`,
      )
      return
    }
    const from = normalizePhone(pickFirstString(req.body?.From, req.query?.From))
    const callSid = pickFirstString(req.body?.CallSid, req.query?.CallSid)
    const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)
    const recordingUrl = pickFirstString(req.body?.RecordingUrl, req.query?.RecordingUrl)

    if (!recordingSid) {
      sendTwiml(
        res,
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>We could not capture your message. Goodbye.</Say><Hangup/></Response>`,
      )
      return
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
        recording_url: recordingUrl || null,
      })
      .select("id, ticket_number")
      .single()

    if (error) {
      if (error.code === "23505") {
        // duplicate recording callback
      } else {
        console.error(
          "[help-desk-trouble-ticket] insert failed:",
          error.message,
          "| Run supabase/support-tickets-setup-complete.sql in Supabase SQL Editor if table is missing.",
        )
      }
    } else if (row?.id) {
      let storedRecordingUrl = recordingUrl || null
      if (recordingUrl || recordingSid) {
        const mirrored = await mirrorTwilioRecordingToPublicUrl({
          storagePathWithoutExt: `recordings/support-tickets/${row.id}/${recordingSid}`,
          recordingUrl: recordingUrl || "",
          recordingSid: recordingSid || undefined,
          logTag: "help-desk-trouble-ticket",
        })
        if (mirrored) {
          storedRecordingUrl = mirrored
          const { error: upUrlErr } = await supabase
            .from("support_tickets")
            .update({ recording_url: mirrored })
            .eq("id", row.id)
          if (upUrlErr) console.error("[help-desk-trouble-ticket] update recording_url", upUrlErr.message)
        }
      }
      await supabase.from("support_ticket_notes").insert({
        ticket_id: row.id,
        body: `Voicemail recording received.\nFrom: ${from || "unknown"}\nRecording: ${storedRecordingUrl || `(SID ${recordingSid})`}`,
        author_label: "system",
      })
      void notifyTicketEmail({
        origin,
        ticketNumber: String(row.ticket_number),
        title,
        lines: [
          `New trouble ticket ${row.ticket_number} (help desk phone).`,
          `Caller: ${from || "unknown"}`,
          `Recording: ${storedRecordingUrl || recordingUrl || `SID ${recordingSid}`}`,
          "Transcript will follow in a separate email when ready.",
        ],
      })
    }

    sendTwiml(
      res,
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say ${SAY}>Thank you. We have your message and will get back to you as soon as possible. Goodbye.</Say><Hangup/></Response>`,
    )
    return
  }

  if (phase === "transcribe") {
    let supabaseT: ReturnType<typeof createServiceSupabase>
    try {
      supabaseT = createServiceSupabase()
    } catch (e) {
      console.error("[help-desk-trouble-ticket] transcribe: Supabase not configured", e instanceof Error ? e.message : e)
      res.status(200).send("OK")
      return
    }

    const recordingSid = pickFirstString(req.body?.RecordingSid, req.query?.RecordingSid)
    const transcriptionText = pickFirstString(req.body?.TranscriptionText, req.query?.TranscriptionText)
    const statusRaw = pickFirstString(req.body?.TranscriptionStatus, req.query?.TranscriptionStatus)
    const recordingDuration = pickFirstString(req.body?.RecordingDuration, req.query?.RecordingDuration)
    const transcriptionSid = pickFirstString(req.body?.TranscriptionSid, req.query?.TranscriptionSid)

    if (!recordingSid) {
      res.status(200).send("OK")
      return
    }

    const { data: existing } = await supabaseT
      .from("support_tickets")
      .select("id, ticket_number, call_from_phone, recording_url")
      .eq("recording_sid", recordingSid)
      .limit(1)
      .maybeSingle()

    if (!existing?.id) {
      console.warn("[help-desk-trouble-ticket] transcribe: no ticket for recording", recordingSid)
      res.status(200).send("OK")
      return
    }

    const trimmedText = transcriptionText.trim()
    const transcriptFailed = !trimmedText

    const summaryTitle = trimmedText
      ? trimmedText.slice(0, 120) + (trimmedText.length > 120 ? "…" : "")
      : "Help desk trouble — no transcript"

    if (transcriptFailed) {
      console.warn("[help-desk-trouble-ticket] transcribe: no usable text", {
        recordingSid,
        transcriptionSid: transcriptionSid || null,
        status: statusRaw || null,
        recordingDuration: recordingDuration || null,
      })
    }

    await supabaseT
      .from("support_tickets")
      .update({
        transcription: trimmedText || null,
        title: summaryTitle,
        message: trimmedText || existing.recording_url || "No transcript text returned.",
      })
      .eq("id", existing.id)

    const failureMeta = [
      statusRaw ? `Status: ${statusRaw}` : "",
      recordingDuration ? `Recording duration (seconds): ${recordingDuration}` : "",
      transcriptionSid ? `TranscriptionSid: ${transcriptionSid}` : "",
    ]
      .filter(Boolean)
      .join("\n")
    const failureNoteBody = [
      "Twilio transcription did not return usable text.",
      failureMeta,
      "Twilio only transcribes help-desk recordings between about 2 and 120 seconds; keep messages within ~2 minutes. English only. Very short or silent clips often fail.",
    ]
      .filter((p) => p.length > 0)
      .join("\n\n")

    await supabaseT.from("support_ticket_notes").insert({
      ticket_id: existing.id,
      body: transcriptFailed ? failureNoteBody : `Transcript (AI voice-to-text):\n${trimmedText}`,
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
        trimmedText || "(No transcript text)",
      ],
    })

    res.status(200).send("OK")
    return
  }

  res.status(400).send("Unknown phase")
}
