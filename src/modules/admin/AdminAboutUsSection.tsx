import { useEffect, useState, useCallback, type CSSProperties } from "react"
import { AboutUsCaptionEditor } from "../../components/AboutUsCaptionEditor"
import { sanitizeAboutCaptionHtml } from "../../lib/sanitizeAboutCaptionHtml"
import { supabase } from "../../lib/supabase"
import { theme } from "../../styles/theme"
import { AdminSettingBlock } from "../../components/admin/AdminSettingChrome"
import { AdminSortableRow } from "../../components/admin/AdminSortableRow"
import {
  ABOUT_US_IMAGES_BUCKET,
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
  return { id: crypto.randomUUID(), type: "image", url: "", alt: "", caption_html: "" }
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function extForImageFile(file: File): string | null {
  const t = file.type
  if (t === "image/jpeg") return "jpg"
  if (t === "image/png") return "png"
  if (t === "image/webp") return "webp"
  if (t === "image/gif") return "gif"
  return null
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
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null)
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
      const blocksForSave = content.blocks.map((b) => {
        if (b.type !== "image") return b
        const cap = sanitizeAboutCaptionHtml(b.caption_html ?? "")
        if (cap) return { ...b, caption_html: cap }
        return { id: b.id, type: "image" as const, url: b.url, alt: b.alt }
      })
      const { error: err } = await supabase.from("platform_settings").upsert(
        {
          key: ABOUT_US_SETTINGS_KEY,
          value: {
            title: content.title.trim() || DEFAULT_ABOUT_US_CONTENT.title,
            subtitle: content.subtitle.trim(),
            blocks: blocksForSave,
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

  async function uploadImageForBlock(index: number, file: File) {
    if (!supabase) {
      setError("Supabase is not configured.")
      return
    }
    const block = content.blocks[index]
    if (block.type !== "image") return
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file (JPEG, PNG, WebP, or GIF).")
      return
    }
    const ext = extForImageFile(file)
    if (!ext) {
      setError("Unsupported image type. Use JPEG, PNG, WebP, or GIF.")
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Image must be 5 MB or smaller.")
      return
    }
    setError("")
    setMessage("")
    setUploadingBlockId(block.id)
    try {
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: upErr } = await supabase.storage.from(ABOUT_US_IMAGES_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      })
      if (upErr) throw upErr
      const { data } = supabase.storage.from(ABOUT_US_IMAGES_BUCKET).getPublicUrl(path)
      const publicUrl = data.publicUrl
      updateBlock(index, { url: publicUrl })
      setMessage("Image uploaded. Click “Save About Us page” to publish.")
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadingBlockId(null)
    }
  }

  const cardStyle: CSSProperties = {
    padding: 14,
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    marginBottom: 10,
  }

  const secondaryOutlineButton: CSSProperties = {
    padding: "8px 14px",
    borderRadius: 8,
    border: `1px solid ${theme.border}`,
    background: "#fff",
    color: theme.text,
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 14,
  }

  return (
    <div>
      <AdminSettingBlock id="admin:about:header">
        <h1 style={{ color: theme.text, margin: "0 0 8px", fontSize: 22 }}>About Us page</h1>
        <p style={{ color: theme.text, opacity: 0.85, margin: 0, lineHeight: 1.55, fontSize: 14 }}>
          Edit the public About page (linked from the home page). Drag blocks by the handle to reorder (order is left-to-right for consecutive photos). Upload
          images or paste a URL; use the caption toolbar for bold, italic, and font size. Run{" "}
          <code style={{ fontSize: 12 }}>supabase-signup-new-user-role-about.sql</code> if anon users cannot load the page, and{" "}
          <code style={{ fontSize: 12 }}>supabase-about-us-images-storage.sql</code> for image uploads (Storage bucket + policies).
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
                <button type="button" onClick={() => setContent((c) => ({ ...c, blocks: [...c.blocks, newTextBlock()] }))} style={secondaryOutlineButton}>
                  + Text
                </button>
                <button type="button" onClick={() => setContent((c) => ({ ...c, blocks: [...c.blocks, newImageBlock()] }))} style={secondaryOutlineButton}>
                  + Image
                </button>
              </div>
            </div>

            <p style={{ fontSize: 12, color: theme.text, opacity: 0.75, margin: "0 0 12px" }}>
              Drag the ⋮⋮ handle to reorder. Place multiple <strong>Image</strong> blocks next to each other in the list — they appear in one row on the public
              page (left to right). Separate them with a Text block if you need a new row.
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
                      <div style={{ display: "grid", gap: 12 }}>
                        <div
                          onDragOver={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            const f = e.dataTransfer.files?.[0]
                            if (f) void uploadImageForBlock(index, f)
                          }}
                          style={{
                            padding: 16,
                            borderRadius: 10,
                            border: `2px dashed ${uploadingBlockId === block.id ? theme.primary : theme.border}`,
                            background: uploadingBlockId === block.id ? "rgba(249,115,22,0.06)" : "#fafafa",
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text, marginBottom: 8 }}>Photo</div>
                          <p style={{ margin: "0 0 10px", fontSize: 12, color: theme.text, opacity: 0.8 }}>
                            Drag and drop an image here, or choose a file. JPEG, PNG, WebP, or GIF — max 5 MB.
                          </p>
                          <label style={{ display: "inline-block", padding: "8px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "#fff", fontWeight: 600, fontSize: 13, cursor: uploadingBlockId === block.id ? "wait" : "pointer" }}>
                            {uploadingBlockId === block.id ? "Uploading…" : "Choose image file"}
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              disabled={uploadingBlockId === block.id}
                              style={{ display: "none" }}
                              onChange={(e) => {
                                const f = e.target.files?.[0]
                                e.target.value = ""
                                if (f) void uploadImageForBlock(index, f)
                              }}
                            />
                          </label>
                        </div>
                        <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                          Or image URL
                          <input
                            value={block.url}
                            onChange={(e) => updateBlock(index, { url: e.target.value })}
                            style={{ ...theme.formInput, width: "100%", marginTop: 4 }}
                            placeholder="https://…"
                          />
                        </label>
                        <label style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                          Alt text (screen readers)
                          <input
                            value={block.alt}
                            onChange={(e) => updateBlock(index, { alt: e.target.value })}
                            style={{ ...theme.formInput, width: "100%", marginTop: 4 }}
                            placeholder="Short description of the photo"
                          />
                        </label>
                        <AboutUsCaptionEditor
                          value={block.caption_html ?? ""}
                          onChange={(caption_html) => updateBlock(index, { caption_html })}
                          disabled={uploadingBlockId === block.id}
                        />
                        {block.url ? (
                          <img src={block.url} alt="" style={{ maxWidth: "100%", maxHeight: 220, objectFit: "contain", borderRadius: 8, border: `1px solid ${theme.border}` }} />
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
