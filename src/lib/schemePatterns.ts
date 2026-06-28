/** Inline SVG / CSS pattern URLs for app scheme decorations (no external assets required). */

export const SCHEME_DIAMOND_PLATE =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
    <rect width="48" height="48" fill="#27272a"/>
    <path d="M0 24 L24 0 L48 24 L24 48 Z" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    <path d="M0 0 L24 24 L0 48 M24 0 L48 24 L24 48 M0 24 L24 48 L48 24 M0 0 L24 24 L48 0" fill="none" stroke="rgba(0,0,0,0.25)" stroke-width="0.5"/>
    <circle cx="24" cy="24" r="1.2" fill="rgba(255,255,255,0.12)"/>
  </svg>`)

export const SCHEME_GRASS_TEXTURE =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
    <rect width="64" height="64" fill="#365314"/>
    <path d="M8 64 Q10 40 12 64 M16 64 Q18 36 20 64 M24 64 Q26 42 28 64 M32 64 Q34 38 36 64 M40 64 Q42 44 44 64 M48 64 Q50 36 52 64 M56 64 Q58 40 60 64" stroke="#84cc16" stroke-width="2" fill="none" opacity="0.35"/>
    <path d="M4 64 Q6 48 8 64 M20 64 Q22 46 24 64 M36 64 Q38 50 40 64 M52 64 Q54 46 56 64" stroke="#a3e635" stroke-width="1.5" fill="none" opacity="0.25"/>
  </svg>`)

export const SCHEME_WOOD_GRAIN =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24" viewBox="0 0 120 24">
    <rect width="120" height="24" fill="#92400e"/>
    <path d="M0 12 Q30 8 60 12 T120 12" fill="none" stroke="#78350f" stroke-width="2" opacity="0.5"/>
    <path d="M0 6 Q40 10 80 6 T120 6" fill="none" stroke="#b45309" stroke-width="1" opacity="0.35"/>
    <path d="M0 18 Q35 14 70 18 T120 18" fill="none" stroke="#451a03" stroke-width="1.5" opacity="0.4"/>
  </svg>`)

export const SCHEME_PALM_SILHOUETTE =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="120" viewBox="0 0 80 120">
    <path d="M40 120 L40 55" stroke="#0c4a6e" stroke-width="4"/>
    <path d="M40 55 Q10 45 5 25 Q25 40 40 55 Q55 40 75 25 Q70 45 40 55" fill="#0e7490" opacity="0.5"/>
    <path d="M40 70 Q15 60 8 40 Q28 55 40 70 Q52 55 72 40 Q65 60 40 70" fill="#0891b2" opacity="0.35"/>
  </svg>`)

export const SCHEME_TWIG_BORDER =
  "data:image/svg+xml," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <rect width="32" height="32" fill="none"/>
    <path d="M2 16 Q8 10 16 16 T30 16" stroke="#65a30d" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M4 20 Q12 14 20 20" stroke="#84cc16" stroke-width="2" fill="none" opacity="0.7"/>
  </svg>`)
