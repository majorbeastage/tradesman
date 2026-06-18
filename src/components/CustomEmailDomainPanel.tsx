import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  customEmailAddress,
  normalizeCustomEmailDomain,
  validateCustomEmailDomainShape,
} from "../lib/customEmailDomain"
import { normalizePlatformEmailSlug } from "../lib/platformEmailSlug"
import { useLocale } from "../i18n/LocaleContext"

type Props = {
  profileUserId: string
  hasPrimaryTradesmanAddress: boolean
}

type DomainRow = {
  id: string
  domain: string
  status: string
  verification_token?: string
  verified_at?: string | null
}

type CustomRouteRow = {
  id: string
  local_part: string
  domain: string
}

const inputStyle = { ...theme.formInput, width: "100%" }

export function CustomEmailDomainPanel({ profileUserId, hasPrimaryTradesmanAddress }: Props) {
  const { t } = useLocale()
  const [loading, setLoading] = useState(true)
  const [domainInput, setDomainInput] = useState("")
  const [localPart, setLocalPart] = useState("info")
  const [domainRow, setDomainRow] = useState<DomainRow | null>(null)
  const [customRoute, setCustomRoute] = useState<CustomRouteRow | null>(null)
  const [registering, setRegistering] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [claiming, setClaiming] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const normalizedDomain = useMemo(() => normalizeCustomEmailDomain(domainInput), [domainInput])
  const domainIssue = domainInput.trim() ? validateCustomEmailDomainShape(domainInput) : null
  const normalizedLocal = useMemo(() => normalizePlatformEmailSlug(localPart), [localPart])
  const previewAddress =
    normalizedDomain && normalizedLocal ? customEmailAddress(normalizedLocal, normalizedDomain) : ""
  const isVerified = domainRow?.status === "verified"
  const txtToken = domainRow?.verification_token ?? ""

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const session = await supabase?.auth.getSession()
    const token = session?.data.session?.access_token
    if (!token) throw new Error("Not signed in")
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  }, [])

  const loadStatus = useCallback(async () => {
    if (!supabase || !profileUserId) return
    setLoading(true)
    setError("")
    try {
      const headers = await authHeaders()
      const res = await fetch("/api/platform-tools?__route=platform-email-domain-status", { headers })
      const json = (await res.json()) as {
        error?: string
        domains?: DomainRow[]
        customRoutes?: CustomRouteRow[]
      }
      if (!res.ok) throw new Error(json.error || "Failed to load custom domain status")
      const domains = json.domains ?? []
      const routes = json.customRoutes ?? []
      const latest = domains[0] ?? null
      setDomainRow(latest)
      if (latest?.domain) setDomainInput(latest.domain)
      const route = routes[0] ?? null
      setCustomRoute(route)
      if (route?.local_part) setLocalPart(route.local_part)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [authHeaders, profileUserId])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  async function handleRegister() {
    setRegistering(true)
    setMessage("")
    setError("")
    try {
      const headers = await authHeaders()
      const res = await fetch("/api/platform-tools?__route=platform-email-domain-register", {
        method: "POST",
        headers,
        body: JSON.stringify({ domain: normalizedDomain }),
      })
      const json = (await res.json()) as DomainRow & { error?: string; txt_value?: string }
      if (!res.ok) throw new Error(json.error || "Register failed")
      setDomainRow({
        id: String(json.id ?? ""),
        domain: normalizedDomain,
        status: String(json.status ?? "pending"),
        verification_token: String(json.verification_token ?? json.txt_value ?? ""),
      })
      setMessage(t("account.tradesmanEmail.custom.registered"))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRegistering(false)
    }
  }

  async function handleVerify() {
    setVerifying(true)
    setMessage("")
    setError("")
    try {
      const headers = await authHeaders()
      const res = await fetch("/api/platform-tools?__route=platform-email-domain-verify", {
        method: "POST",
        headers,
        body: JSON.stringify({ domain: domainRow?.domain || normalizedDomain }),
      })
      const json = (await res.json()) as { error?: string; hint?: string; verified?: boolean }
      if (!res.ok) throw new Error(json.hint || json.error || "Verification failed")
      setDomainRow((prev) => (prev ? { ...prev, status: "verified" } : prev))
      setMessage(t("account.tradesmanEmail.custom.verified"))
      await loadStatus()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setVerifying(false)
    }
  }

  async function handleClaim() {
    setClaiming(true)
    setMessage("")
    setError("")
    try {
      const headers = await authHeaders()
      const res = await fetch("/api/platform-tools?__route=platform-email-domain-claim", {
        method: "POST",
        headers,
        body: JSON.stringify({
          domain: domainRow?.domain || normalizedDomain,
          localPart: normalizedLocal,
          preferForOutbound: true,
        }),
      })
      const json = (await res.json()) as CustomRouteRow & { error?: string; public_address?: string }
      if (!res.ok) throw new Error(json.error || "Claim failed")
      setCustomRoute({
        id: String(json.id ?? ""),
        local_part: normalizedLocal,
        domain: domainRow?.domain || normalizedDomain,
      })
      setMessage(t("account.tradesmanEmail.custom.claimed"))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setClaiming(false)
    }
  }

  if (loading) {
    return <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{t("common.loading")}</p>
  }

  if (!hasPrimaryTradesmanAddress) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>
        {t("account.tradesmanEmail.custom.needPrimary")}
      </p>
    )
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{t("account.tradesmanEmail.custom.domainLabel")}</span>
        <input
          type="text"
          value={domainInput}
          onChange={(e) => setDomainInput(e.target.value)}
          placeholder="stillcreeklandscaping.com"
          disabled={isVerified}
          style={inputStyle}
        />
        {domainIssue === "platform_domain" ? (
          <span style={{ fontSize: 11, color: "#b91c1c" }}>{t("account.tradesmanEmail.custom.err.platformDomain")}</span>
        ) : domainIssue ? (
          <span style={{ fontSize: 11, color: "#b91c1c" }}>{t("account.tradesmanEmail.custom.err.invalid")}</span>
        ) : null}
      </label>

      {!isVerified ? (
        <button
          type="button"
          onClick={() => void handleRegister()}
          disabled={registering || !!domainIssue || !normalizedDomain}
          style={{
            padding: "10px 18px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 700,
            fontSize: 13,
            cursor: registering ? "wait" : "pointer",
            justifySelf: "start",
            opacity: registering || domainIssue || !normalizedDomain ? 0.6 : 1,
          }}
        >
          {registering ? t("common.saving") : t("account.tradesmanEmail.custom.register")}
        </button>
      ) : null}

      {txtToken && !isVerified ? (
        <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5, padding: 10, background: "#f1f5f9", borderRadius: 8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t("account.tradesmanEmail.custom.dnsTitle")}</div>
          <div>
            {t("account.tradesmanEmail.custom.dnsTxt")}{" "}
            <code>_tradesman-verify.{domainRow?.domain || normalizedDomain}</code>
          </div>
          <div style={{ marginTop: 6 }}>
            {t("account.tradesmanEmail.custom.dnsValue")} <code>{txtToken}</code>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, color: "#64748b" }}>{t("account.tradesmanEmail.custom.dnsMxHint")}</div>
          <button
            type="button"
            onClick={() => void handleVerify()}
            disabled={verifying}
            style={{
              marginTop: 10,
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 12,
              cursor: verifying ? "wait" : "pointer",
            }}
          >
            {verifying ? t("account.tradesmanEmail.custom.verifying") : t("account.tradesmanEmail.custom.verify")}
          </button>
        </div>
      ) : null}

      {isVerified ? (
        <div style={{ display: "grid", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#0f766e", fontWeight: 600 }}>
            {t("account.tradesmanEmail.custom.verifiedBadge")}: {domainRow?.domain}
          </span>
          <label style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{t("account.tradesmanEmail.custom.localLabel")}</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <input
                type="text"
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value)}
                style={{ ...inputStyle, maxWidth: 180 }}
              />
              <span style={{ fontSize: 13, color: "#64748b" }}>@{domainRow?.domain}</span>
            </div>
            {previewAddress ? (
              <span style={{ fontSize: 11, color: "#64748b" }}>
                {t("account.tradesmanEmail.custom.preview")}: <code>{previewAddress}</code>
              </span>
            ) : null}
          </label>
          <button
            type="button"
            onClick={() => void handleClaim()}
            disabled={claiming || !normalizedLocal}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: claiming ? "wait" : "pointer",
              justifySelf: "start",
            }}
          >
            {claiming ? t("common.saving") : customRoute ? t("account.tradesmanEmail.custom.update") : t("account.tradesmanEmail.custom.claim")}
          </button>
          {customRoute ? (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {t("account.tradesmanEmail.custom.active")}:{" "}
              <strong>{customEmailAddress(customRoute.local_part, customRoute.domain)}</strong>
            </span>
          ) : null}
        </div>
      ) : null}

      {message ? <p style={{ margin: 0, fontSize: 12, color: "#0f766e", fontWeight: 600 }}>{message}</p> : null}
      {error ? <p style={{ margin: 0, fontSize: 12, color: "#b91c1c" }}>{error}</p> : null}
    </div>
  )
}
