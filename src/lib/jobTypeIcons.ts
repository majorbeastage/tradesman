/** Calendar / job-type icon catalog (emoji glyphs for lite profiles & calendar events). */

export type JobTypeIconId =
  | "none"
  | "typewriter"
  | "lawn_mower"
  | "chainsaw"
  | "tree"
  | "bush"
  | "brick"
  | "hammer"
  | "pipe"
  | "cake"
  | "cookie"
  | "car"
  | "truck"
  | "wheel"
  | "engine"
  | "wrench"
  | "people"
  | "person"
  | "boy"
  | "girl"
  | "paint"
  | "plug"
  | "snowflake"
  | "sun"
  | "water"
  | "roof"
  | "ladder"
  | "toolbox"

export const JOB_TYPE_ICON_OPTIONS: Array<{ id: JobTypeIconId; label: string; glyph: string }> = [
  { id: "none", label: "No icon", glyph: "" },
  { id: "lawn_mower", label: "Lawn mower", glyph: "🚜" },
  { id: "tree", label: "Tree", glyph: "🌳" },
  { id: "bush", label: "Bush", glyph: "🪴" },
  { id: "chainsaw", label: "Chainsaw", glyph: "🪚" },
  { id: "hammer", label: "Hammer & nail", glyph: "🔨" },
  { id: "brick", label: "Brick", glyph: "🧱" },
  { id: "pipe", label: "Pipe", glyph: "🔧" },
  { id: "wrench", label: "Wrench", glyph: "🪛" },
  { id: "toolbox", label: "Toolbox", glyph: "🧰" },
  { id: "paint", label: "Paint", glyph: "🎨" },
  { id: "plug", label: "Electrical", glyph: "🔌" },
  { id: "water", label: "Water", glyph: "💧" },
  { id: "roof", label: "Roof", glyph: "🏠" },
  { id: "ladder", label: "Ladder", glyph: "🪜" },
  { id: "truck", label: "Truck", glyph: "🚚" },
  { id: "car", label: "Car", glyph: "🚗" },
  { id: "wheel", label: "Wheel", glyph: "🛞" },
  { id: "engine", label: "Engine", glyph: "⚙️" },
  { id: "typewriter", label: "Office / typing", glyph: "⌨️" },
  { id: "people", label: "People", glyph: "👥" },
  { id: "person", label: "Person", glyph: "🧑" },
  { id: "boy", label: "Boy", glyph: "👦" },
  { id: "girl", label: "Girl", glyph: "👧" },
  { id: "cake", label: "Cake", glyph: "🎂" },
  { id: "cookie", label: "Cookie", glyph: "🍪" },
  { id: "sun", label: "Sun / outdoor", glyph: "☀️" },
  { id: "snowflake", label: "Cold weather", glyph: "❄️" },
]

export function glyphForJobTypeIcon(id: string | null | undefined): string {
  if (!id || id === "none") return ""
  return JOB_TYPE_ICON_OPTIONS.find((o) => o.id === id)?.glyph ?? ""
}

export const JOB_TYPE_CALENDAR_COLORS = [
  { hex: "#0ea5e9", label: "Sky" },
  { hex: "#22c55e", label: "Green" },
  { hex: "#f59e0b", label: "Amber" },
  { hex: "#ef4444", label: "Red" },
  { hex: "#8b5cf6", label: "Purple" },
  { hex: "#64748b", label: "Slate" },
  { hex: "#0f766e", label: "Teal" },
  { hex: "#F97316", label: "Orange" },
  { hex: "#ec4899", label: "Pink" },
  { hex: "#14b8a6", label: "Mint" },
]
