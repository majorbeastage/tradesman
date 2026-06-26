import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { theme } from "../styles/theme"
import { htmlToPlainText } from "../lib/emailSignature"
import { useIsMobile } from "../hooks/useIsMobile"
import {
  STARTER_EMAIL_TEMPLATES,
  applyEmailTemplatePlaceholders,
  type EmailTemplate,
} from "../lib/emailTemplates"

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
  signatureLogoUrl?: string | null
  onSignatureLogoUpload?: (file: File) => void
  onSignatureLogoClear?: () => void
  signatureLogoUploading?: boolean
  composeFiles: File[]
  onComposeFilesChange: (files: File[]) => void
  sending?: boolean
  onSend: () => void
  footerNote?: ReactNode
  defaultExpanded?: boolean
  templates?: EmailTemplate[]
  templateVars?: Record<string, string>
}

const FONT_SIZES = [
  { id: "sm", label: "Small", css: "13px" },
  { id: "md", label: "Normal", css: "15px" },
  { id: "lg", label: "Large", css: "18px" },
]

const FONT_FAMILIES = [
  { id: "default", label: "Default", exec: "inherit" },
  { id: "arial", label: "Arial", exec: "Arial" },
  { id: "georgia", label: "Georgia", exec: "Georgia" },
  { id: "verdana", label: "Verdana", exec: "Verdana" },
  { id: "times", label: "Times", exec: "Times New Roman" },
]

