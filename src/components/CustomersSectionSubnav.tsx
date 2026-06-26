import type { CSSProperties } from "react"
import { theme } from "../styles/theme"
import { openCustomersEmailClient, navigateToCustomersList } from "../lib/customersEmailClientNav"

type Props = {
  active: "customers" | "email"
  setPage?: (page: string) => void
  isMobile: boolean
}

export default function CustomersSectionSubnav({ active, setPage, isMobile }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 8,
        alignItems: "center",
        marginBottom: 12,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginRight: 4 }}>Customers</span>
      <SubnavBtn
        active={active === "customers"}
        onClick={() => navigateToCustomersList(setPage)}
        label="Events"
      />
      <SubnavBtn
        active={active === "email"}
        onClick={() => openCustomersEmailClient(setPage, isMobile)}
        label="Email"
        hint={isMobile ? undefined : "Opens in a new tab on desktop"}
      />
    </div>
  )
}

function SubnavBtn({
  active,
  onClick,
  label,
  hint,
}: {
  active: boolean
  onClick: () => void
  label: string
  hint?: string
}) {
  return (
    <button
      type="button"
      title={hint}
      onClick={onClick}
      style={{
        padding: "7px 14px",
        borderRadius: 8,
        border: active ? `2px solid ${theme.primary}` : `1px solid ${theme.border}`,
        background: active ? "#fff7ed" : "#fff",
        color: theme.text,
        fontWeight: active ? 800 : 600,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  )
}

export const customersSubnavWrapStyle: CSSProperties = {
  padding: "12px 12px 0",
  maxWidth: 1400,
  margin: "0 auto",
  width: "100%",
  boxSizing: "border-box",
}
