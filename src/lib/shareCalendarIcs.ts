import { isNativeApp } from "./capacitorMobile"

export type CalendarIcsRow = {
  id: string
  title: string
  start_at: string
  end_at: string
  notes?: string | null
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,")
}

function toIcsUtcDateTime(iso: string): string {
  const d = new Date(iso)
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

export function buildCalendarIcs(events: CalendarIcsRow[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tradesman//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]
  const stamp = toIcsUtcDateTime(new Date().toISOString())
  for (const ev of events) {
    const startMs = new Date(ev.start_at).getTime()
    let endAt = ev.end_at
    const endMs = new Date(endAt).getTime()
    if (!Number.isFinite(endMs) || endMs <= startMs) {
      endAt = new Date(startMs + 60 * 60 * 1000).toISOString()
    }
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:tradesman-${ev.id}@com.tradesmanus.com`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART:${toIcsUtcDateTime(ev.start_at)}`)
    lines.push(`DTEND:${toIcsUtcDateTime(endAt)}`)
    lines.push(`SUMMARY:${escapeIcsText(ev.title)}`)
    if (ev.notes?.trim()) lines.push(`DESCRIPTION:${escapeIcsText(ev.notes.trim())}`)
    lines.push("END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}

/**
 * Native: writes an .ics file to cache and opens the system share sheet (Add to Calendar on phone).
 * Web: triggers a download of the .ics file.
 */
export async function shareCalendarEventsToDevice(events: CalendarIcsRow[]): Promise<{ ok: boolean; message: string }> {
  if (events.length === 0) {
    return { ok: false, message: "No events to export." }
  }
  const ics = buildCalendarIcs(events)
  if (!isNativeApp()) {
    try {
      const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "tradesman-calendar.ics"
      a.rel = "noopener"
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      return { ok: true, message: "Download started — open the file to import into your calendar." }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  }
  try {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem")
    const { Share } = await import("@capacitor/share")
    const fileName = `tradesman-jobs-${Date.now()}.ics`
    await Filesystem.writeFile({
      path: fileName,
      data: ics,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: fileName })
    await Share.share({
      title: "Tradesman calendar",
      text: "Add these jobs to your phone calendar.",
      url: uri,
      dialogTitle: "Add to calendar",
    })
    return { ok: true, message: "Use your calendar app from the share sheet to import." }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}
