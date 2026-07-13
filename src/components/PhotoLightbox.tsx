import { useEffect } from "react"

type Props = {
  src: string
  alt?: string
  onClose: () => void
}

/** Full-screen image viewer — click backdrop or image to close. */
export function PhotoLightbox({ src, alt = "", onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(15,23,42,0.88)", cursor: "zoom-out" }}
      />
      <div
        role="dialog"
        aria-modal
        aria-label={alt || "Expanded photo"}
        style={{
          position: "fixed",
          zIndex: 201,
          inset: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            objectFit: "contain",
            borderRadius: 12,
            boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
            pointerEvents: "auto",
            cursor: "zoom-out",
          }}
          onClick={onClose}
        />
      </div>
    </>
  )
}
