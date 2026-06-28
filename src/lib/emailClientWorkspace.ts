import type { EmailClientThemeId } from "./emailClientThemes"

export type EmailClientFolderNode = {
  id: string
  name: string
  parentId: string | null
  /** System folders cannot be deleted. */
  system?: boolean
  children?: EmailClientFolderNode[]
}

export type EmailClientOutOfOffice = {
  enabled: boolean
  message: string
  startAt: string | null
  endAt: string | null
  shareWithOrg: boolean
  syncCalendar: boolean
}

export type EmailClientInboxOption = {
  routeId: string
  address: string
  label: string
}

export type EmailClientWorkspaceV1 = {
  _v: 1
  themeId: EmailClientThemeId
  activeInboxRouteId: string | null
  /** Additional org inboxes this user may view (subset of org grants). */
  enabledInboxRouteIds: string[]
  outOfOffice: EmailClientOutOfOffice
  folders: EmailClientFolderNode[]
  /** threadKey → custom folder id */
  threadFolderMap: Record<string, string>
}

export const SYSTEM_FOLDER_INBOX = "sys-inbox"
export const SYSTEM_FOLDER_UNREAD = "sys-unread"
export const SYSTEM_FOLDER_SENT = "sys-sent"
export const SYSTEM_FOLDER_ALL = "sys-all"

export function defaultEmailClientWorkspace(): EmailClientWorkspaceV1 {
  return {
    _v: 1,
    themeId: "light",
    activeInboxRouteId: null,
    enabledInboxRouteIds: [],
    outOfOffice: {
      enabled: false,
      message: "",
      startAt: null,
      endAt: null,
      shareWithOrg: false,
      syncCalendar: true,
    },
    folders: defaultSystemFolderTree(),
    threadFolderMap: {},
  }
}

export function defaultSystemFolderTree(): EmailClientFolderNode[] {
  return [
    { id: SYSTEM_FOLDER_INBOX, name: "Inbox", parentId: null, system: true },
    { id: SYSTEM_FOLDER_UNREAD, name: "Unread", parentId: null, system: true },
    { id: SYSTEM_FOLDER_SENT, name: "Sent", parentId: null, system: true },
    { id: SYSTEM_FOLDER_ALL, name: "All mail", parentId: null, system: true },
  ]
}

export function parseEmailClientWorkspace(metadata: unknown): EmailClientWorkspaceV1 {
  const base = defaultEmailClientWorkspace()
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return base
  const raw = (metadata as Record<string, unknown>).email_client_v1
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base
  const o = raw as Record<string, unknown>
  const themeId = typeof o.themeId === "string" ? o.themeId : base.themeId
  const oooRaw = o.outOfOffice
  const ooo =
    oooRaw && typeof oooRaw === "object" && !Array.isArray(oooRaw)
      ? (oooRaw as Record<string, unknown>)
      : {}
  const folders = parseFolderList(o.folders) ?? base.folders
  const threadFolderMap = parseThreadFolderMap(o.threadFolderMap)
  return {
    _v: 1,
    themeId: themeId as EmailClientThemeId,
    activeInboxRouteId: typeof o.activeInboxRouteId === "string" ? o.activeInboxRouteId : null,
    enabledInboxRouteIds: Array.isArray(o.enabledInboxRouteIds)
      ? o.enabledInboxRouteIds.filter((x): x is string => typeof x === "string")
      : [],
    outOfOffice: {
      enabled: ooo.enabled === true,
      message: typeof ooo.message === "string" ? ooo.message : "",
      startAt: typeof ooo.startAt === "string" ? ooo.startAt : null,
      endAt: typeof ooo.endAt === "string" ? ooo.endAt : null,
      shareWithOrg: ooo.shareWithOrg === true,
      syncCalendar: ooo.syncCalendar !== false,
    },
    folders,
    threadFolderMap,
  }
}

function parseThreadFolderMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim()
  }
  return out
}

