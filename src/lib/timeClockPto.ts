/** PTO accrual, balances, requests — org-level config on business owner metadata. */

export type PtoAccrualPeriod = "week" | "month" | "year"

export type UserPtoPolicy = {
  userId: string
  accrualRateHours: number
  accrualPeriod: PtoAccrualPeriod
  /** Manual adjustment added to computed balance. */
  adjustmentHours: number
  maxBalanceHours: number | null
  carryoverAllowed: boolean
}

export type PtoRequestStatus = "pending" | "approved" | "denied" | "cancelled"

export type PtoRequest = {
  id: string
  userId: string
  startAt: string
  endAt: string
  hoursRequested: number
  note: string
  status: PtoRequestStatus
  approverUserId: string | null
  reviewedAt: string | null
  createOutOfOfficeEmail: boolean
  createdAt: string
}

export type UserPtoLedgerEntry = {
  id: string
  userId: string
  at: string
  hoursDelta: number
  reason: string
  requestId?: string
}

export type OrgPtoEngineV1 = {
  _v: 1
  policies: Record<string, UserPtoPolicy>
  requests: PtoRequest[]
  ledger: UserPtoLedgerEntry[]
}

export function defaultUserPtoPolicy(userId: string): UserPtoPolicy {
  return {
    userId,
    accrualRateHours: 0,
    accrualPeriod: "month",
    adjustmentHours: 0,
    maxBalanceHours: null,
    carryoverAllowed: true,
  }
}

export function defaultOrgPtoEngine(): OrgPtoEngineV1 {
  return { _v: 1, policies: {}, requests: [], ledger: [] }
}

export function parseOrgPtoEngine(metadata: unknown): OrgPtoEngineV1 {
  const base = defaultOrgPtoEngine()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>).pto_engine_v1
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const policies: Record<string, UserPtoPolicy> = {}
  if (o.policies && typeof o.policies === "object" && !Array.isArray(o.policies)) {
    for (const [userId, val] of Object.entries(o.policies as Record<string, unknown>)) {
      const p = parseUserPtoPolicy(userId, val)
      if (p) policies[userId] = p
    }
  }
  const requests = Array.isArray(o.requests) ? o.requests.map(parsePtoRequest).filter(Boolean) as PtoRequest[] : []
  const ledger = Array.isArray(o.ledger) ? o.ledger.map(parseLedgerEntry).filter(Boolean) as UserPtoLedgerEntry[] : []
  return { _v: 1, policies, requests, ledger }
}

function parseUserPtoPolicy(userId: string, raw: unknown): UserPtoPolicy | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const period = o.accrualPeriod
  const accrualPeriod: PtoAccrualPeriod =
    period === "week" || period === "month" || period === "year" ? period : "month"
  return {
    userId,
    accrualRateHours: typeof o.accrualRateHours === "number" ? o.accrualRateHours : 0,
    accrualPeriod,
    adjustmentHours: typeof o.adjustmentHours === "number" ? o.adjustmentHours : 0,
    maxBalanceHours: typeof o.maxBalanceHours === "number" ? o.maxBalanceHours : null,
    carryoverAllowed: o.carryoverAllowed !== false,
  }
}

function parsePtoRequest(raw: unknown): PtoRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === "string" ? o.id : ""
  const userId = typeof o.userId === "string" ? o.userId : ""
  if (!id || !userId) return null
  const status = o.status
  const st: PtoRequestStatus =
    status === "approved" || status === "denied" || status === "cancelled" ? status : "pending"
  return {
    id,
    userId,
    startAt: typeof o.startAt === "string" ? o.startAt : "",
    endAt: typeof o.endAt === "string" ? o.endAt : "",
    hoursRequested: typeof o.hoursRequested === "number" ? o.hoursRequested : 0,
    note: typeof o.note === "string" ? o.note : "",
    status: st,
    approverUserId: typeof o.approverUserId === "string" ? o.approverUserId : null,
    reviewedAt: typeof o.reviewedAt === "string" ? o.reviewedAt : null,
    createOutOfOfficeEmail: o.createOutOfOfficeEmail === true,
    createdAt: typeof o.createdAt === "string" ? o.createdAt : new Date().toISOString(),
  }
}

