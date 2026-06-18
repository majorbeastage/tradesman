import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { theme } from "../styles/theme"
import { htmlToPlainText } from "../lib/emailSignature"

export type EmailComposeRichProps = {
  primaryTo: string
  onPrimaryToChange: (v: string) => void
  additionalTo: string
  onAdditionalToChange: (v: string) => void
  cc: string
  onCcChange: (v: string) => void
  bcc: string
  onBccChange: (v: string) => void
  replyTo: string
  onReplyToChange: (v: string) => void
  subject: string
  onSubjectChange: (v: string) => void
  bodyHtml: string
  onBodyHtmlChange: (html: string) => void
  signatureText: string
  onSignatureTextChange: (v: string) => void
  onSignatureBlur?: () => void
  composeFiles: File[]
  onComposeFilesChange: (files: File[]) => void
  sending?: boolean
  onSend: () => void
  footerNote?: ReactNode
  defaultExpanded?: boolean
}

const FONT_SIZES = [
  { id: "sm", label: "Small", css: "13px" },
  { id: "md", label: "Normal", css: "15px" },
  { id: "lg", label: "Large", css: "18px" },
]

export default function EmailComposeRich(props: EmailComposeRichProps) {
  const {
    primaryTo,
    onPrimaryToChange,
    additionalTo,
    onAdditionalToChange,
    cc,
    onCcChange,
    bcc,
    onBccChange,
    replyTo,
    onReplyToChange,
    subject,
    onSubjectChange,
    bodyHtml,
    onBodyHtmlChange,
    signatureText,
    onSignatureTextChange,
    onSignatureBlur,
    composeFiles,
    onComposeFilesChange,
    sending,
    onSend,
    footerNote,
    defaultExpanded = true,
  } = props

  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showCcBcc, setShowCcBcc] = useState(Boolean(cc.trim() || bcc.trim() || replyTo.trim()))
  const editorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    if (el.innerHTML !== bodyHtml) el.innerHTML = bodyHtml || ""
  }, [bodyHtml])

  const syncEditor = useCallback(() => {
    const html = editorRef.current?.innerHTML ?? ""
    onBodyHtmlChange(html)
  }, [onBodyHtmlChange])

  const exec = useCallback(
    (cmd: string, value?: string) => {
      editorRef.current?.focus()
      document.execCommand(cmd, false, value)
      syncEditor()
    },
    [syncEditor],
  )

  const insertLink = useCallback(() => {
    const url = window.prompt("Link URL (https://…)")
    if (!url?.trim()) return
    exec("createLink", url.trim())
  }, [exec])

  const plainPreview = htmlToPlainText(bodyHtml).slice(0, 120)

  if (!expanded) {
    return (
      <div style={shellStyle}>
        <button type="button" onClick={() => setExpanded(true)} style={minimizedBarStyle}>
          <span style={{ fontWeight: 700, color: theme.text }}>Compose email</span>
          <span style={{ flex: 1, color: "#64748b", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {subject.trim() || plainPreview || "New message"}
          </span>
          <span style={{ fontSize: 12, color: theme.primary, fontWeight: 700 }}>Expand</span>
        </button>
      </div>
    )
  }

  return (
    <div style={shellStyle}>
      <div style={headerBarStyle}>
        <span style={{ fontWeight: 800, fontSize: 14, color: theme.text }}>Compose email</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setExpanded(false)} style={ghostBtnStyle}>
            Minimize
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "12px 14px 14px" }}>
        <Field label="To">
          <input value={primaryTo} onChange={(e) => onPrimaryToChange(e.target.value)} placeholder="customer@example.com" style={theme.formInput} />
        </Field>
        <Field label="Additional recipients (To)">
          <input
            value={additionalTo}
            onChange={(e) => onAdditionalToChange(e.target.value)}
            placeholder="Comma-separated"
            style={theme.formInput}
          />
        </Field>
        {!showCcBcc ? (
          <button type="button" onClick={() => setShowCcBcc(true)} style={{ ...ghostBtnStyle, alignSelf: "flex-start", padding: 0 }}>
            + Cc / Bcc / Reply-To
          </button>
        ) : (
          <>
            <Field label="CC">
              <input value={cc} onChange={(e) => onCcChange(e.target.value)} placeholder="Optional" style={theme.formInput} />
            </Field>
            <Field label="BCC">
              <input value={bcc} onChange={(e) => onBccChange(e.target.value)} placeholder="Optional" style={theme.formInput} />
            </Field>
            <Field label="Reply-To">
              <input value={replyTo} onChange={(e) => onReplyToChange(e.target.value)} placeholder="Optional override" style={theme.formInput} />
            </Field>
          </>
        )}
        <input value={subject} onChange={(e) => onSubjectChange(e.target.value)} placeholder="Subject" style={theme.formInput} />

        <div style={toolbarStyle}>
          <ToolbarBtn label="Bold" onClick={() => exec("bold")} title="Bold">
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn label="Italic" onClick={() => exec("italic")} title="Italic">
            <em>I</em>
          </ToolbarBtn>
          <ToolbarBtn label="Underline" onClick={() => exec("underline")} title="Underline">
            <span style={{ textDecoration: "underline" }}>U</span>
          </ToolbarBtn>
          <span style={toolbarSep} />
          <ToolbarBtn label="Bullets" onClick={() => exec("insertUnorderedList")} title="Bullet list">
            •≡
          </ToolbarBtn>
          <ToolbarBtn label="Numbered" onClick={() => exec("insertOrderedList")} title="Numbered list">
            1.
          </ToolbarBtn>
          <ToolbarBtn label="Link" onClick={insertLink} title="Insert link">
            🔗
          </ToolbarBtn>
          <span style={toolbarSep} />
          <select
            defaultValue="md"
            onChange={(e) => {
              const size = FONT_SIZES.find((f) => f.id === e.target.value)?.css ?? "15px"
              exec("fontSize", "3")
              if (editorRef.current) editorRef.current.style.fontSize = size
              syncEditor()
            }}
            style={{ ...theme.formInput, width: "auto", padding: "4px 8px", fontSize: 12, margin: 0 }}
            title="Font size"
          >
            {FONT_SIZES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncEditor}
          onBlur={syncEditor}
          data-placeholder="Write your message…"
          style={editorStyle}
        />

        <Field label="Attachments (optional)">
          <input
            type="file"
            multiple
            onChange={(e) => onComposeFilesChange(Array.from(e.target.files ?? []))}
            style={{ fontSize: 13 }}
          />
          {composeFiles.length > 0 ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>{composeFiles.length} file(s) selected</p>
          ) : null}
        </Field>

        <Field label="Signature">
          <textarea
            value={signatureText}
            onChange={(e) => onSignatureTextChange(e.target.value)}
            onBlur={onSignatureBlur}
            rows={3}
            placeholder="Saved to your profile — appended to every send."
            style={{ ...theme.formInput, resize: "vertical", fontSize: 13 }}
          />
        </Field>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          {footerNote ?? <span style={{ fontSize: 12, color: "#64748b" }}>Replies use your Tradesman business address.</span>}
          <button type="button" disabled={sending} onClick={onSend} style={sendBtnStyle}>
            {sending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600, color: "#374151" }}>
      {label}
      {children}
    </label>
  )
}

