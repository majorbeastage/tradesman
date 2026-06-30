import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react"
import { APP_NAV_PREFIX, buildAppHash, parseAppHash } from "../lib/appNavigationHistory"
import { isLoginRouteHash } from "../lib/loginRouting"
import { clearCustomerProfileReturn, shouldClearCustomerProfileReturnOnPage } from "../lib/customerProfileReturn"

type OverlayCloser = () => void

type AppNavigationContextValue = {
  page: string
  navigatePage: (nextPage: string, opts?: { replace?: boolean }) => void
  registerOverlay: (overlayId: string, close: OverlayCloser) => () => void
  openOverlay: (overlayId: string) => void
  closeOverlay: (overlayId: string, opts?: { fromPopState?: boolean }) => void
}

const AppNavigationContext = createContext<AppNavigationContextValue | null>(null)

type Props = {
  page: string
  setPage: (page: string) => void
  children: ReactNode
}

export function AppNavigationProvider({ page, setPage, children }: Props) {
  const overlaysRef = useRef<Map<string, OverlayCloser>>(new Map())
  const skipPagePushRef = useRef(false)
  const initRef = useRef(false)
  const closingOverlayRef = useRef<string | null>(null)

  const navigatePage = useCallback(
    (nextPage: string, opts?: { replace?: boolean }) => {
      overlaysRef.current.forEach((close) => close())
      if (shouldClearCustomerProfileReturnOnPage(nextPage)) {
        clearCustomerProfileReturn()
      }
      setPage(nextPage)
      const parsed = parseAppHash(window.location.hash)
      const hash = buildAppHash(nextPage, { standalone: parsed.standalone ? true : undefined })
      if (opts?.replace) {
        history.replaceState({ appNav: true, page: nextPage, standalone: parsed.standalone || undefined }, "", hash)
      } else {
        history.pushState({ appNav: true, page: nextPage, standalone: parsed.standalone || undefined }, "", hash)
      }
    },
    [setPage],
  )

  const registerOverlay = useCallback((overlayId: string, close: OverlayCloser) => {
    overlaysRef.current.set(overlayId, close)
    return () => {
      overlaysRef.current.delete(overlayId)
    }
  }, [])

  const openOverlay = useCallback(
    (overlayId: string) => {
      history.pushState({ appNav: true, page, overlay: overlayId }, "", buildAppHash(page, { overlay: overlayId }))
    },
    [page],
  )

  const closeOverlay = useCallback((overlayId: string, opts?: { fromPopState?: boolean }) => {
    const closer = overlaysRef.current.get(overlayId)
    if (closer) closer()
    if (opts?.fromPopState) return
    const parsed = parseAppHash(window.location.hash)
    if (parsed.overlay === overlayId) {
      closingOverlayRef.current = overlayId
      history.back()
    }
  }, [])

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    const parsed = parseAppHash(window.location.hash)
    if (parsed.page) {
      skipPagePushRef.current = true
      setPage(parsed.page)
    }
    history.replaceState(
      { appNav: true, page: parsed.page ?? page, overlay: parsed.overlay ?? undefined, standalone: parsed.standalone },
      "",
      buildAppHash(parsed.page ?? page, { overlay: parsed.overlay, standalone: parsed.standalone }),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time bootstrap
  }, [])

  useEffect(() => {
    if (skipPagePushRef.current) {
      skipPagePushRef.current = false
      return
    }
    const parsed = parseAppHash(window.location.hash)
    if (parsed.page === page && !parsed.overlay) return
    history.pushState(
      { appNav: true, page, standalone: parsed.standalone || undefined },
      "",
      buildAppHash(page, { standalone: parsed.standalone ? true : undefined }),
    )
  }, [page])

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseAppHash(window.location.hash)
      if (closingOverlayRef.current) {
        if (parsed.overlay !== closingOverlayRef.current) {
          closingOverlayRef.current = null
        }
        if (parsed.page && parsed.page !== page) {
          skipPagePushRef.current = true
          setPage(parsed.page)
        }
        return
      }

      if (parsed.overlay) {
        if (parsed.page && parsed.page !== page) {
          skipPagePushRef.current = true
          setPage(parsed.page)
        }
        return
      }

      overlaysRef.current.forEach((close) => close())

      if (parsed.page) {
        skipPagePushRef.current = true
        setPage(parsed.page)
      }
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [page, setPage])

  useEffect(() => {
    if (isLoginRouteHash()) return
    if (!window.location.hash.startsWith(APP_NAV_PREFIX)) {
      history.replaceState({ appNav: true, page }, "", buildAppHash(page))
    }
  }, [page])

  return (
    <AppNavigationContext.Provider
      value={{ page, navigatePage, registerOverlay, openOverlay, closeOverlay }}
    >
      {children}
    </AppNavigationContext.Provider>
  )
}

export function useAppNavigation(): AppNavigationContextValue {
  const ctx = useContext(AppNavigationContext)
  if (!ctx) throw new Error("useAppNavigation must be used within AppNavigationProvider")
  return ctx
}

export function useAppNavigationOptional(): AppNavigationContextValue | null {
  return useContext(AppNavigationContext)
}
