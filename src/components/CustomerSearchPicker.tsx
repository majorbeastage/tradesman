import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react"
import { theme } from "../styles/theme"

export type CustomerSearchPickerRow = {
  id: string
  display_name: string
  phone?: string
  email?: string
  service_address?: string
}

export function customerSearchPickerRowToContact(row: CustomerSearchPickerRow): {
  id: string
  display_name: string
  phone: string
  email: string
  service_address: string
} {
  return {
    id: row.id,
    display_name: row.display_name,
    phone: row.phone ?? "",
    email: row.email ?? "",
    service_address: row.service_address ?? "",
  }
}

export function formatCustomerSearchPickerLabel(c: CustomerSearchPickerRow): string {
  const name = (c.display_name ?? "").trim() || c.id
  const contact = c.phone?.trim() || c.email?.trim() || c.service_address?.trim()
  return contact ? `${name} · ${contact}` : name
}

export function filterCustomerSearchPickerRows(
  rows: CustomerSearchPickerRow[],
  query: string,
): CustomerSearchPickerRow[] {
  const tokens = query
    .replace(/·/g, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
  if (tokens.length === 0) return rows
  return rows.filter((c) => {
    const hay = [
      c.display_name,
      c.phone ?? "",
      c.email ?? "",
      c.service_address ?? "",
      c.id,
    ]
      .join(" ")
      .toLowerCase()
    return tokens.every((t) => hay.includes(t))
  })
}

type Props = {
  customers: CustomerSearchPickerRow[]
  value: string
  onChange: (id: string, row: CustomerSearchPickerRow | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
  placeholder?: string
  loading?: boolean
  disabled?: boolean
  label?: string
  listMaxHeight?: number
  /** Controlled search (calendar prefill). When omitted, search is internal. */
  searchQuery?: string
  onSearchQueryChange?: (q: string) => void
}

const optionStyle = (selected: boolean): CSSProperties => ({
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 14,
  border: "none",
  borderBottom: `1px solid ${theme.border}`,
  background: selected ? "#eff6ff" : "#fff",
  cursor: "pointer",
  color: theme.text,
  fontWeight: selected ? 700 : 500,
})

/**
 * Shared customer combobox: closed until the field is focused, then a dropdown
 * that filters as you type. Does not write customer records.
 */
export default function CustomerSearchPicker({
  customers,
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = "— No customer —",
  placeholder = "Type to search customers…",
  loading = false,
  disabled = false,
  label = "Customer",
  listMaxHeight = 220,
  searchQuery,
  onSearchQueryChange,
}: Props) {
  const [internalQuery, setInternalQuery] = useState("")
  const [open, setOpen] = useState(false)
  const query = searchQuery ?? internalQuery
  const setQuery = onSearchQueryChange ?? setInternalQuery
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const selectedRow = customers.find((c) => c.id === value) ?? null
  const selectedLabel = selectedRow ? formatCustomerSearchPickerLabel(selectedRow) : ""

  useEffect(() => {
    if (!value) {
      if (typeof document !== "undefined" && document.activeElement === inputRef.current) return
      if (!open) setQuery("")
      return
    }
    if (typeof document !== "undefined" && document.activeElement === inputRef.current) return
    if (selectedRow) setQuery(formatCustomerSearchPickerLabel(selectedRow))
    // Only fill the box when a customer is selected — never wipe in-progress typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, customers, open])

  const filterQuery = selectedLabel && query.trim() === selectedLabel.trim() ? "" : query
  const filtered = useMemo(
    () => filterCustomerSearchPickerRows(customers, filterQuery),
    [customers, filterQuery],
  )

  function restoreClosedLabel() {
    if (selectedRow) setQuery(formatCustomerSearchPickerLabel(selectedRow))
    else setQuery("")
  }

  function closeDropdown() {
    setOpen(false)
    restoreClosedLabel()
  }

  useEffect(() => {
    if (!open) return
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return
      closeDropdown()
    }
    document.addEventListener("mousedown", onDocMouseDown)
    return () => document.removeEventListener("mousedown", onDocMouseDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedRow])

  function openDropdown() {
    if (disabled || loading) return
    const wasClosed = !open
    setOpen(true)
    if (wasClosed) {
      requestAnimationFrame(() => inputRef.current?.select())
    }
  }

  function pickRow(row: CustomerSearchPickerRow) {
    onChange(row.id, row)
    setQuery(formatCustomerSearchPickerLabel(row))
    setOpen(false)
  }

  function pickEmpty() {
    onChange("", null)
    setQuery("")
    setOpen(false)
  }

  const inputStyle = {
    ...theme.formInput,
    marginTop: 0,
    width: "100%",
    boxSizing: "border-box" as const,
    paddingRight: 32,
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      {label ? <label style={{ fontSize: 12, color: theme.text, fontWeight: 600 }}>{label}</label> : null}
      <div style={{ position: "relative", marginTop: label ? 4 : 0 }}>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listId}
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={loading ? "Loading customers…" : placeholder}
          value={query}
          disabled={disabled || loading}
          onFocus={openDropdown}
          onClick={openDropdown}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === "Escape") {
              e.preventDefault()
              closeDropdown()
              inputRef.current?.blur()
              return
            }
            if (e.key === "ArrowDown") {
              e.preventDefault()
              setOpen(true)
              return
            }
            if (e.key === "Enter" && open) {
              e.preventDefault()
              if (filtered[0]) pickRow(filtered[0])
            }
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          style={inputStyle}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            color: "#64748b",
            fontSize: 12,
            lineHeight: 1,
          }}
        >
          {open ? "▴" : "▾"}
        </span>
      </div>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Matching customers"
          onMouseDown={(e) => e.preventDefault()}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "100%",
            zIndex: 40,
            marginTop: 4,
            maxHeight: listMaxHeight,
            overflowY: "auto",
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            background: "#fff",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.14)",
          }}
        >
          {allowEmpty ? (
            <button
              type="button"
              role="option"
              aria-selected={!value}
              disabled={disabled}
              onClick={pickEmpty}
              style={{ ...optionStyle(!value), color: "#64748b" }}
            >
              {emptyLabel}
            </button>
          ) : null}
          {filtered.length === 0 ? (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#64748b" }}>
              {loading ? "Loading…" : customers.length === 0 ? "No customers found." : "No matches."}
            </div>
          ) : (
            filtered.map((c) => {
              const rowLabel = formatCustomerSearchPickerLabel(c)
              const selected = value === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={disabled}
                  onClick={() => pickRow(c)}
                  style={optionStyle(selected)}
                >
                  {rowLabel}
                </button>
              )
            })
          )}
        </div>
      ) : null}
    </div>
  )
}
