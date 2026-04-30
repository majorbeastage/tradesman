/**
 * Copy shown under "Edit permissions" on Team Management user cards.
 * Replace titles/bodies with your office’s wording anytime (this file only).
 */
export type PermissionsGuidanceBlock = {
  id: string
  title: string
  body: string
}

/** Shown for linked contractors (managed users). Five blocks align with the controls below them. */
export const MANAGED_USER_PERMISSIONS_GUIDANCE: PermissionsGuidanceBlock[] = [
  {
    id: "team_color",
    title: "Team color (office map)",
    body:
      "Choose how this person appears in your team color strip and shared map views. It helps everyone spot who is who at a glance. Changes apply to your office manager roster, not the contractor’s private branding elsewhere.",
  },
  {
    id: "ribbon_pins",
    title: "Calendar ribbon & map pins",
    body:
      "This color drives their ribbon on calendar events and pins on the map when jobs are assigned to them. After adjusting, use Save ribbon so scheduling and routing stay consistent with what your crew sees in the field.",
  },
  {
    id: "auto_assign",
    title: "Auto-assign new work",
    body:
      "When enabled, new items that should land on someone’s calendar can default to this user where your workflows support it (for example quotes or jobs flowing into the calendar). Turn it off if they should only receive work you assign manually.",
  },
  {
    id: "calendar_scheduling",
    title: "What they can do on Calendar",
    body:
      "Allow “Add item to calendar” if they should create their own holds and jobs from their Calendar tab. Turn on Scheduling tools if they need the extra scheduling and alerts surfaces you expose to trusted crew. Leave them off for a read-only or limited role.",
  },
  {
    id: "job_types",
    title: "Job types on their tab",
    body:
      "Control whether Job types is hidden, view-only, or fully editable on their portal. Read-only works well for specialists who need to see categories but should not rename or reorganize your library. Edit suits leads or leads who maintain your service list.",
  },
]

/** Shorter set for the office manager’s own card (same tab, but rules come from role). */
export const SELF_PERMISSIONS_GUIDANCE: PermissionsGuidanceBlock[] = [
  {
    id: "team_color_self",
    title: "Team color",
    body:
      "Your color on the team roster and map. Managed-user restrictions below do not apply to your own account; they only affect linked contractors.",
  },
  {
    id: "ribbon_self",
    title: "Ribbon & map",
    body:
      "Your calendar ribbon and map pin color. Save ribbon after changes so events and maps stay in sync.",
  },
  {
    id: "auto_self",
    title: "Auto-assign",
    body:
      "Whether new items that support auto-assignment can default to you when you are the selected assignee.",
  },
]
