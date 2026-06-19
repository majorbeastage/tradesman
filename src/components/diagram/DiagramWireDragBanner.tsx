type Props = {
  message: string
}

export default function DiagramWireDragBanner({ message }: Props) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 40,
        padding: "10px 16px",
        borderRadius: 999,
        background: "#0f172a",
        color: "#f8fafc",
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 8px 28px rgba(15,23,42,0.28)",
        pointerEvents: "none",
        whiteSpace: "nowrap",
        maxWidth: "calc(100% - 24px)",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {message}
    </div>
  )
}
