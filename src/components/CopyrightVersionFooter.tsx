import type { CSSProperties } from "react"
import { APP_VERSION } from "../constants/appVersion"

type Variant = "default" | "portal" | "about"

type Props = {
  variant?: Variant
  align?: "left" | "center"
  style?: CSSProperties
}

const variantStyles: Record<
  Variant,
  { color: string; versionColor?: string; borderTop?: string; paddingTop: number }
> = {
  default: { color: "#6b7280", paddingTop: 12 },
  portal: {
    color: "#9ca3af",
    versionColor: "#94a3b8",
    borderTop: "1px solid rgba(255,255,255,0.12)",
    paddingTop: 14,
  },
  about: {
    color: "rgba(255,255,255,0.55)",
    versionColor: "rgba(255,255,255,0.5)",
    borderTop: "1px solid rgba(255,255,255,0.1)",
    paddingTop: 24,
  },
}

/** © line plus Version x.y.z — version comes from root `package.json` (see `vite.config.ts` + `appVersion.ts`). */
export function CopyrightVersionFooter({ variant = "default", align = "left", style }: Props) {
  const year = new Date().getFullYear()
  const v = variantStyles[variant]
  return (
    <footer
      style={{
        marginTop: variant === "about" ? 48 : 0,
        paddingTop: v.paddingTop,
        paddingBottom: variant === "portal" ? 16 : 8,
        fontSize: 12,
        lineHeight: 1.45,
        color: v.color,
        borderTop: v.borderTop,
        textAlign: align,
        ...style,
      }}
    >
      <div>© {year} Tradesman. All rights reserved.</div>
      <div style={{ marginTop: 4, color: v.versionColor ?? v.color, fontSize: 11, opacity: variant === "default" ? 0.95 : 1 }}>
        Version {APP_VERSION}
      </div>
    </footer>
  )
}
