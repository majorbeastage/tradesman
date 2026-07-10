export type SiteTrafficStats = {
  totalToday: number
  totalLast7Days: number
  totalLast30Days: number
  viewsByDay: Array<{ day: string; count: number }>
  viewsByHourUtc: Array<{ hour: number; count: number }>
  topReferrers: Array<{ host: string; count: number }>
  topPaths: Array<{ path: string; count: number }>
  topCountries: Array<{ country: string; count: number }>
  dataSince: string | null
}

export async function loadAdminSiteTrafficStats(accessToken: string, days = 30): Promise<SiteTrafficStats> {
  const q = new URLSearchParams({ days: String(days) })
  const res = await fetch(`/api/site-traffic?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const raw = await res.text()
  if (!res.ok) {
    let msg = raw || res.statusText
    try {
      const j = JSON.parse(raw) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      /* use raw */
    }
    throw new Error(msg)
  }
  return JSON.parse(raw) as SiteTrafficStats
}
