import type { NavigateFunction } from "react-router-dom";

import { wmsSettingsTabHref, type WmsSettingsTabId } from "../WmsSettingsChrome";
import { WMS_SETTINGS_SECTION_QUERY } from "../WmsSettingsSectionRegistryContext";
import type { WmsSettingsSearchEntry } from "./types";

export const WMS_SETTING_DATA_ATTR = "data-wms-setting-id";

const FLASH_CLASS = "wms-setting-field--flash";
const FLASH_MS = 2000;

function buildSettingsHref(tabId: WmsSettingsTabId, sectionId: string): string {
  const href = wmsSettingsTabHref(tabId);
  const [path, rawQuery = ""] = href.split("?");
  const params = new URLSearchParams(rawQuery);
  params.set(WMS_SETTINGS_SECTION_QUERY, sectionId);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function findSettingElement(settingId: string): HTMLElement | null {
  const safe = typeof CSS !== "undefined" && "escape" in CSS ? CSS.escape(settingId) : settingId.replace(/"/g, '\\"');
  return document.querySelector<HTMLElement>(`[${WMS_SETTING_DATA_ATTR}="${safe}"]`);
}

function focusControl(root: HTMLElement): void {
  const editable = root.matches("input, select, textarea, button, [tabindex]")
    ? root
    : root.querySelector<HTMLElement>("input, select, textarea, button, [contenteditable='true']");
  if (!editable) {
    root.focus?.();
    return;
  }
  editable.focus({ preventScroll: true });
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    const len = editable.value.length;
    try {
      editable.setSelectionRange(len, len);
    } catch {
      /* non-text inputs */
    }
  }
}

function flashElement(el: HTMLElement): void {
  el.classList.remove(FLASH_CLASS);
  // reflow so animation restarts
  void el.offsetWidth;
  el.classList.add(FLASH_CLASS);
  window.setTimeout(() => el.classList.remove(FLASH_CLASS), FLASH_MS);
}

/**
 * Switch top tab + left section, then scroll/focus/highlight the registered field.
 */
export async function navigateToWmsSetting(
  navigate: NavigateFunction,
  entry: WmsSettingsSearchEntry,
  opts?: { currentPath?: string; currentSearch?: string },
): Promise<boolean> {
  const target = buildSettingsHref(entry.tabId, entry.sectionId);
  const current = `${opts?.currentPath ?? ""}${opts?.currentSearch ?? ""}`;
  if (current !== target) {
    navigate(target);
  }

  const tryFocus = (): boolean => {
    const el = findSettingElement(entry.id);
    if (!el) return false;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    flashElement(el);
    focusControl(el);
    return true;
  };

  // Wait for tab/section mount (inactive sections unmount until selected).
  for (const delay of [0, 50, 120, 250, 450, 700]) {
    await new Promise<void>((r) => {
      if (delay === 0) requestAnimationFrame(() => r());
      else window.setTimeout(() => r(), delay);
    });
    if (tryFocus()) return true;
  }

  // Fallback: land on section card.
  const section = document.getElementById(entry.sectionId);
  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    flashElement(section);
  }
  return false;
}
