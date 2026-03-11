/**
 * Shared visual style for reserve (zapasowa) locations across the system.
 * Use the same yellow background, border, lock icon and "Rezerwa" label everywhere:
 * - Rack layout / side view
 * - Product edit form (LocationPicker)
 * - Product list
 * - Location views
 */

import React from "react";

export const RESERVE_BG = "#fff3cd";
export const RESERVE_BORDER = "#ffeeba";

/** Check if an assigned location is reserve (storageType or storage_type). */
export function isReserveLocation(loc: { storageType?: string; storage_type?: string }): boolean {
  const t = loc.storageType ?? loc.storage_type ?? "";
  return String(t).toLowerCase() === "reserve";
}

/** Format location label with quantity for consistent display: "A1-1-1 (5 szt.)" */
export function formatLocationWithQuantity(address: string, quantity: number): string {
  const q = Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
  return `${address} (${q} szt.)`;
}

/** Lock icon SVG for reserve locations (matches rack layout editor). */
export function ReserveLockIcon({ className = "shrink-0", size = 14 }: { className?: string; size?: number }): React.ReactElement {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
