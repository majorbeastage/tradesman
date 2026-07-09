import type { PortalSettingItem } from "../types/portal-builder"
import { isPortalSettingDependencyVisible } from "../types/portal-builder"

export function templateFormFromMetadata(items: PortalSettingItem[], metadata: Record<string, unknown>): Record<string, string> {
  const form: Record<string, string> = {}
  for (const item of items) {
    const saved = metadata[item.id]
    if (item.type === "checkbox") {
      if (saved === "checked" || saved === "unchecked") form[item.id] = saved
      else if (saved === true) form[item.id] = "checked"
      else if (saved === false) form[item.id] = "unchecked"
      else form[item.id] = item.defaultChecked ? "checked" : "unchecked"
    } else if (item.type === "dropdown" && item.options?.length) {
      const s = typeof saved === "string" ? saved : ""
      form[item.id] = s && item.options.includes(s) ? s : item.options[0]
    } else {
      form[item.id] = typeof saved === "string" ? saved : ""
    }
  }
  return form
}

export function mergeTemplateFormIntoMetadata(
  prevMeta: Record<string, unknown>,
  formValues: Record<string, string>,
): Record<string, unknown> {
  return { ...prevMeta, ...formValues }
}

export function isTemplateItemVisible(
  item: PortalSettingItem,
  items: PortalSettingItem[],
  formValues: Record<string, string>,
): boolean {
  return isPortalSettingDependencyVisible(item, items, formValues)
}

export function isTemplateChecked(formValues: Record<string, string>, itemId: string): boolean {
  return formValues[itemId] === "checked"
}
