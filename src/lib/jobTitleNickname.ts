/** Job title / nickname on user profiles — used on org chart and future approval routing. */

export const JOB_TITLE_META_KEY = "job_title_nickname"

export function parseJobTitleNickname(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return ""
  const raw = (metadata as Record<string, unknown>)[JOB_TITLE_META_KEY]
  return typeof raw === "string" ? raw.trim() : ""
}

export async function saveJobTitleNicknameForProfile(
  client: import("@supabase/supabase-js").SupabaseClient,
  userId: string,
  jobTitle: string,
): Promise<void> {
  const { data, error } = await client.from("profiles").select("metadata").eq("id", userId).maybeSingle()
  if (error) throw error
  const prevMeta =
    data?.metadata && typeof data.metadata === "object" && !Array.isArray(data.metadata)
      ? { ...(data.metadata as Record<string, unknown>) }
      : {}
  const trimmed = jobTitle.trim()
  const nextMeta = { ...prevMeta }
  if (trimmed) nextMeta[JOB_TITLE_META_KEY] = trimmed
  else delete nextMeta[JOB_TITLE_META_KEY]
  const { error: upErr } = await client.from("profiles").update({ metadata: nextMeta }).eq("id", userId)
  if (upErr) throw upErr
}
