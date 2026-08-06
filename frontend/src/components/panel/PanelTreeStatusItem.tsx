import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes } from "react";

import type { OrderUiMainGroup } from "../../types/orderUiStatus";
import type { PanelStatusHexBundle } from "../../utils/panelSidebarHierarchy";
import {
  panelTreeStatusIsProblem,
  panelTreeStatusRowPresentation,
} from "../../utils/panelTreeStatusRowPresentation";
import { panelTreeStatusBarClass } from "./panelStatusTreeStyles";
import { PanelStatusWmsIconColumn } from "./PanelStatusWmsIconColumn";
import type { PanelWmsOperationalMarker } from "../orders/panelStatusWmsChips";
import { PanelTreeCount } from "./PanelTreeCount";

export type PanelTreeStatusItemProps = {
  name: string;
  mainGroup: OrderUiMainGroup;
  colors: PanelStatusHexBundle;
  imageUrl?: string | null;
  markers?: PanelWmsOperationalMarker[];
  count?: number | string | null;
  active?: boolean;
  counterColorHex?: string | null;
  /**
   * Lista / gęste komórki — tryb „rich” + lekki scale.
   * Sidebar (`false`) = kompaktowy chrome bez tintu.
   */
  compact?: boolean;
  title?: string;
  className?: string;
  /** `button` w sidebarze (filtr); `div` w tabeli. */
  as?: "button" | "div";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "title" | "type"> &
  Omit<HTMLAttributes<HTMLDivElement>, "className" | "title">;

/**
 * Kafelek statusu Panelu Statusów — SSOT wizualny dla sidebara i kolumn list.
 */
export function PanelTreeStatusItem({
  name,
  mainGroup,
  colors,
  imageUrl,
  markers = [],
  count,
  active = false,
  counterColorHex: _counterColorHex,
  compact = false,
  title,
  className = "",
  as = "div",
  onClick,
  ...rest
}: PanelTreeStatusItemProps) {
  void _counterColorHex;
  const chrome = compact ? "rich" : "sidebar";
  const row = panelTreeStatusRowPresentation(colors, mainGroup, active, chrome);
  const showCount = count != null && count !== "";
  const isProblem =
    panelTreeStatusIsProblem(name) || markers.some((m) => m.id === "short");
  const rowClassName = compact
    ? row.rowClassName.replace(/\bw-full\b/g, "w-fit max-w-full")
    : row.rowClassName;
  const scaleClass = compact ? "origin-left scale-[0.92]" : "";
  const combinedClass = `${rowClassName} ${scaleClass}${className ? ` ${className}` : ""}`.trim();
  const combinedStyle: CSSProperties | undefined = row.rowStyle;

  const body = (
    <>
      <PanelStatusWmsIconColumn markers={markers} />
      <span
        className={panelTreeStatusBarClass(active)}
        style={{ backgroundColor: row.stripeHex }}
        aria-hidden
      />
      <span className={`min-w-0 truncate leading-snug ${compact ? "" : "flex-1"}`} style={row.labelStyle}>
        {name}
      </span>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="h-3.5 w-3.5 shrink-0 rounded object-contain" />
      ) : null}
      {showCount ? (
        <PanelTreeCount value={count!} active={active} tone={isProblem ? "problem" : "neutral"} />
      ) : null}
    </>
  );

  if (as === "button") {
    return (
      <button
        type="button"
        className={combinedClass}
        style={combinedStyle}
        title={title}
        onClick={onClick as ButtonHTMLAttributes<HTMLButtonElement>["onClick"]}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {body}
      </button>
    );
  }

  return (
    <div
      className={combinedClass}
      style={combinedStyle}
      title={title}
      {...(rest as HTMLAttributes<HTMLDivElement>)}
    >
      {body}
    </div>
  );
}
