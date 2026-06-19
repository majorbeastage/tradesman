/** Demo team personas for training sandbox — not real auth users. */

export const SANDBOX_DEMO_USER_ID_PREFIX = "sandbox-demo-"

export type SandboxDemoTeamMember = {
  id: string
  label: string
  role: string
  email: string
  title?: string
}

export const DEFAULT_SANDBOX_DEMO_TEAM: SandboxDemoTeamMember[] = [
  {
    id: "sandbox-demo-office-maria",
    label: "Maria Ortiz",
    title: "Office manager",
    role: "office_manager",
    email: "maria.demo@example.invalid",
  },
  {
    id: "sandbox-demo-field-jake",
    label: "Jake Miller",
    title: "Field technician",
    role: "user",
    email: "jake.demo@example.invalid",
  },
  {
    id: "sandbox-demo-field-sam",
    label: "Sam Rivera",
    title: "External contractor",
    role: "corporate_external",
    email: "sam.demo@example.invalid",
  },
  {
    id: "sandbox-demo-internal-lee",
    label: "Lee Chen",
    title: "Internal staff",
    role: "corporate_internal",
    email: "lee.demo@example.invalid",
  },
]