function parseLedgerEntry(raw: unknown): UserPtoLedgerEntry | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const id = typeof o.id === "string" ? o.id : ""
  const userId = typeof o.userId === "string" ? o.userId : ""
  if (!id || !userId) return null
  return {
    id,
    userId,
    at: typeof o.at === "string" ? o.at : new Date().toISOString(),
    hoursDelta: typeof o.hoursDelta === "number" ? o.hoursDelta : 0,
    reason: typeof o.reason === "string" ? o.reason : "",
    requestId: typeof o.requestId === "string" ? o.requestId : undefined,
  }
}

export function mergeOrgPtoEngine(metadata: unknown, patch: Partial<OrgPtoEngineV1>): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  const prev = parseOrgPtoEngine(metadata)
  base.pto_engine_v1 = { ...prev, ...patch, _v: 1 as const }
  return base
}

export function newPtoRequestId(): string {
  return `pto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function newLedgerEntryId(): string {
  return `led_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

/** Accrued hours from policy start (simplified: full periods elapsed × rate). */
export function computeAccruedHours(policy: UserPtoPolicy, employedSince: Date, asOf = new Date()): number {
  if (policy.accrualRateHours <= 0) return 0
  const ms = asOf.getTime() - employedSince.getTime()
  if (ms <= 0) return 0
  const days = ms / (24 * 60 * 60 * 1000)
  if (policy.accrualPeriod === "week") return (days / 7) * policy.accrualRateHours
  if (policy.accrualPeriod === "month") return (days / 30.4375) * policy.accrualRateHours
  return (days / 365.25) * policy.accrualRateHours
}

export function computePtoBalance(engine: OrgPtoEngineV1, userId: string, employedSince: Date): number {
  const policy = engine.policies[userId] ?? defaultUserPtoPolicy(userId)
  let balance = computeAccruedHours(policy, employedSince) + policy.adjustmentHours
  for (const entry of engine.ledger) {
    if (entry.userId === userId) balance += entry.hoursDelta
  }
  for (const req of engine.requests) {
    if (req.userId !== userId || req.status !== "approved") continue
    balance -= req.hoursRequested
  }
  if (policy.maxBalanceHours != null) balance = Math.min(balance, policy.maxBalanceHours)
  return Math.max(0, Math.round(balance * 100) / 100)
}

export function submitPtoRequest(
  engine: OrgPtoEngineV1,
  input: Omit<PtoRequest, "id" | "status" | "approverUserId" | "reviewedAt" | "createdAt">,
): OrgPtoEngineV1 {
  const req: PtoRequest = {
    ...input,
    id: newPtoRequestId(),
    status: "pending",
    approverUserId: null,
    reviewedAt: null,
    createdAt: new Date().toISOString(),
  }
  return { ...engine, requests: [req, ...engine.requests] }
}

export function reviewPtoRequest(
  engine: OrgPtoEngineV1,
  requestId: string,
  approverUserId: string,
  approve: boolean,
): OrgPtoEngineV1 {
  return {
    ...engine,
    requests: engine.requests.map((r) =>
      r.id === requestId
        ? {
            ...r,
            status: approve ? "approved" : "denied",
            approverUserId,
            reviewedAt: new Date().toISOString(),
          }
        : r,
    ),
  }
}

export function adjustPtoBalance(
  engine: OrgPtoEngineV1,
  userId: string,
  hoursDelta: number,
  reason: string,
): OrgPtoEngineV1 {
  const entry: UserPtoLedgerEntry = {
    id: newLedgerEntryId(),
    userId,
    at: new Date().toISOString(),
    hoursDelta,
    reason,
  }
  return { ...engine, ledger: [entry, ...engine.ledger] }
}

export function pendingPtoForUser(engine: OrgPtoEngineV1, userId: string): PtoRequest[] {
  return engine.requests.filter((r) => r.userId === userId && r.status === "pending")
}

export function ptoRequestsAwaitingApproval(engine: OrgPtoEngineV1): PtoRequest[] {
  return engine.requests.filter((r) => r.status === "pending")
}
