export const theme = {
  primary: "#F97316",      // Tradesman Orange
  charcoal: "#1F2933",     // Main dark UI color
  charcoalSmoke: "#2a2a2a", // Neutral charcoal (sidebar) - no blue, warm gray
  text: "#111827",         // Dark text
  background: "#F3F4F6",   // Page background (marketing, signup, modals, etc.)
  /** Logged-in user + office-manager shell only (AppLayout); slightly darker than `background`, not charcoal */
  portalShellBackground: "#E4E7EC",
  border: "#E5E7EB",       // Table borders
  /** Shared form field style: white background, black text (for inputs, selects, textareas in modals/tabs) */
  formInput: {
    padding: "8px 10px",
    border: "1px solid #E5E7EB",
    borderRadius: "6px",
    background: "#fff",
    color: "#000",
    width: "100%",
    boxSizing: "border-box" as const,
  },
}
