import { useMemo, useState, type CSSProperties } from "react"
import {
  addEmailFolder,
  buildFolderTree,
  isSystemFolderId,
  removeEmailFolder,
  SYSTEM_FOLDER_ALL,
  SYSTEM_FOLDER_INBOX,
  SYSTEM_FOLDER_SENT,
  SYSTEM_FOLDER_UNREAD,
  type EmailClientFolderNode,
} from "../../lib/emailClientWorkspace"
import type { EmailClientTheme } from "../../lib/emailClientThemes"
import EmailClientContextMenu, { type ContextMenuItem } from "./EmailClientContextMenu"

type Props = {
  folders: EmailClientFolderNode[]
  activeFolderId: string
  onSelectFolder: (folderId: string) => void
  onFoldersChange: (folders: EmailClientFolderNode[]) => void
  unreadCount: number
  theme: EmailClientTheme
  panelStyle: CSSProperties
  onDropThread?: (threadKey: string, folderId: string) => void
}

export default function EmailClientFolderSidebar({
  folders,
  activeFolderId,
  onSelectFolder,
  onFoldersChange,
  unreadCount,
  theme,
  panelStyle,
  onDropThread,
}: Props) {
  const tree = useMemo(() => buildFolderTree(folders), [folders])
  const [menu, setMenu] = useState<{ x: number; y: number; folderId: string | null } | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)

  const openMenu = (e: React.MouseEvent, folderId: string | null) => {
    e.preventDefault()
    setMenu({ x: e.clientX, y: e.clientY, folderId })
  }

  const promptNewFolder = (parentId: string | null) => {
    const name = window.prompt(parentId ? "New subfolder name:" : "New folder name:")
    if (!name?.trim()) return
    onFoldersChange(addEmailFolder(folders, name, parentId))
  }

  const menuItems: ContextMenuItem[] = useMemo(() => {
    if (!menu) return []
    const folderId = menu.folderId
    const items: ContextMenuItem[] = [
      {
        id: "new-folder",
        label: folderId ? "New subfolder here…" : "New folder…",
        onClick: () => promptNewFolder(folderId),
      },
    ]
    if (folderId && !isSystemFolderId(folderId)) {
      items.push({
        id: "rename",
        label: "Rename folder…",
        onClick: () => {
          const current = folders.find((f) => f.id === folderId)
          const name = window.prompt("Rename folder:", current?.name ?? "")
          if (!name?.trim()) return
          onFoldersChange(folders.map((f) => (f.id === folderId ? { ...f, name: name.trim() } : f)))
        },
      })
      items.push({
        id: "delete",
        label: "Delete folder",
        danger: true,
        onClick: () => {
          if (!window.confirm("Delete this folder and subfolders? Conversations will return to Inbox.")) return
          onFoldersChange(removeEmailFolder(folders, folderId))
        },
      })
    }
    return items
  }, [menu, folders, onFoldersChange])

  const renderNode = (node: EmailClientFolderNode, depth = 0) => {
    const active = activeFolderId === node.id
    const badge =
      node.id === SYSTEM_FOLDER_UNREAD && unreadCount > 0 ? ` (${unreadCount})` : ""
    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => onSelectFolder(node.id)}
          onContextMenu={(e) => openMenu(e, node.id)}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOverFolderId(node.id)
          }}
          onDragLeave={() => setDragOverFolderId((id) => (id === node.id ? null : id))}
          onDrop={(e) => {
            e.preventDefault()
            setDragOverFolderId(null)
            const threadKey = e.dataTransfer.getData("text/tradesman-email-thread")
            if (threadKey && onDropThread) onDropThread(threadKey, node.id)
          }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: `8px 10px 8px ${10 + depth * 14}px`,
            marginBottom: 4,
            borderRadius: 8,
            border: active
              ? `2px solid ${theme.accent}`
              : dragOverFolderId === node.id
                ? `2px dashed ${theme.accent}`
                : `1px solid ${theme.panelBorder}`,
            background: active ? theme.accentSoft : dragOverFolderId === node.id ? theme.accentSoft : theme.panelBackground,
            color: theme.text,
            fontWeight: active ? 800 : 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {node.name}
          {badge}
        </button>
        {node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    )
  }

  return (
    <aside
      style={panelStyle}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("button")) return
        openMenu(e, null)
      }}
    >
      <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 800, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        Folders
      </p>
      {tree.map((node) => renderNode(node))}
      <p style={{ margin: "12px 0 0", fontSize: 11, color: theme.textMuted, lineHeight: 1.4 }}>
        Right-click for folder options · drag conversations into folders
      </p>
      {menu ? (
        <EmailClientContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
          theme={theme}
        />
      ) : null}
    </aside>
  )
}

export function defaultActiveFolderId(): string {
  return SYSTEM_FOLDER_INBOX
}

export { SYSTEM_FOLDER_INBOX, SYSTEM_FOLDER_UNREAD, SYSTEM_FOLDER_SENT, SYSTEM_FOLDER_ALL }
