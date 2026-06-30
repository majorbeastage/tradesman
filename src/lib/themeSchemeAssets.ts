import type { CSSProperties } from "react"
import type { AppSchemeId } from "./appSchemes"

import garageBackground from "../assets/themes/garage background.png"
import garageBorder from "../assets/themes/garage border.png"
import landscapeBackground from "../assets/themes/landscape background.png"
import constructionBackground from "../assets/themes/construction background.png"
import constructionBorder from "../assets/themes/construction border.png"

export type SchemeThemeAssetConfig = {
  sidebarPhoto: string
  sidebarPhotoRepeat: "repeat" | "no-repeat"
  sidebarPhotoSize: string
  sidebarOverlay: string
  panelBorderDeco?: string
  panelBorderWidth?: string
  pickerPreviewBg: string
  pickerPreviewTileSize: string
}

const GARAGE_ASSETS: SchemeThemeAssetConfig = {
  sidebarPhoto: garageBackground,
  sidebarPhotoRepeat: "repeat",
  sidebarPhotoSize: "220px 220px",
  sidebarOverlay: "rgba(24, 24, 27, 0.32)",
  panelBorderDeco: garageBorder,
  panelBorderWidth: "34px",
  pickerPreviewBg: garageBackground,
  pickerPreviewTileSize: "64px 64px",
}

const LANDSCAPE_ASSETS: SchemeThemeAssetConfig = {
  sidebarPhoto: landscapeBackground,
  sidebarPhotoRepeat: "repeat",
  sidebarPhotoSize: "320px 320px",
  sidebarOverlay: "rgba(54, 83, 20, 0.42)",
  pickerPreviewBg: landscapeBackground,
  pickerPreviewTileSize: "72px 72px",
}

const GENERAL_CONTRACTOR_ASSETS: SchemeThemeAssetConfig = {
  sidebarPhoto: constructionBackground,
  sidebarPhotoRepeat: "repeat",
  sidebarPhotoSize: "360px 360px",
  sidebarOverlay: "rgba(120, 53, 15, 0.5)",
  panelBorderDeco: constructionBorder,
  panelBorderWidth: "30px",
  pickerPreviewBg: constructionBackground,
  pickerPreviewTileSize: "80px 80px",
}

export const SCHEME_THEME_ASSETS: Partial<Record<AppSchemeId, SchemeThemeAssetConfig>> = {
  garage: GARAGE_ASSETS,
  landscape: LANDSCAPE_ASSETS,
  general_contractor: GENERAL_CONTRACTOR_ASSETS,
}

export function hasSchemeThemeAssets(schemeId: AppSchemeId): boolean {
  return schemeId in SCHEME_THEME_ASSETS
}

export function schemeThemeCssVars(schemeId: AppSchemeId): CSSProperties {
  const cfg = SCHEME_THEME_ASSETS[schemeId]
  if (!cfg) return {}

  const vars: Record<string, string> = {
    "--scheme-sidebar-photo-bg": `url(${cfg.sidebarPhoto})`,
    "--scheme-sidebar-photo-repeat": cfg.sidebarPhotoRepeat,
    "--scheme-sidebar-photo-size": cfg.sidebarPhotoSize,
    "--scheme-sidebar-photo-overlay": cfg.sidebarOverlay,
  }

  if (cfg.panelBorderDeco) {
    vars["--scheme-panel-border-deco"] = `url(${cfg.panelBorderDeco})`
    vars["--scheme-panel-deco-width"] = cfg.panelBorderWidth ?? "30px"
  }

  return vars as CSSProperties
}

export function schemePickerPreviewImage(schemeId: AppSchemeId): string | undefined {
  return SCHEME_THEME_ASSETS[schemeId]?.pickerPreviewBg
}

export function schemePickerPreviewTileSize(schemeId: AppSchemeId): string | undefined {
  return SCHEME_THEME_ASSETS[schemeId]?.pickerPreviewTileSize
}
