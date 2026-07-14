import { useRef, useState, type ChangeEvent } from "react"
import { theme } from "../styles/theme"
import { useAppScheme } from "../contexts/AppSchemeContext"
import { APP_SCHEME_DEFINITIONS, type AppSchemeId } from "../lib/appSchemes"
import { schemePickerPreviewImage, schemePickerPreviewTileSize } from "../lib/themeSchemeAssets"

type Props = {
  profileUserId: string
  canEdit: boolean
}

function SchemeThumbnail({
  id,
  selected,
  onSelect,
}: {
  id: AppSchemeId
  selected: boolean
  onSelect: () => void
}) {
  const def = APP_SCHEME_DEFINITIONS.find((d) => d.id === id)!
  const photoBg = schemePickerPreviewImage(id)
  const photoTile = schemePickerPreviewTileSize(id)
  return (
    <button
      type="button"
      className="scheme-picker-tile"
      data-selected={selected ? "true" : "false"}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <div className="scheme-picker-preview" data-app-scheme={id}>
        <div
          className="scheme-picker-preview-sidebar"
          style={
            photoBg
              ? {
                  backgroundImage: `linear-gradient(rgba(0,0,0,0.35), rgba(0,0,0,0.35)), url(${photoBg})`,
                  backgroundSize: `100% 100%, ${photoTile ?? "64px 64px"}`,
                  backgroundRepeat: "no-repeat, repeat",
                  backgroundPosition: "center top",
                }
              : { background: def.preview.sidebar }
          }
        />
        <div
          className="scheme-picker-preview-main"
          style={{ background: def.preview.shell }}
        >
          <div className="scheme-picker-preview-bar" style={{ background: def.preview.accent }} />
          <div className="scheme-picker-preview-chip" style={{ background: def.preview.card, border: "1px solid rgba(15,23,42,0.08)" }} />
        </div>
      </div>
      <div className="scheme-picker-label">
        {def.label}
        <span className="scheme-picker-tagline">{def.tagline}</span>
      </div>
    </button>
  )
}

export default function AppSchemePicker({ profileUserId, canEdit }: Props) {
  const { schemeId, scheme, saving, loading, setSchemeId, updateCustom, uploadCustomLogo } = useAppScheme()
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)

  async function pickScheme(id: AppSchemeId) {
    if (!canEdit) return
    setErr(null)
    setMsg(null)
    try {
      await setSchemeId(id)
      setMsg("Scheme saved.")
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function onLogoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file || !canEdit) return
    if (!file.type.startsWith("image/")) {
      setErr("Choose a PNG or JPEG logo.")
      return
    }
    setErr(null)
    setMsg(null)
    try {
      await uploadCustomLogo(file)
      setMsg("Custom logo uploaded.")
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  async function saveCustomColor(key: "primaryColor" | "accentColor" | "backgroundColor" | "sidebarColor", value: string) {
    if (!canEdit) return
    setErr(null)
    try {
      await updateCustom({ [key]: value })
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    }
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: 13, color: theme.text }}>Loading appearance…</p>
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      {saving ? <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Saving…</p> : null}
      <div className="scheme-picker-grid">
        {APP_SCHEME_DEFINITIONS.map((def) => (
          <SchemeThumbnail
            key={def.id}
            id={def.id}
            selected={schemeId === def.id}
            onSelect={() => void pickScheme(def.id)}
          />
        ))}
      </div>

      {schemeId === "custom" ? (
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 10,
            background: "#fafafa",
          }}
        >
          <strong style={{ fontSize: 13, color: theme.text }}>Custom brand</strong>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div
              style={{
                width: 120,
                height: 72,
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {scheme.custom.logoUrl ? (
                <img src={scheme.custom.logoUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              ) : (
                <span style={{ fontSize: 11, color: "#94a3b8" }}>No logo</span>
              )}
            </div>
            {canEdit ? (
              <>
                <input ref={logoInputRef} type="file" accept="image/*" hidden onChange={(e) => void onLogoChange(e)} />
                <button
                  type="button"
                  style={{ ...theme.formInput, width: "fit-content", cursor: "pointer", fontWeight: 600 }}
                  onClick={() => logoInputRef.current?.click()}
                >
                  Upload your logo
                </button>
              </>
            ) : null}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
            {(
              [
                ["primaryColor", "Primary"],
                ["accentColor", "Accent"],
                ["backgroundColor", "Background"],
                ["sidebarColor", "Sidebar"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>
                {label}
                <input
                  type="color"
                  value={scheme.custom[key]}
                  disabled={!canEdit || saving}
                  onChange={(e) => void saveCustomColor(key, e.target.value)}
                  style={{ display: "block", marginTop: 4, width: "100%", height: 36, cursor: canEdit ? "pointer" : "not-allowed" }}
                />
              </label>
            ))}
          </div>
        </div>
      ) : null}

      {!canEdit && profileUserId ? (
        <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>Sign in as this user to change their scheme.</p>
      ) : null}
      {msg ? <p style={{ margin: 0, fontSize: 12, color: "#059669" }}>{msg}</p> : null}
      {err ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{err}</p> : null}
    </div>
  )
}