const readableInputStyle: CSSProperties = {
  ...theme.formInput,
  color: theme.text,
  background: "#fff",
}

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
    signatureLogoUrl,
    onSignatureLogoUpload,
    onSignatureLogoClear,
    signatureLogoUploading,
    composeFiles,
    onComposeFilesChange,
    sending,
    onSend,
    footerNote,
    defaultExpanded = true,
    templates = STARTER_EMAIL_TEMPLATES,
    templateVars = {},
  } = props

  const isMobile = useIsMobile()
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showCcBcc, setShowCcBcc] = useState(Boolean(cc.trim() || bcc.trim() || replyTo.trim()))
  const [showSignaturePanel, setShowSignaturePanel] = useState(false)
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

  const applyTemplate = useCallback(
    (templateId: string) => {
      const t = templates.find((x) => x.id === templateId)
      if (!t) return
      const applied = applyEmailTemplatePlaceholders(t, templateVars)
      onSubjectChange(applied.subject)
      onBodyHtmlChange(applied.bodyHtml)
      if (editorRef.current) editorRef.current.innerHTML = applied.bodyHtml
    },
    [templates, templateVars, onSubjectChange, onBodyHtmlChange],
  )

  const plainPreview = htmlToPlainText(bodyHtml).slice(0, 120)

  if (!expanded) {
    return (
      <div style={isMobile ? mobileShellStyle : shellStyle} className="email-compose-rich">
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
    <div
      style={isMobile ? mobileShellStyle : shellStyle}
      className={`email-compose-rich${isMobile ? " email-compose-rich--mobile" : ""}`}
    >
      <div style={headerBarStyle}>
        <span style={{ fontWeight: 800, fontSize: isMobile ? 13 : 14, color: theme.text }}>Compose email</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => setExpanded(false)} style={ghostBtnStyle}>
            Minimize
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: isMobile ? 8 : 10,
          padding: isMobile ? "10px 10px 12px" : "12px 14px 14px",
        }}
      >
        <Field label="To">
          <input
            value={primaryTo}
            onChange={(e) => onPrimaryToChange(e.target.value)}
            placeholder="customer@example.com"
            style={readableInputStyle}
          />
        </Field>
        <Field label="Additional recipients (To)">
          <input
            value={additionalTo}
            onChange={(e) => onAdditionalToChange(e.target.value)}
            placeholder="Comma-separated"
            style={readableInputStyle}
          />
        </Field>
        {!showCcBcc ? (
          <button type="button" onClick={() => setShowCcBcc(true)} style={{ ...ghostBtnStyle, alignSelf: "flex-start", padding: 0 }}>
            + Cc / Bcc / Reply-To
          </button>
        ) : (
          <>
            <Field label="CC">
              <input value={cc} onChange={(e) => onCcChange(e.target.value)} placeholder="Optional" style={readableInputStyle} />
            </Field>
            <Field label="BCC">
              <input value={bcc} onChange={(e) => onBccChange(e.target.value)} placeholder="Optional" style={readableInputStyle} />
            </Field>
            <Field label="Reply-To">
              <input value={replyTo} onChange={(e) => onReplyToChange(e.target.value)} placeholder="Optional override" style={readableInputStyle} />
            </Field>
          </>
        )}
        <input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Subject"
          style={{ ...readableInputStyle, fontSize: isMobile ? 16 : undefined }}
        />

        <div style={toolbarStyle} className="email-compose-toolbar">
          <ToolbarBtn label="Bold" onClick={() => exec("bold")} title="Bold" isMobile={isMobile}>
            <strong>B</strong>
          </ToolbarBtn>
          <ToolbarBtn label="Italic" onClick={() => exec("italic")} title="Italic" isMobile={isMobile}>
            <em>I</em>
          </ToolbarBtn>
          <ToolbarBtn label="Underline" onClick={() => exec("underline")} title="Underline" isMobile={isMobile}>
            <span style={{ textDecoration: "underline" }}>U</span>
          </ToolbarBtn>
          <span style={toolbarSep} />
          <ToolbarBtn label="Bullets" onClick={() => exec("insertUnorderedList")} title="Bullet list" isMobile={isMobile}>
            •≡
          </ToolbarBtn>
          <ToolbarBtn label="Numbered" onClick={() => exec("insertOrderedList")} title="Numbered list" isMobile={isMobile}>
            1.
          </ToolbarBtn>
          <ToolbarBtn label="Link" onClick={insertLink} title="Insert link" isMobile={isMobile}>
            🔗
          </ToolbarBtn>
          <span style={toolbarSep} />
          <select
            defaultValue="default"
            onChange={(e) => {
              const family = FONT_FAMILIES.find((f) => f.id === e.target.value)
              if (family && family.exec !== "inherit") exec("fontName", family.exec)
              syncEditor()
            }}
            style={{ ...readableInputStyle, width: "auto", padding: "4px 8px", fontSize: 12, margin: 0, minHeight: isMobile ? 44 : undefined }}
            title="Font family"
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select
            defaultValue="md"
            onChange={(e) => {
              const size = FONT_SIZES.find((f) => f.id === e.target.value)?.css ?? "15px"
              exec("fontSize", "3")
              if (editorRef.current) editorRef.current.style.fontSize = size
              syncEditor()
            }}
            style={{ ...readableInputStyle, width: "auto", padding: "4px 8px", fontSize: 12, margin: 0, minHeight: isMobile ? 44 : undefined }}
            title="Font size"
          >
            {FONT_SIZES.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          {templates.length > 0 ? (
            <>
              <span style={toolbarSep} />
              <select
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) applyTemplate(e.target.value)
                  e.target.value = ""
                }}
                style={{
                  ...readableInputStyle,
                  width: "auto",
                  padding: "4px 8px",
                  fontSize: 12,
                  margin: 0,
                  maxWidth: isMobile ? 140 : 180,
                  minHeight: isMobile ? 44 : undefined,
                }}
                title="Insert template"
              >
                <option value="">Template…</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>

        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncEditor}
          onBlur={syncEditor}
          data-placeholder="Write your message…"
          className="email-compose-editor"
          style={{
            ...editorStyle,
            minHeight: isMobile ? 140 : editorStyle.minHeight,
            maxHeight: isMobile ? undefined : editorStyle.maxHeight,
            fontSize: isMobile ? 16 : editorStyle.fontSize,
          }}
        />

        <Field label="Attachments (optional)">
          <input
            type="file"
            multiple
            onChange={(e) => onComposeFilesChange(Array.from(e.target.files ?? []))}
            style={{ fontSize: 13, color: theme.text }}
          />
          {composeFiles.length > 0 ? (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#64748b" }}>{composeFiles.length} file(s) selected</p>
          ) : null}
        </Field>

        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8 }}>
          <button
            type="button"
            onClick={() => setShowSignaturePanel((v) => !v)}
            style={{ ...ghostBtnStyle, padding: 0, marginBottom: showSignaturePanel ? 8 : 0 }}
          >
            {showSignaturePanel ? "− Hide signature" : "+ Email signature (saved to profile)"}
          </button>
          {showSignaturePanel ? (
            <div style={{ display: "grid", gap: 8 }}>
              <textarea
                value={signatureText}
                onChange={(e) => onSignatureTextChange(e.target.value)}
                onBlur={onSignatureBlur}
                rows={3}
                placeholder="Appended to every send. Use {{placeholders}} for company info."
                style={{ ...readableInputStyle, resize: "vertical", fontSize: 13 }}
              />
              {onSignatureLogoUpload ? (
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                  {signatureLogoUrl ? (
                    <img
                      src={signatureLogoUrl}
                      alt="Signature logo"
                      style={{ maxHeight: 48, maxWidth: 160, objectFit: "contain", border: `1px solid ${theme.border}`, borderRadius: 6 }}
                    />
                  ) : null}
                  <label style={{ fontSize: 12, fontWeight: 600, color: theme.text, cursor: "pointer" }}>
                    {signatureLogoUploading ? "Uploading…" : signatureLogoUrl ? "Replace logo" : "Add logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      disabled={signatureLogoUploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) onSignatureLogoUpload(f)
                        e.target.value = ""
                      }}
                      style={{ display: "none" }}
                    />
                  </label>
                  {signatureLogoUrl && onSignatureLogoClear ? (
                    <button type="button" onClick={() => void onSignatureLogoClear()} style={ghostBtnStyle}>
                      Remove logo
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className="email-compose-send-row"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          {footerNote ?? <span style={{ fontSize: 12, color: "#64748b" }}>Replies use your Tradesman business address.</span>}
          <button
            type="button"
            disabled={sending}
            onClick={onSend}
            style={{
              ...sendBtnStyle,
              width: isMobile ? "100%" : undefined,
              padding: isMobile ? "12px 18px" : sendBtnStyle.padding,
              fontSize: isMobile ? 16 : sendBtnStyle.fontSize,
            }}
          >
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

function ToolbarBtn({
  children,
  onClick,
  title,
  isMobile,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  title: string
  isMobile?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        ...toolbarBtnStyle,
        minWidth: isMobile ? 44 : toolbarBtnStyle.minWidth,
        minHeight: isMobile ? 44 : toolbarBtnStyle.height,
        height: isMobile ? 44 : toolbarBtnStyle.height,
      }}
    >
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

const mobileShellStyle: CSSProperties = {
  ...shellStyle,
  borderRadius: 10,
  boxShadow: "0 2px 12px rgba(15,23,42,0.06)",
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
