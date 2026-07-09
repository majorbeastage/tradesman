import { useMemo, useState, type CSSProperties } from "react"
import WorkOrdersPage from "../work-orders/WorkOrdersPage"
import PurchaseOrdersPage from "../purchase-orders/PurchaseOrdersPage"
import PartsInventoryPage from "../parts-inventory/PartsInventoryPage"
import CalendarTeamManagementPanel from "../calendar/CalendarTeamManagementPanel"
import { theme } from "../../styles/theme"
import { useLocale } from "../../i18n/LocaleContext"
import { useAuth } from "../../contexts/AuthContext"
import { usePortalViewOptional } from "../../contexts/PortalViewContext"
import { isSandboxDemoUserId } from "../../lib/sandboxDemoTeam"
import { useManagedByOfficeManager } from "../../hooks/useManagedByOfficeManager"
import { useManagedOmCalendarPolicy } from "../../hooks/useManagedOmCalendarPolicy"
import { omCalendarPolicyNavContext, operationsSubModuleAllowedByPolicy } from "../../lib/teamCalendarPolicy"
import { isOfficeManagerLikeRole } from "../../lib/profileRoles"
import { useOfficeManagerScopeOptional } from "../../contexts/OfficeManagerScopeContext"
import { operationsSubModuleEnabled, type OperationsSubModuleId } from "../../types/portal-builder"

export type OperationsPageProps = {
  setPage?: (page: string) => void
  initialTab?: OperationsSubModuleId
}

const subNavBtn = (active: boolean): CSSProperties => ({
  padding: "10px 14px",
  borderRadius: 10,
  border: active ? "1px solid #0ea5e9" : `1px solid ${theme.border}`,
  background: active ? "linear-gradient(160deg, #e0f2fe 0%, #f8fafc 75%)" : "#fff",
  color: theme.text,
  fontWeight: 700,
  fontSize: 13,
  cursor: "pointer",
  textAlign: "left",
})

export default function OperationsPage({ setPage, initialTab = "work_orders" }: OperationsPageProps) {
  const { t } = useLocale()
  const { portalConfig, user, role } = useAuth()
  const scopeCtx = useOfficeManagerScopeOptional()
  const managedByOfficeManager = useManagedByOfficeManager()
  const omCalendarPolicy = useManagedOmCalendarPolicy()
  const portalView = usePortalViewOptional()
  const viewAsDemoUserId =
    portalView?.showViewBar && portalView.targetUserId && isSandboxDemoUserId(portalView.targetUserId)
      ? portalView.targetUserId
      : null
  const omPolicyNavContext = omCalendarPolicyNavContext(viewAsDemoUserId, managedByOfficeManager)
  const isOfficeManagerOrAdmin = isOfficeManagerLikeRole(role)
  const authUserId = user?.id ?? null

  const enabledTabs = useMemo(() => {
    const all: OperationsSubModuleId[] = ["work_orders", "purchase_orders", "invoicing", "inventory", "team_management"]
    return all.filter((id) => {
      if (id === "team_management") {
        return isOfficeManagerOrAdmin && operationsSubModuleEnabled(id, portalConfig)
      }
      if (!operationsSubModuleEnabled(id, portalConfig)) return false
      return operationsSubModuleAllowedByPolicy(id, omCalendarPolicy, omPolicyNavContext)
    })
  }, [portalConfig, isOfficeManagerOrAdmin, omCalendarPolicy, omPolicyNavContext])

  const [tab, setTab] = useState<OperationsSubModuleId>(() =>
    enabledTabs.includes(initialTab) ? initialTab : enabledTabs[0] ?? "work_orders",
  )

  const activeTab = enabledTabs.includes(tab) ? tab : enabledTabs[0] ?? "work_orders"

  const labels: Record<OperationsSubModuleId, string> = {
    work_orders: t("nav.work_orders"),
    purchase_orders: t("nav.purchase_orders"),
    invoicing: t("nav.invoicing"),
    inventory: t("nav.inventory"),
    team_management: t("nav.team_management"),
  }

  if (enabledTabs.length === 0) {
    return (
      <div style={{ padding: 24, maxWidth: 720 }}>
        <h1 style={{ margin: "0 0 8px", color: theme.text }}>{t("nav.operations")}</h1>
        <p style={{ margin: 0, color: "#64748b", lineHeight: 1.5 }}>{t("operations.notEnabled")}</p>
      </div>
    )
  }

  const roster =
    scopeCtx?.clients?.length && authUserId
      ? scopeCtx.clients
      : authUserId
        ? [{ userId: authUserId, label: "My account", email: user?.email ?? null, clientId: null, isSelf: true }]
        : []

  return (
    <div style={{ display: "grid", gap: 16, padding: "8px 0 24px" }}>
      <div>
        <h1 style={{ margin: "0 0 6px", fontSize: 22, color: theme.text }}>{t("nav.operations")}</h1>
        <p style={{ margin: 0, fontSize: 13, color: "#64748b", lineHeight: 1.45 }}>{t("operations.intro")}</p>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {enabledTabs.map((id) => (
          <button key={id} type="button" style={subNavBtn(activeTab === id)} onClick={() => setTab(id)}>
            {labels[id]}
          </button>
        ))}
      </div>

      <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 8 }}>
        {activeTab === "work_orders" ? <WorkOrdersPage setPage={setPage} embedded /> : null}
        {activeTab === "purchase_orders" ? <PurchaseOrdersPage setPage={setPage} embedded /> : null}
        {activeTab === "inventory" ? <PartsInventoryPage setPage={setPage} embedded /> : null}
        {activeTab === "invoicing" ? <OperationsInvoicingPanel setPage={setPage} /> : null}
        {activeTab === "team_management" && authUserId ? (
          <CalendarTeamManagementPanel
            officeManagerUserId={authUserId}
            viewerUserId={authUserId}
            roster={roster}
            managedOnly={(scopeCtx?.clients ?? []).filter((c) => !c.isSelf)}
            onOpenTimeClockWorkspace={setPage ? () => setPage("calendar") : undefined}
          />
        ) : null}
      </div>
    </div>
  )
}

function OperationsInvoicingPanel({ setPage }: { setPage?: (page: string) => void }) {
  const { t } = useLocale()
  return (
    <div style={{ padding: "8px 4px", maxWidth: 720 }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 18, color: theme.text }}>{t("nav.invoicing")}</h2>
      <p style={{ margin: "0 0 14px", fontSize: 14, color: "#64748b", lineHeight: 1.55 }}>{t("operations.invoicingIntro")}</p>
      {setPage ? (
        <button
          type="button"
          onClick={() => setPage("payments")}
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            border: "none",
            background: theme.primary,
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {t("operations.openPayments")}
        </button>
      ) : null}
    </div>
  )
}
