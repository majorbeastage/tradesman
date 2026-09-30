import type { CSSProperties } from "react"
import { theme } from "../styles/theme"
import { DOCUMENT_NUMBER_DIGIT_OPTIONS } from "../lib/documentNumberFormat"
import {
  DEFAULT_DOCUMENT_PRIMARY_COLOR,
  DEFAULT_DOCUMENT_SECONDARY_COLOR,
  type DocumentVisualStyle,
} from "../lib/documentVisualTemplate"

const fieldInput: CSSProperties = { ...theme.formInput, width: "100%", boxSizing: "border-box" }

export function CustomerAccountNumberFields(props: {
  enabled: boolean
  prefix: string
  digits: string
  preview: string
  onEnabled: (value: boolean) => void
  onPrefix: (value: string) => void
  onDigits: (value: string) => void
}) {
  return (
    <div style={{ display: "grid", gap: 8, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${theme.border}` }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600 }}>
        <input type="checkbox" checked={props.enabled} onChange={(e) => props.onEnabled(e.target.checked)} />
        Create customer account numbers
      </label>
      <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
        When this is on, each customer gets an account number from the template below. The same sequence is used on estimates, invoices, and receipts.
      </p>
      {props.enabled ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
              Account prefix
              <input value={props.prefix} onChange={(e) => props.onPrefix(e.target.value.slice(0, 24))} style={fieldInput} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
              Digits
              <select value={props.digits} onChange={(e) => props.onDigits(e.target.value)} style={fieldInput}>
                {DOCUMENT_NUMBER_DIGIT_OPTIONS.map((d) => (
                  <option key={d} value={String(d)}>
                    {d} digits
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: "#475569" }}>
            Preview: <strong>{props.preview}</strong>
          </p>
        </>
      ) : null}
    </div>
  )
}

export function DocumentVisualTemplateFields(props: {
  name: string
  style: DocumentVisualStyle
  primaryColor: string
  secondaryColor: string
  onStyle: (value: DocumentVisualStyle) => void
  onPrimary: (value: string) => void
  onSecondary: (value: string) => void
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
        <input type="radio" name={props.name} checked={props.style === "basic"} onChange={() => props.onStyle("basic")} />
        <span>
          <strong>Basic</strong>
          <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Lists the line items from the fields you turn on. No color bands or section blocks.
          </span>
        </span>
      </label>
      <label style={{ display: "flex", gap: 8, fontSize: 13, alignItems: "flex-start" }}>
        <input
          type="radio"
          name={props.name}
          checked={props.style === "graphical"}
          onChange={() => props.onStyle("graphical")}
        />
        <span>
          <strong>Graphical</strong>
          <span style={{ display: "block", fontSize: 12, color: "#64748b", marginTop: 2 }}>
            Puts the business header, bill-to, service details, and totals into separate sections. Uses the logo already saved on MyT or Estimates.
          </span>
        </span>
      </label>
      {props.style === "graphical" ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            Primary color
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={props.primaryColor || DEFAULT_DOCUMENT_PRIMARY_COLOR}
                onChange={(e) => props.onPrimary(e.target.value)}
                aria-label="Primary color"
              />
              <input value={props.primaryColor} onChange={(e) => props.onPrimary(e.target.value)} style={fieldInput} />
            </span>
          </label>
          <label style={{ display: "grid", gap: 4, fontSize: 12, fontWeight: 600 }}>
            Secondary color
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="color"
                value={props.secondaryColor || DEFAULT_DOCUMENT_SECONDARY_COLOR}
                onChange={(e) => props.onSecondary(e.target.value)}
                aria-label="Secondary color"
              />
              <input value={props.secondaryColor} onChange={(e) => props.onSecondary(e.target.value)} style={fieldInput} />
            </span>
          </label>
        </div>
      ) : null}
    </div>
  )
}
