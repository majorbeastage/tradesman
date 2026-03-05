import React from "react";

export const COLORS = {
  charcoal: "#111111",
  offwhite: "#F4F4F4",
  orange: "#F96302",
  white: "#FFFFFF",
};

export function TradesmanBadge({ size = "md" }) {
  const scale = size === "lg" ? "text-3xl" : size === "sm" ? "text-base" : "text-xl";
  const pad = size === "lg" ? "px-5 py-3" : size === "sm" ? "px-3 py-2" : "px-4 py-2";

  return (
    <div
      className={`inline-flex items-center ${pad} rounded-2xl font-extrabold tracking-wide ${scale}`}
      style={{
        background: COLORS.charcoal,
        border: `3px solid ${COLORS.orange}`,
        color: COLORS.white,
      }}
    >
      TRADESMAN
    </div>
  );
}

export function AppIconT({ size = 84 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        background: COLORS.orange,
        display: "grid",
        placeItems: "center",
        boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
        border: "2px solid rgba(0,0,0,0.25)",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          fontSize: Math.round(size * 0.62),
          lineHeight: 1,
          color: COLORS.charcoal,
          transform: "translateY(2px)",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Inter, Arial, sans-serif",
        }}
      >
        T
      </div>
    </div>
  );
}