function parseFolderList(raw: unknown): EmailClientFolderNode[] | null {
  if (!Array.isArray(raw)) return null
  const nodes: EmailClientFolderNode[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const o = item as Record<string, unknown>
    const id = typeof o.id === "string" ? o.id.trim() : ""
    const name = typeof o.name === "string" ? o.name.trim() : ""
    if (!id || !name) continue
    nodes.push({
      id,
      name,
      parentId: typeof o.parentId === "string" ? o.parentId : null,
      system: o.system === true,
    })
  }
  return nodes.length ? nodes : null
}

export function mergeEmailClientWorkspace(metadata: unknown, patch: Partial<EmailClientWorkspaceV1>): Record<string, unknown> {
  const base =
    metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {}
  const prev = parseEmailClientWorkspace(metadata)
  base.email_client_v1 = { ...prev, ...patch, _v: 1 as const }
  return base
}

export function newFolderId(): string {
  return `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function flattenFolders(folders: EmailClientFolderNode[]): EmailClientFolderNode[] {
  return [...folders]
}

export function buildFolderTree(folders: EmailClientFolderNode[]): EmailClientFolderNode[] {
  const byParent = new Map<string | null, EmailClientFolderNode[]>()
  for (const f of folders) {
    const key = f.parentId ?? null
    const list = byParent.get(key) ?? []
    list.push({ ...f })
    byParent.set(key, list)
  }
  const attach = (parentId: string | null): EmailClientFolderNode[] => {
    const list = byParent.get(parentId) ?? []
    return list
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((node) => ({
        ...node,
        children: attach(node.id),
      }))
  }
  return attach(null)
}

export function addEmailFolder(
  folders: EmailClientFolderNode[],
  name: string,
  parentId: string | null,
): EmailClientFolderNode[] {
  const trimmed = name.trim()
  if (!trimmed) return folders
  return [...folders, { id: newFolderId(), name: trimmed, parentId }]
}

export function removeEmailFolder(folders: EmailClientFolderNode[], folderId: string): EmailClientFolderNode[] {
  const toRemove = new Set<string>()
  const collect = (id: string) => {
    toRemove.add(id)
    for (const f of folders) {
      if (f.parentId === id) collect(f.id)
    }
  }
  collect(folderId)
  return folders.filter((f) => !toRemove.has(f.id) && !f.system)
}

export function renameEmailFolder(folders: EmailClientFolderNode[], folderId: string, name: string): EmailClientFolderNode[] {
  const trimmed = name.trim()
  if (!trimmed) return folders
  return folders.map((f) => (f.id === folderId && !f.system ? { ...f, name: trimmed } : f))
}

export function isSystemFolderId(folderId: string): boolean {
  return folderId.startsWith("sys-")
}

export function folderDescendantIds(folders: EmailClientFolderNode[], folderId: string): Set<string> {
  const ids = new Set<string>([folderId])
  let changed = true
  while (changed) {
    changed = false
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id)
        changed = true
      }
    }
  }
  return ids
}

/** Map legacy virtual folder ids to inbox filter behavior. */
export function systemFolderToLegacyFilter(folderId: string): "inbox" | "unread" | "sent" | "all" | null {
  if (folderId === SYSTEM_FOLDER_INBOX) return "inbox"
  if (folderId === SYSTEM_FOLDER_UNREAD) return "unread"
  if (folderId === SYSTEM_FOLDER_SENT) return "sent"
  if (folderId === SYSTEM_FOLDER_ALL) return "all"
  return null
}

export function assignThreadToFolder(
  threadFolderMap: Record<string, string>,
  threadKey: string,
  folderId: string | null,
): Record<string, string> {
  const next = { ...threadFolderMap }
  if (!folderId) {
    delete next[threadKey]
    return next
  }
  next[threadKey] = folderId
  return next
}

export function threadsInCustomFolder(
  threads: { threadKey: string }[],
  threadFolderMap: Record<string, string>,
  folderId: string,
  folders: EmailClientFolderNode[],
): { threadKey: string }[] {
  const ids = folderDescendantIds(folders, folderId)
  return threads.filter((t) => {
    const assigned = threadFolderMap[t.threadKey]
    return assigned != null && ids.has(assigned)
  })
}
