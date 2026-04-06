/**
 * Whitelist caption HTML for About Us image blocks: bold, italic, line breaks, span font-size only.
 */
const ALLOWED_TAGS = new Set(["strong", "b", "em", "i", "br", "span"])

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, "&quot;").replace(/</g, "&lt;")
}

function fontSizeFromStyle(style: string | null): string | null {
  if (!style) return null
  const m = style.match(/font-size\s*:\s*([^;]+)/i)
  if (!m) return null
  const v = m[1].trim()
  if (/^[\d.]+(px|rem|em)$/.test(v)) return v
  return null
}

function sanitizeElement(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (tag === "br") return "<br />"

  if (!ALLOWED_TAGS.has(tag)) {
    return Array.from(el.childNodes)
      .map((n) => sanitizeNode(n))
      .join("")
  }

  const inner = Array.from(el.childNodes)
    .map((n) => sanitizeNode(n))
    .join("")

  if (tag === "strong" || tag === "b") return `<strong>${inner}</strong>`
  if (tag === "em" || tag === "i") return `<em>${inner}</em>`
  if (tag === "span") {
    const fs = fontSizeFromStyle(el.getAttribute("style"))
    if (fs) return `<span style="font-size: ${escapeAttr(fs)}">${inner}</span>`
    return inner
  }
  return inner
}

function sanitizeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtmlText(node.textContent ?? "")
  if (node.nodeType === Node.ELEMENT_NODE) return sanitizeElement(node as Element)
  return ""
}

export function sanitizeAboutCaptionHtml(raw: string): string {
  if (!raw || typeof raw !== "string") return ""
  const trimmed = raw.trim()
  if (!trimmed) return ""
  try {
    const doc = new DOMParser().parseFromString(`<div>${trimmed}</div>`, "text/html")
    const wrapper = doc.body.firstElementChild
    if (!wrapper) return escapeHtmlText(trimmed)
    return Array.from(wrapper.childNodes)
      .map((n) => sanitizeNode(n))
      .join("")
  } catch {
    return escapeHtmlText(trimmed)
  }
}