function ToolbarBtn({ children, onClick, title }: { label: string; children: ReactNode; onClick: () => void; title: string }) {
  return (
    <button type="button" onClick={onClick} title={title} style={toolbarBtnStyle}>
      {children}
    </button>
  )
}

const shellStyle: CSSProperties = {
  borderRadius: 12,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  boxShadow: "0 8px 28px rgba(15,23,42,0.08)",
  overflow: "hidden",
}

const headerBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "10px 14px",
  borderBottom: `1px solid ${theme.border}`,
  background: "#f8fafc",
}

const minimizedBarStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "12px 14px",
  border: "none",
  background: "#fff",
  cursor: "pointer",
  textAlign: "left",
}

const toolbarStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 4,
  padding: "6px 8px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#f8fafc",
}

const toolbarBtnStyle: CSSProperties = {
  minWidth: 32,
  height: 32,
  padding: "0 8px",
  borderRadius: 6,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  color: theme.text,
}

const toolbarSep: CSSProperties = {
  width: 1,
  height: 22,
  background: theme.border,
  margin: "0 4px",
}

const editorStyle: CSSProperties = {
  minHeight: 160,
  maxHeight: 360,
  overflowY: "auto",
  padding: "12px 14px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: "#fff",
  fontSize: 15,
  lineHeight: 1.55,
  color: theme.text,
  outline: "none",
}

const ghostBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: theme.primary,
  fontWeight: 700,
  fontSize: 12,
  cursor: "pointer",
}

const sendBtnStyle: CSSProperties = {
  padding: "10px 18px",
  borderRadius: 8,
  border: "none",
  background: theme.primary,
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
}
