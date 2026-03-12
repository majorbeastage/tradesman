import { createContext, useContext } from "react"

export type View = "home" | "login" | "admin-login" | "app" | "office" | "admin"

type ViewContextValue = {
  setView: (view: View) => void
}

const ViewContext = createContext<ViewContextValue | null>(null)

export function ViewProvider({ children, setView }: { children: React.ReactNode; setView: (view: View) => void }) {
  return <ViewContext.Provider value={{ setView }}>{children}</ViewContext.Provider>
}

export function useView(): ViewContextValue {
  const ctx = useContext(ViewContext)
  if (!ctx) throw new Error("useView must be used within ViewProvider")
  return ctx
}
