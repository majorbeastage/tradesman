import { useEffect, useState, useCallback, type CSSProperties } from "react"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import { AdminSortableRow } from "../../components/admin/AdminSortableRow"
import {
  ABOUT_US_SETTINGS_KEY,
  DEFAULT_ABOUT_US_CONTENT,
  parseAboutUsContent,
  type AboutUsBlock,
  type AboutUsContent,
} from "../../types/about-us"

function newTextBlock(): AboutUsBlock {
  return { id: crypto.randomUUID(), type: "text", body: "" }
}

function newImageBlock(): AboutUsBlock {
  return { id: crypto.randomUUID(), type: "image", url: "", alt: "" }
}

function reorderBlocks(blocks: AboutUsBlock[], from: number, to: number): AboutUsBlock[] {
  if (from === to || from < 0 || to < 0 || from >= blocks.length || to >= blocks.length) return blocks
  const next = [...blocks]
  const [removed] = next.splice(from, 1)
  next.splice(to, 0, removed)
  return next
}

export default function AdminAboutUsSection() {
  const [content, setContent] = useState<AboutUsContent>({
    ...DEFAULT_ABOUT_US_CONTENT,
    blocks: [...DEFAULT_ABOUT_US_CONTENT.blocks],
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError("")
    try {
      const { data, error: err } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", ABOUT_US_SETTINGS_KEY)
        .maybeSingle()
      if (err) throw err
      if (data?.value) setContent(parseAboutUsContent(data.value))
      else setContent({ ...DEFAULT_ABOUT_US_CONTENT, blocks: [...DEFAULT_ABOUT_US_CONTENT.blocks] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleSave() {
    if (!supabase) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const { error: err } = await supabase.from("platform_settings").upsert(
        {
          key: ABOUT_US_SETTINGS_KEY,
          value: {
            title: content.title.trim() || DEFAULT_ABOUT_US_CONTENT.title,
            subtitle: content.subtitle.trim(),
            blocks: content.blocks,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
      if (err) throw err
      setMessage("About Us page saved. Visitors will see it on the public About page.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function updateBlock(index: number, patch: Partial<AboutUsBlock>) {
    setContent((prev) => {
      const blocks = [...prev.blocks]
      const cur = blocks[index]
      if (!cur) return prev
      blocks[index] = { ...cur, ...patch } as AboutUsBlock
      return { ...prev, blocks }
    })
  }

  function removeBlock(index: number) {
    setContent((prev) => ({ ...prev, blocks: prev.blocks.filter((_, i) => i !== index) }))
  }

  const cardStyle: CSSProperties = {
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    marginBottom: 10,
  }

  return (
    <div>
      <AdminSettingBlock id="admin:about:header">
        <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>About Us page</h1>
        <p style={{ color: theme.text, opacity: 0.85, margin: 0, lineHeight: 1.55, fontSize: 14 }}>
          Edit the public About page (linked from the home page). Drag blocks by the handle to reorder. Add text sections or images (URL). Run{" "}
          <code style={{ fontSize: 12 }}>supabase-signup-new-user-role-about.sql</code> if anon users cannot load the page (public read policy on{" "}
          <code style={{ fontSize: 12 }}>platform_settings</code> for this key).
        </p>
      </AdminSettingBlock>

      {loading ? (
        <p style={{ color: theme.text }}>Loading…</p>
      ) : (
        <>
          <AdminSettingBlock id="admin:about:title_fields">
            <label style={{ display: "block", fontWeight: 600, marginBottom: 12, color: theme.text }}>
              Page title
              <input
                value={content.title}
                onChange={(e) => setContent((c) => ({ ...c, title: e.target.value }))}
                style={{ ...theme.formInput, width: "100%", maxWidth: 520, marginTop: 6, display: "block" }}
              />
            </label>
            <label style={{ display: "block", fontWeight: 600, color: theme.text }}>
              Subtitle
              <textarea
                value={content.subtitle}
                onChange={(e) => setContent((c) => ({ ...c, subtitle: e.target.value }))}
                style={{ ...theme.formInput, width: "100%", maxWidth: 640, marginTop: 6, minHeight: 72, display: "block" }}
              />
            </label>
          </AdminSettingBlock>

          <AdminSettingBlock id="admin:about:blocks">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 16, color: theme.text }}>Content blocks</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setContent((c) => ({ ...c, blocks: [...c.blocks, newTextBlock()] }))} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontWeight: 600 }}>
                  + Text
                </button>
                <button type="button" onClick={() => setContent((c) => ({ ...c, blocks: [...c.blocks, newImageBlock()] }))} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: theme.background, cursor: "pointer", fontWeight: 600 }}>
                  + Image
                </button>
              </div>
            </div>

            <p style={{ fontSize: 12, color: theme.text, opacity: 0.75, margin: "0 0 12px" }}>
              Drag the ⋮⋮ handle to reorder. Drop on another block to place above or below.
            </p>

            {content.blocks.map((block, index) => (
              <AdminSortableRow
                key={block.id}
                scope="about-us-blocks"
                index={index}
                onReorder={(from, to) => setContent((c) => ({ ...c, blocks: reorderBlocks(c.blocks, from, to) }))}
                rowStyle={cardStyle}
              >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: theme.primary, marginBottom: 8 }}>{block.type === "text" ? "TEXT" : "IMAGE"}</div>
                    {block.type === "text" ? (
                      <div style={{ display: "grid", gap: 10 }}>
                        <textarea
                          value={block.body}
                          onChange={(e) => updateBlock(index, { body: e.target.value })}
                          placeholder="Paragraph or bio text…"
                          style={{ ...theme.formInput, width: "100%", minHeight: 120, resize: "vertical" }}
                        />
                        <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                          Optional link URL
                          <input
                            value={block.link_url ?? ""}
                            onChange={(e) => updateBlock(index, { link_url: e.target.value })}
                            style={{ ...theme.formInput, width: "100%", marginTop: 4 }}
                            placeholder="https://…"
                          />
                        </label>
                        <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                          Optional link label
                          <input
                            value={block.link_label ?? ""}
                            onChange={(e) => updateBlock(index, { link_label: e.target.value })}
                            style={{ ...theme.formInput, width: "100%", marginTop: 4 }}
                            placeholder="Shown as the clickable text"
                          />
                        </label>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: 10 }}>
                        <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                          Image URL
                          <input
                            value={block.url}
                            onChange={(e) => updateBlock(index, { url: e.target.value })}
                            style={{ ...theme.formInput, width: "100%", marginTop: 4 }}
                            placeholder="https://…"
                          />
                        </label>
                        <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                          Alt / caption
                          <input
                            value={block.alt}
                            onChange={(e) => updateBlock(index, { alt: e.target.value })}
                            style={{ ...theme.formInput, width: "100%", marginTop: 4 }}
                          />
                        </label>
                        {block.url ? (
                          <img src={block.url} alt="" style={{ maxWidth: "100%", maxHeight: 200, objectFit: "contain", borderRadius: 8, border: `1px solid ${theme.border}` }} />
                        ) : null}
                      </div>
                    )}
                    <button type="button" onClick={() => removeBlock(index)} style={{ marginTop: 10, padding: "6px 10px", borderRadius: 6, border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", cursor: "pointer", fontSize: 12 }}>
                      Remove
                    </button>
                  </div>
              </AdminSortableRow>
            ))}
          </AdminSettingBlock>

          {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
          {message && <p style={{ color: "#059669" }}>{message}</p>}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            style={{
              padding: "12px 22px",
              background: theme.primary,
              color: "white",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving…" : "Save About Us page"}
          </button>
        </>
      )}
    </div>
  )
}
