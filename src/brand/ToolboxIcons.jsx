import React from "react";

const common = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 3.2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconLeads({ size = 26 }) {
  // target + person dot (lead)
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" {...common} />
      <circle cx="12" cy="12" r="5" {...common} />
      <circle cx="12" cy="10" r="1.6" fill="currentColor" />
      <path d="M9.5 16c.9-1 1.9-1.5 2.5-1.5S13.6 15 14.5 16" {...common} />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21" {...common} />
    </svg>
  );
}

export function IconConvos({ size = 26 }) {
  // stacked chat bubbles
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 14h7a4 4 0 0 0 4-4V8a4 4 0 0 0-4-4H7A4 4 0 0 0 3 8v2a4 4 0 0 0 4 4Z"
        {...common}
      />
      <path d="M7 14l-2.5 2.5V14" {...common} />
      <path
        d="M10 20h5a4 4 0 0 0 4-4v-1.2"
        {...common}
        opacity="0.9"
      />
      <path d="M8.5 9.3h7M8.5 11.7h5.2" {...common} />
    </svg>
  );
}

export function IconQuotes({ size = 26 }) {
  // document + $ mark
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 3h6l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" {...common} />
      <path d="M14 3v5h5" {...common} />
      <path d="M9.2 12h5.6M9.2 14.8h5.6" {...common} />
      <path d="M12 10.3v7.4" {...common} />
      <path d="M13.6 12c0-.9-.8-1.3-1.6-1.3S10.4 11 10.4 12s.8 1.2 1.6 1.2 1.6.4 1.6 1.3-.8 1.3-1.6 1.3-1.6-.4-1.6-1.3" {...common} />
    </svg>
  );
}

export function IconCalendar({ size = 26 }) {
  // calendar block
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3v3M17 3v3" {...common} />
      <path d="M4.5 7.5h15" {...common} />
      <rect x="4.5" y="5.5" width="15" height="15" rx="2.5" {...common} />
      <path d="M8 11h3M13 11h3M8 15h3M13 15h3" {...common} />
    </svg>
  );
}
