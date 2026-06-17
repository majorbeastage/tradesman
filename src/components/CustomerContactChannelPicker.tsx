import { theme } from "../styles/theme"

type Props = {
  channel: "phone" | "email"
  options: string[]
  value: string
  onChange: (value: string) => void
  id?: string
}

export default function CustomerContactChannelPicker({ channel, options, value, onChange, id }: Props) {
  if (options.length <= 1) return null
  const label = channel === "phone" ? "Send call / text to" : "Send email to"
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#475569", fontWeight: 600 }}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...theme.formInput, padding: "6px 10px", fontSize: 13, maxWidth: "100%" }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}
