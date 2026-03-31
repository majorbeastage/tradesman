import { useEffect, useState } from "react"

export function useIsMobile(breakpoint = 900): boolean {
  const getValue = () => {
    if (typeof window === "undefined") return false
    return window.innerWidth <= breakpoint
  }

  const [isMobile, setIsMobile] = useState(getValue)

  useEffect(() => {
    const onResize = () => setIsMobile(getValue())
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [breakpoint])

  return isMobile
}
