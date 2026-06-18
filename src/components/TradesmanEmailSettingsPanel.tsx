import { useCallback, useEffect, useMemo, useState } from "react"
import { supabase } from "../lib/supabase"
import { theme } from "../styles/theme"
import {
  PLATFORM_EMAIL_ROOT_DOMAIN,
  normalizePlatformEmailSlug,
  platformEmailAddressFromSlug,
  validatePlatformEmailSlugShape,
} from "../lib/platformEmailSlug"
import {
  PLATFORM_DEPARTMENT_KEYS,
  departmentEmailAddress,
} from "../lib/platformEmailDepartments"
import { CustomEmailDomainPanel } from "./CustomEmailDomainPanel"
import { useLocale } from "../i18n/LocaleContext"

type Props = {
  profileUserId: string
}

const inputStyle = { ...theme.formInput, width: "100%" }

export function TradesmanEmailSettingsPanel({ profileUserId }: Props) {
  const { t } = useLocale()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [slug, setSlug] = useState("")
  const [claimedSlug, setClaimedSlug] = useState<string | null>(null)
  const [forwardTo, setForwardTo] = useState("")
  const [claimedForwardTo, setClaimedForwardTo] = useState("")
  const [availability, setAvailability] = useState<"unknown" | "checking" | "available" | "taken" | "reserved">("unknown")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [deptEnabled, setDeptEnabled] = useState<Record<string, boolean>>({})
  const [deptSaving, setDeptSaving] = useState(false)
  const [deptMessage, setDeptMessage] = useState("")

  const normalizedSlug = useMemo(() => normalizePlatformEmailSlug(slug), [slug])
  const previewAddress = normalizedSlug ? platformEmailAddressFromSlug(normalizedSlug) : ""
  const shapeIssue = slug.trim() ? validatePlatformEmailSlugShape(slug) : null

  const loadRoute = useCallback(async () => {
    if (!supabase || !profileUserId) return
    setLoading(true)
    setError("")
    try {
      const { data: routeRow, error: routeErr } = await supabase
        .from("platform_email_routes")
        .select("local_part, forward_to_email")
        .eq("account_id", profileUserId)
        .eq("domain", PLATFORM_EMAIL_ROOT_DOMAIN)
        .eq("route_kind", "customer_primary")
        .maybeSingle()

      if (routeErr && !String(routeErr.message || "").includes("platform_email_routes")) {
        throw routeErr
      }

      let localPart = typeof routeRow?.local_part === "string" ? routeRow.local_part.trim() : ""
      let forward =
        typeof routeRow?.forward_to_email === "string" ? routeRow.forward_to_email.trim() : ""

      if (!localPart) {
        const { data: channelRow } = await supabase
          .from("client_communication_channels")
          .select("public_address, forward_to_email")
          .eq("user_id", profileUserId)
          .eq("channel_kind", "email")
          .eq("provider", "resend")
          .eq("active", true)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
        const pub = typeof channelRow?.public_address === "string" ? channelRow.public_address.trim().toLowerCase() : ""
        const suffix = `@${PLATFORM_EMAIL_ROOT_DOMAIN}`
        if (pub.endsWith(suffix)) {
          localPart = pub.slice(0, -suffix.length)
        }
        if (!forward && typeof channelRow?.forward_to_email === "string") {
          forward = channelRow.forward_to_email.trim()
        }
      }

      setSlug(localPart)
      setClaimedSlug(localPart || null)
      setForwardTo(forward)
      setClaimedForwardTo(forward)

      const { data: deptRows } = await supabase
        .from("platform_email_routes")
        .select("department_key")
        .eq("account_id", profileUserId)
        .eq("domain", PLATFORM_EMAIL_ROOT_DOMAIN)
        .eq("route_kind", "department")
      const enabled: Record<string, boolean> = {}
      for (const row of deptRows ?? []) {
        const key = typeof row.department_key === "string" ? row.department_key.trim() : ""
        if (key) enabled[key] = true
      }
      setDeptEnabled(enabled)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [profileUserId])

  useEffect(() => {
    void loadRoute()
  }, [loadRoute])

  useEffect(() => {
    if (!supabase || !normalizedSlug || shapeIssue) {
      setAvailability("unknown")
      return
    }
    const client = supabase
    if (claimedSlug && normalizedSlug === claimedSlug) {
      setAvailability("available")
      return
    }
    setAvailability("checking")
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data, error: rpcErr } = await client.rpc("is_platform_email_slug_available", {
          p_slug: normalizedSlug,
          p_account_id: profileUserId,
        })
        if (rpcErr) {
          if (String(rpcErr.message || "").includes("is_platform_email_slug_available")) {
            setAvailability("unknown")
            return
          }
          setAvailability("unknown")
          return
        }
        setAvailability(data === true ? "available" : "taken")
      })()
    }, 350)
    return () => window.clearTimeout(timer)
  }, [normalizedSlug, shapeIssue, claimedSlug, profileUserId])

  async function handleSave() {
    if (!supabase || !profileUserId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const issue = validatePlatformEmailSlugShape(slug)
      if (issue) {
        setError(t(`account.tradesmanEmail.err.${issue}`))
        return
      }
      if (availability === "taken") {
        setError(t("account.tradesmanEmail.err.taken"))
        return
      }
      const forwardTrim = forwardTo.trim().toLowerCase()
      if (forwardTrim && forwardTrim === previewAddress) {
        setError(t("account.tradesmanEmail.err.forwardSame"))
        return
      }

      const { data, error: claimErr } = await supabase.rpc("claim_platform_email_route", {
        p_account_id: profileUserId,
        p_slug: normalizedSlug,
        p_forward_to_email: forwardTrim || null,
      })
      if (claimErr) throw claimErr

      const result = data as { local_part?: string; public_address?: string; forward_to_email?: string | null } | null
      const savedSlug = typeof result?.local_part === "string" ? result.local_part : normalizedSlug
      setClaimedSlug(savedSlug)
      setSlug(savedSlug)
      const savedForward = typeof result?.forward_to_email === "string" ? result.forward_to_email : forwardTrim
      setForwardTo(savedForward)
      setClaimedForwardTo(savedForward)
      setMessage(t("account.tradesmanEmail.saved"))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveDepartments() {
    if (!supabase || !profileUserId || !claimedSlug) return
    setDeptSaving(true)
    setDeptMessage("")
    setError("")
    try {
      const keys = PLATFORM_DEPARTMENT_KEYS.filter((d) => deptEnabled[d.key]).map((d) => d.key)
      const { error: syncErr } = await supabase.rpc("sync_platform_department_routes", {
        p_account_id: profileUserId,
        p_enabled_keys: keys,
      })
      if (syncErr) throw syncErr
      setDeptMessage(t("account.tradesmanEmail.deptSaved"))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setDeptSaving(false)
    }
  }

  const slugChanged = normalizedSlug !== (claimedSlug ?? "")
  const forwardChanged = forwardTo.trim() !== claimedForwardTo.trim()
  const canSave =
    !saving &&
    !loading &&
    normalizedSlug.length >= 3 &&
    !shapeIssue &&
    (availability === "available" || (!slugChanged && forwardChanged)) &&
    (slugChanged || forwardChanged || !claimedSlug)

  if (loading) {
    return <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>{t("account.loading")}</p>
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <p style={{ margin: 0, fontSize: 13, color: "#475569", lineHeight: 1.5 }}>{t("account.tradesmanEmail.hubExplain")}</p>

      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          background: "#fff",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{t("account.tradesmanEmail.optionA")}</div>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{t("account.tradesmanEmail.optionADetail")}</p>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{t("account.tradesmanEmail.slugLabel")}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" }}>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="stillcreek"
              autoComplete="off"
              spellCheck={false}
              style={{ ...inputStyle, maxWidth: 200, borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
            />
            <span
              style={{
                padding: "10px 12px",
                border: `1px solid ${theme.border}`,
                borderLeft: "none",
                borderRadius: "0 8px 8px 0",
                background: "#f8fafc",
                fontSize: 13,
                color: "#475569",
                whiteSpace: "nowrap",
              }}
            >
              @{PLATFORM_EMAIL_ROOT_DOMAIN}
            </span>
          </div>
          {previewAddress ? (
            <span style={{ fontSize: 12, color: "#0f766e", fontWeight: 600 }}>{previewAddress}</span>
          ) : null}
          {shapeIssue ? (
            <span style={{ fontSize: 12, color: "#b91c1c" }}>{t(`account.tradesmanEmail.err.${shapeIssue}`)}</span>
          ) : null}
          {!shapeIssue && normalizedSlug && slugChanged && availability === "checking" ? (
            <span style={{ fontSize: 12, color: "#64748b" }}>{t("account.tradesmanEmail.checking")}</span>
          ) : null}
          {!shapeIssue && normalizedSlug && slugChanged && availability === "available" ? (
            <span style={{ fontSize: 12, color: "#0f766e" }}>{t("account.tradesmanEmail.available")}</span>
          ) : null}
          {!shapeIssue && normalizedSlug && slugChanged && availability === "taken" ? (
            <span style={{ fontSize: 12, color: "#b91c1c" }}>{t("account.tradesmanEmail.err.taken")}</span>
          ) : null}
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{t("account.tradesmanEmail.forwardLabel")}</span>
          <input
            type="email"
            value={forwardTo}
            onChange={(e) => setForwardTo(e.target.value)}
            placeholder="you@gmail.com"
            autoComplete="email"
            style={inputStyle}
          />
          <span style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>{t("account.tradesmanEmail.forwardHint")}</span>
        </label>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: canSave ? theme.primary : "#cbd5e1",
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: canSave ? "pointer" : "not-allowed",
            }}
          >
            {saving ? t("common.saving") : claimedSlug ? t("account.tradesmanEmail.save") : t("account.tradesmanEmail.claim")}
          </button>
          {claimedSlug ? (
            <span style={{ fontSize: 12, color: "#64748b" }}>
              {t("account.tradesmanEmail.active")}: <strong>{platformEmailAddressFromSlug(claimedSlug)}</strong>
            </span>
          ) : null}
        </div>
      </div>

      {claimedSlug ? (
        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: "#fff",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{t("account.tradesmanEmail.deptTitle")}</div>
          <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{t("account.tradesmanEmail.deptDetail")}</p>
          <div style={{ display: "grid", gap: 8 }}>
            {PLATFORM_DEPARTMENT_KEYS.map((dept) => {
              const addr = departmentEmailAddress(dept.key, claimedSlug)
              return (
                <label
                  key={dept.key}
                  style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: theme.text }}
                >
                  <input
                    type="checkbox"
                    checked={Boolean(deptEnabled[dept.key])}
                    onChange={(e) =>
                      setDeptEnabled((prev) => ({ ...prev, [dept.key]: e.target.checked }))
                    }
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <strong>{dept.label}</strong>
                    <br />
                    <code style={{ fontSize: 12, color: "#0f766e" }}>{addr}</code>
                  </span>
                </label>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => void handleSaveDepartments()}
            disabled={deptSaving}
            style={{
              padding: "10px 18px",
              borderRadius: 8,
              border: "none",
              background: theme.primary,
              color: "#fff",
              fontWeight: 700,
              fontSize: 13,
              cursor: deptSaving ? "wait" : "pointer",
              justifySelf: "start",
            }}
          >
            {deptSaving ? t("common.saving") : t("account.tradesmanEmail.deptSave")}
          </button>
          {deptMessage ? <p style={{ margin: 0, fontSize: 12, color: "#0f766e", fontWeight: 600 }}>{deptMessage}</p> : null}
        </div>
      ) : null}

      <div
        style={{
          padding: 14,
          borderRadius: 10,
          border: `1px solid ${theme.border}`,
          background: "#f8fafc",
          display: "grid",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, color: theme.text }}>{t("account.tradesmanEmail.optionB")}</div>
        <p style={{ margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.45 }}>{t("account.tradesmanEmail.optionBDetail")}</p>
        <CustomEmailDomainPanel profileUserId={profileUserId} hasPrimaryTradesmanAddress={Boolean(claimedSlug)} />
      </div>

      {message ? <p style={{ margin: 0, fontSize: 13, color: "#0f766e", fontWeight: 600 }}>{message}</p> : null}
      {error ? <p style={{ margin: 0, fontSize: 13, color: "#b91c1c" }}>{error}</p> : null}
    </div>
  )
}
