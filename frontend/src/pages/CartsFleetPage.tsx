import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { catalogEntityCardShellClass } from "../components/catalog/CatalogEntityPageShell";
import { AppOverlayPortal } from "../components/overlay";
import { brandOutlineButtonClass, brandPrimaryButtonClass } from "../design-system/brandUi";
import { useCartsRefresh } from "../context/CartsRefreshContext";
import { CartsFleetList } from "../modules/carts/cartList/CartsFleetList";
import {
  CART_DEVICE_TYPE_LABEL,
  type CartDeviceTypeFilter,
} from "../modules/carts/cartsTabs";
import BulkCartEditor from "./CartsComponents/BulkCartEditor";
import CartEditor from "./CartsComponents/CartEditor";

function parseTypeFilter(raw: string | null): CartDeviceTypeFilter {
  const v = (raw ?? "").trim().toUpperCase();
  if (v === "BULK" || v === "MULTI") return v;
  return "ALL";
}

type CreateKind = "BULK" | "MULTI";

/**
 * Unified Magazyn → Wózki: both device types on one list with type filter + create picker.
 */
export default function CartsFleetPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const typeFilter = parseTypeFilter(searchParams.get("type"));

  const ctx = useCartsRefresh();
  const cartsRefreshTrigger = ctx?.cartsRefreshTrigger ?? 0;
  const [view, setView] = useState<"list" | "editor">("list");
  const [editorKind, setEditorKind] = useState<CreateKind>("BULK");
  const [selectedCartId, setSelectedCartId] = useState<number | null>(null);
  const [listRefreshTrigger, setListRefreshTrigger] = useState(0);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [pickerChoice, setPickerChoice] = useState<CreateKind>("BULK");

  const refreshTrigger = listRefreshTrigger + cartsRefreshTrigger;

  const setTypeFilter = useCallback(
    (next: CartDeviceTypeFilter) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === "ALL") p.delete("type");
          else p.set("type", next.toLowerCase());
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const openEditor = (kind: CreateKind, cartId: number | null) => {
    setEditorKind(kind);
    setSelectedCartId(cartId);
    setView("editor");
    setTypePickerOpen(false);
  };

  const handleEdit = (id: number, cartType?: string | null) => {
    const kind: CreateKind =
      String(cartType ?? "")
        .trim()
        .toUpperCase() === "MULTI"
        ? "MULTI"
        : "BULK";
    openEditor(kind, id);
  };

  const handleClose = () => {
    setSelectedCartId(null);
    setView("list");
    setListRefreshTrigger((t) => t + 1);
  };

  const requestAddNew = (knownType?: CreateKind) => {
    if (knownType) {
      openEditor(knownType, null);
      return;
    }
    if (typeFilter === "BULK" || typeFilter === "MULTI") {
      openEditor(typeFilter, null);
      return;
    }
    setPickerChoice("BULK");
    setTypePickerOpen(true);
  };

  const filterBar = useMemo(
    () => (
      <div
        className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm"
        role="group"
        aria-label="Filtr typu wózka"
      >
        {(
          [
            { id: "ALL" as const, label: "Wszystkie" },
            { id: "BULK" as const, label: "Wózki" },
            { id: "MULTI" as const, label: "Wózki z koszykami" },
          ] as const
        ).map((opt) => {
          const active = typeFilter === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTypeFilter(opt.id)}
              className={
                active
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
                  : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    ),
    [typeFilter, setTypeFilter],
  );

  if (view === "editor") {
    return (
      <div className={`${catalogEntityCardShellClass} overflow-hidden`}>
        {editorKind === "MULTI" ? (
          <CartEditor cartId={selectedCartId} onClose={handleClose} />
        ) : (
          <BulkCartEditor cartId={selectedCartId} onClose={handleClose} />
        )}
      </div>
    );
  }

  return (
    <>
      <CartsFleetList
        cartTypeFilter={typeFilter}
        refreshTrigger={refreshTrigger}
        filterSlot={filterBar}
        onAddNew={requestAddNew}
        onEdit={handleEdit}
      />

      {typePickerOpen ? (
        <AppOverlayPortal>
          <div
            className="fixed inset-0 z-[280] flex items-center justify-center bg-black/45 p-4"
            role="presentation"
            onClick={() => setTypePickerOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="cart-type-picker-title"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="cart-type-picker-title" className="text-base font-bold text-slate-900">
                Typ urządzenia
              </h2>
              <p className="mt-1 text-sm text-slate-500">Wybierz rodzaj wózka, który chcesz dodać.</p>
              <div className="mt-4 space-y-2">
                {(["BULK", "MULTI"] as const).map((kind) => (
                  <label
                    key={kind}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                      pickerChoice === kind
                        ? "border-orange-300 bg-orange-50 text-orange-900"
                        : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="cart-device-type"
                      className="h-4 w-4 border-slate-300 text-orange-600 focus:ring-orange-500"
                      checked={pickerChoice === kind}
                      onChange={() => setPickerChoice(kind)}
                    />
                    <span className="font-medium">{CART_DEVICE_TYPE_LABEL[kind]}</span>
                  </label>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" className={brandOutlineButtonClass} onClick={() => setTypePickerOpen(false)}>
                  Anuluj
                </button>
                <button
                  type="button"
                  className={brandPrimaryButtonClass}
                  onClick={() => openEditor(pickerChoice, null)}
                >
                  Dalej
                </button>
              </div>
            </div>
          </div>
        </AppOverlayPortal>
      ) : null}
    </>
  );
}
