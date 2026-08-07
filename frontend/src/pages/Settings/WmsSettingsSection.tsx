import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";

import { useWmsSettingsSearch } from "./WmsSettingsSearchContext";
import { useWmsSettingsSectionVisible } from "./WmsSettingsSectionRegistryContext";
import { cnParts, wmsSettingsTokens } from "./wmsSettingsTokens";

export type WmsSettingsSectionProps = {
  id: string;
  title?: string;
  summary?: string;
  children: ReactNode;
  className?: string;
  /** Colored icon chip in section header (Pakowanie pattern). */
  icon?: LucideIcon;
  iconClassName?: string;
  /** Default expanded; user can collapse. */
  defaultCollapsed?: boolean;
  /** Extra text used by tab search filter. */
  searchText?: string;
};

/**
 * Settings section card. With left-nav switcher enabled, only the active section mounts.
 */
export function WmsSettingsSection({
  id,
  title,
  summary,
  children,
  className,
  icon: Icon,
  iconClassName = "bg-slate-100 text-slate-600",
  defaultCollapsed = false,
  searchText,
}: WmsSettingsSectionProps) {
  const visible = useWmsSettingsSectionVisible(id);
  const { query } = useWmsSettingsSearch();
  const heading = (title ?? "").trim();
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  const matchesSearch = (() => {
    if (!query) return true;
    const hay = `${heading} ${summary ?? ""} ${searchText ?? ""} ${id}`.toLowerCase();
    return hay.includes(query);
  })();

  useEffect(() => {
    if (query && matchesSearch) setCollapsed(false);
  }, [query, matchesSearch]);

  if (!visible) return null;
  if (!matchesSearch) return null;

  return (
    <section
      id={id}
      data-wms-section=""
      className={cnParts("min-w-0", className)}
      aria-label={heading ? `Sekcja: ${heading}` : undefined}
    >
      <div className={wmsSettingsTokens.card}>
        {heading ? (
          <button
            type="button"
            className="flex w-full items-start gap-3 text-left"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {Icon ? (
              <span
                className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconClassName}`}
                aria-hidden
              >
                <Icon className="h-4 w-4" strokeWidth={2} />
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className={wmsSettingsTokens.sectionTitle}>{heading}</span>
              {summary ? <span className={`block ${wmsSettingsTokens.sectionSummary}`}>{summary}</span> : null}
            </span>
            <ChevronDown
              className={`mt-1 h-5 w-5 shrink-0 text-slate-400 transition-transform ${collapsed ? "" : "rotate-180"}`}
              aria-hidden
            />
          </button>
        ) : null}
        {!collapsed ? (
          <div className={cnParts(heading ? "mt-4" : "", wmsSettingsTokens.fieldStack)}>{children}</div>
        ) : null}
      </div>
    </section>
  );
}
