export type AboutUsBlock =
  | { id: string; type: "text"; body: string }
  | { id: string; type: "image"; url: string; alt: string }

export type AboutUsContent = {
  /** Hero / page title */
  title: string
  /** Subtitle under title */
  subtitle: string
  blocks: AboutUsBlock[]
}

export const ABOUT_US_SETTINGS_KEY = "tradesman_about_us"

export const DEFAULT_ABOUT_US_CONTENT: AboutUsContent = {
  title: "About Tradesman",
  subtitle: "Built by veterans for contractors who want to focus on the work—not the paperwork.",
  blocks: [
    {
      id: "intro",
      type: "text",
      body: "We are two United States veterans who built Tradesman to help small contractors and trades businesses manage leads, conversations, quotes, and scheduling in one place. Our mission is simple: give you back time for your customers and your craft.",
    },
  ],
}

export function parseAboutUsContent(raw: unknown): AboutUsContent {
  const base = DEFAULT_ABOUT_US_CONTENT
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...base, blocks: [...base.blocks] }
  const o = raw as Record<string, unknown>
  const title = typeof o.title === "string" && o.title.trim() ? o.title.trim() : base.title
  const subtitle = typeof o.subtitle === "string" ? o.subtitle : base.subtitle
  const blocksRaw = o.blocks
  const blocks: AboutUsBlock[] = []
  if (Array.isArray(blocksRaw)) {
    for (const item of blocksRaw) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      const b = item as Record<string, unknown>
      const id = typeof b.id === "string" && b.id ? b.id : `block-${blocks.length}`
      if (b.type === "text" && typeof b.body === "string") {
        blocks.push({ id, type: "text", body: b.body })
      } else if (b.type === "image" && typeof b.url === "string") {
        blocks.push({ id, type: "image", url: b.url, alt: typeof b.alt === "string" ? b.alt : "" })
      }
    }
  }
  if (blocks.length === 0) return { title, subtitle, blocks: [...base.blocks] }
  return { title, subtitle, blocks }
}
