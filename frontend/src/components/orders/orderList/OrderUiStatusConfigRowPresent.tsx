import type { PanelConfigurableUiStatusBrief } from "../../../utils/panelListStatusBriefMappers";
import {
  panelSidebarSubCountBadgeClass,
  panelSidebarSubRowStyleRich,
} from "../../../utils/panelSidebarHierarchy";

const SETTINGS_ROW_CLASS =
  "group flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-md";

const COMPACT_ROW_CLASS =
  "flex min-w-0 w-full max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-left shadow-none";

/** Etykieta w komórce tabeli: inline, dopasowana do treści — bez rozciągania na całą szerokość. */
const INLINE_ROW_CLASS =
  "inline-flex w-fit max-w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-left align-middle shadow-none";

export type OrderUiStatusConfigRowPresentProps = {
  /** Dane statusu z API (zamówienia / zwroty / reklamacje); null → „Bez etykiety”. */
  status: PanelConfigurableUiStatusBrief | null;
  /** Sidebar ustawień: aktywny filtr. */
  active?: boolean;
  /** Licznik jak w konfiguracji — ukryj w tabeli. */
  count?: number;
  className?: string;
  /** `inline` — kolumna zamówienia (gęsta lista); `compact` — nagłówek szczegółów; `default` — ustawienia. */
  variant?: "default" | "compact" | "inline";
};

/**
 * Ten sam wygląd co wiersz podglądu na stronie „Statusy panelu — zamówienia”
 * ({@link panelSidebarSubRowStyleRich} + identyczne klasy co lista w ustawieniach).
 */
export function OrderUiStatusConfigRowPresent({
  status,
  active = false,
  count,
  className,
  variant = "default",
}: OrderUiStatusConfigRowPresentProps) {
  const group = status?.main_group ?? "DONE";
  const rowStyle =
    variant === "inline"
      ? panelSidebarSubRowStyleRich(status, group, active, { barWidthPx: 3, inlineLabel: true })
      : variant === "compact"
        ? panelSidebarSubRowStyleRich(status, group, active, { barWidthPx: 4 })
        : panelSidebarSubRowStyleRich(status, group, active);
  const name = status?.name?.trim() ? status.name.trim() : "Bez etykiety";
  const inactive = status?.is_active === false;
  const rowClass =
    variant === "inline" ? INLINE_ROW_CLASS : variant === "compact" ? COMPACT_ROW_CLASS : SETTINGS_ROW_CLASS;

  const imgSm = variant === "inline" ? "h-3.5 w-3.5" : variant === "compact" ? "h-4 w-4" : "h-6 w-6";

  return (
    <div className={`${rowClass} ${className ?? ""}`.trim()} style={rowStyle}>
      {status?.image_url ? (
        <img src={status.image_url} alt="" className={`shrink-0 rounded object-contain ${imgSm}`} />
      ) : null}
      <span
        className={
          variant === "inline"
            ? "min-w-0 max-w-[14rem] truncate text-xs font-normal leading-tight tracking-normal"
            : variant === "compact"
              ? "min-w-0 truncate text-xs font-medium leading-tight tracking-normal"
              : "min-w-0 truncate text-[15px] font-semibold tracking-normal"
        }
      >
        {name}
      </span>
      {inactive ? (
        <span
          className={
            variant === "inline" || variant === "compact"
              ? "shrink-0 rounded bg-slate-200/80 px-1 py-0.5 text-[9px] font-medium text-slate-600"
              : "shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
          }
        >
          wył.
        </span>
      ) : null}
      {count != null ? <span className={`ml-auto shrink-0 ${panelSidebarSubCountBadgeClass()}`}>{count}</span> : null}
    </div>
  );
}
