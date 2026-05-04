import type { VercelResponse } from "@vercel/node"
import { pickSupabaseAnonKeyForServer, pickSupabaseUrlForServer } from "./_communications.js"

/** True when serverless legal routes can call Supabase (anon + URL). */
export function legalSupabaseEnvPresent(): boolean {
  return Boolean(pickSupabaseUrlForServer().trim() && pickSupabaseAnonKeyForServer().trim())
}

/** Lets you `curl -sI https://…/api/privacy | findstr X-Tradesman` to verify Production env without opening the dashboard. */
export function setLegalSupabaseEnvHeader(res: VercelResponse): void {
  res.setHeader("X-Tradesman-Legal-Supabase-Env", legalSupabaseEnvPresent() ? "present" : "missing")
}
