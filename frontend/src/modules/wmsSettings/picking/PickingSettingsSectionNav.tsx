import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Boxes,
  ClipboardList,
  Layers,
  MapPin,
  ScanLine,
  Settings2,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

import {
  brandSidebarNavActiveBarClassName,
  brandSidebarNavIconClassName,
  brandSidebarNavItemClassName,
} from "../../../design-system/brandUi";
import type { WmsSettingsSectionConfig } from "../../../pages/Settings/wmsSettingsSectionConfig";
import { WMS_PICKING_SETTINGS_NAV_SECTIONS } from "./pickingSettingsNavSections";

const ICONS: Record<string, LucideIcon> = {
  "wms-pick-modes": Layers,
  "wms-pick-queue": ClipboardList,
  "wms-pick-scan": ScanLine,
  "wms-pick-carts": ShoppingCart,
  "wms-pick-shortage": AlertTriangle,
  "wms-pick-warehouses": MapPin,
  "wms-pick-automation": Sparkles,
  "wms-pick-view": Boxes,
  "wms-pick-advanced": Settings2,
};

type Props = {
  sections?: WmsSettingsSectionConfig[];
  activeSectionId: string | null;
  onSelect: (id: string) => void;
};

export function PickingSettingsSectionNav({
  sections = WMS_PICKING_SETTINGS_NAV_SECTIONS,
  activeSectionId,
  onSelect,
}: Props) {
  return (
    <nav className="space-y-0.5" aria-label="Sekcje ustawień zbierania">
      {sections.map((section) => {
        const Icon = ICONS[section.id] ?? Settings2;
        const active = activeSectionId === section.id;
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => onSelect(section.id)}
            className={brandSidebarNavItemClassName(active, { compact: true })}
          >
            {active ? <span className={brandSidebarNavActiveBarClassName} aria-hidden /> : null}
            <Icon
              className={`h-4 w-4 shrink-0 ${brandSidebarNavIconClassName(active)}`}
              strokeWidth={active ? 2.25 : 1.75}
              aria-hidden
            />
            <span className="min-w-0 truncate leading-snug">{section.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
