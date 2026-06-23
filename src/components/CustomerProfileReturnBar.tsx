import { useEffect, useState } from "react"
import { theme } from "../styles/theme"
import {
  clearCustomerProfileReturn,
  getCustomerProfileReturn,
  type CustomerProfileReturnState,
} from "../lib/customerProfileReturn"
import { queueCustomerProfile } from "../lib/customerNavigation"

type Props = {
  page: string
  onNavigate: (page: string) => void
}

export default function CustomerProfileReturnBar({ page, onNavigate }: Props) {
  const [state, setState] = useState<CustomerProfileReturnState | null>(() => getCustomerProfileReturn())

  useEffect(() => {
    setState(getCustomerProfileReturn())
  }, [page])

  if (!state || page === "customer-profile") return null

  return (
    <div
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 11000,
        display: "flex",
        alignItems: "stretch",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 8px 28px rgba(15,23,42,0.22)",
        border: `1px solid ${theme.border}`,
        background: "#fff",
        maxWidth: "min(360px, calc(100vw - 32px))",
      }}
    >
      <button
        type="button"
        onClick={() => {
          queueCustomerProfile(state.customerId)
          onNavigate("customer-profile")
        }}
        style={{
          flex: 1,
          border: "none",
          background: theme.primary,
          color: "#fff",
          fontWeight: 700,
          fontSize: 13,
          padding: "12px 14px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        ← Back to {state.customerName}
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          clearCustomerProfileReturn()
          setState(null)
        }}
        style={{
          border: "none",
          borderLeft: `1px solid ${theme.border}`,
          background: "#f8fafc",
          color: "#64748b",
          fontWeight: 800,
          fontSize: 16,
          width: 40,
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  )
}
