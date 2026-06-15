/** Fire-and-forget ops email after a support/demo ticket is saved. */
export async function notifyAdminSupportTicket(ticketId: string): Promise<void> {
  if (!ticketId.trim()) return
  try {
    await fetch("/api/notify-admin-support-ticket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: ticketId.trim() }),
    })
  } catch {
    /* non-blocking */
  }
}
