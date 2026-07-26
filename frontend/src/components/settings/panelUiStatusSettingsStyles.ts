/**
 * Wspólne klasy — statusy panelu (zamówienia / zwroty).
 * @deprecated Prefer Input, PrimaryButton, GhostButton, DangerButton, IconButton, Card from design-system.
 */

import {
  dangerOutlineButtonClass,
  ghostButtonClass,
  iconButtonClass,
  primaryButtonClass,
} from "../../design-system/components/Button/buttonClasses";
import { cardClassName } from "../../design-system/components/Card";
import { inputClassName } from "../../design-system/components/Input";
import { typography } from "../../design-system/tokens";

export const stFieldLabel = `mb-1 block ${typography.label}`;
export const stInput = inputClassName("default", "neutral");
export const stSelect = stInput;
export const stBtnPrimary = primaryButtonClass;
export const stBtnGhost = ghostButtonClass;
export const stBtnDanger = dangerOutlineButtonClass;
export const stIconBtn = iconButtonClass;
export const stCard = cardClassName("section", { className: "overflow-hidden !p-0" });
export const stCardHead = "border-b border-slate-100 bg-slate-50/90 px-4 py-2.5";
export const stCardBody = "p-4";
