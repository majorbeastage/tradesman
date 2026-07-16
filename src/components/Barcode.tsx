import { useEffect, useRef } from "react"
import JsBarcode from "jsbarcode"

type Props = {
  /** Value encoded in the barcode and shown as text below it. */
  value: string
  height?: number
  width?: number
  fontSize?: number
  displayValue?: boolean
}

/**
 * Renders a Code128 barcode as inline SVG. The encoded value is shown as text
 * beneath the bars when displayValue is on (default). Safe for web + Capacitor
 * (pure SVG, no canvas/native dependency).
 */
export default function Barcode({ value, height = 48, width = 1.6, fontSize = 13, displayValue = true }: Props) {
  const ref = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const clean = (value ?? "").trim()
    if (!clean) {
      node.innerHTML = ""
      return
    }
    try {
      JsBarcode(node, clean, {
        format: "CODE128",
        height,
        width,
        fontSize,
        displayValue,
        margin: 4,
        background: "#ffffff",
        lineColor: "#0f172a",
      })
    } catch {
      node.innerHTML = ""
    }
  }, [value, height, width, fontSize, displayValue])

  return <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />
}
