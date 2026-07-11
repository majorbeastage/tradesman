/** Resolve a playable or proxyable recording URL from a communication event row. */
export function extractTwilioRecordingSid(urlOrSid: string | null | undefined): string | null {
  const t = (urlOrSid ?? "").trim()
  if (!t) return null
  const fromPath = /\/Recordings\/(RE[0-9a-f]{32})/i.exec(t)
  if (fromPath) return fromPath[1]!
  if (/^RE[0-9a-f]{32}$/i.test(t)) return t
  return null
}

export function extractTwilioAccountSidFromUrl(url: string | null | undefined): string | null {
  const t = (url ?? "").trim()
  const m = /\/Accounts\/(AC[0-9a-f]{32})\//i.exec(t)
  return m ? m[1]! : null
}

export function resolveCommEventRecordingUrl(ev: {
  recording_url?: string | null
  metadata?: unknown
} | null | undefined): string | null {
  if (!ev) return null
  const direct = (ev.recording_url ?? "").trim()
  if (direct) return direct
  if (!ev.metadata || typeof ev.metadata !== "object" || Array.isArray(ev.metadata)) return null
  const meta = ev.metadata as Record<string, unknown>
  for (const key of ["recording_url", "voicemail_recording_url", "twilio_recording_url"]) {
    const v = typeof meta[key] === "string" ? meta[key].trim() : ""
    if (v) return v
  }
  return null
}

export function isCallScreeningVoicemailFollowUp(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false
  const m = metadata as Record<string, unknown>
  if (m.call_screening !== true) return false
  const action = String(m.screening_action ?? "")
  return action === "voicemail" || action === "uncertain_voicemail"
}

/** When screening sent caller to VM, the recording may be on a later voicemail row. */
export function findLinkedVoicemailRecordingUrl(
  screeningEvent: { created_at?: string | null; metadata?: unknown },
  events: { event_type?: string; created_at?: string | null; recording_url?: string | null; metadata?: unknown }[],
): string | null {
  const t0 = screeningEvent.created_at ? Date.parse(screeningEvent.created_at) : NaN
  if (!Number.isFinite(t0)) return null
  const windowMs = 20 * 60 * 1000
  for (const o of events) {
    if (String(o.event_type ?? "").toLowerCase() !== "voicemail") continue
    const t1 = o.created_at ? Date.parse(o.created_at) : NaN
    if (!Number.isFinite(t1) || t1 < t0 || t1 - t0 > windowMs) continue
    const url = resolveCommEventRecordingUrl(o)
    if (url) return url
  }
  return null
}

export function resolveActivityItemRecordingUrl(
  ev: { event_type?: string; created_at?: string | null; recording_url?: string | null; metadata?: unknown } | null | undefined,
  allEvents: { event_type?: string; created_at?: string | null; recording_url?: string | null; metadata?: unknown }[],
): string | null {
  if (!ev) return null
  const direct = resolveCommEventRecordingUrl(ev)
  if (direct) return direct
  if (isCallScreeningVoicemailFollowUp(ev.metadata)) {
    return findLinkedVoicemailRecordingUrl(ev, allEvents)
  }
  return null
}
