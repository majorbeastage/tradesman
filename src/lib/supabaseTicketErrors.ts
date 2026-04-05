/** User-facing hint when tickets tables are missing in Supabase. */
export function hintForSupportTicketsError(message: string): string {
  if (!message) return message
  if (/support_tickets|support_ticket_notes|schema cache|does not exist/i.test(message)) {
    return `${message}\n\nDatabase setup: open Supabase → SQL Editor, paste and run the script from the repo file supabase/support-tickets-setup-complete.sql, then wait ~1 minute (or Project Settings → API → reload schema).`
  }
  return message
}
