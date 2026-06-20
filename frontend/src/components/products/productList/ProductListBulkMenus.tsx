import { ChevronDown } from "lucide-react";

import { listSellasistInputClass } from "../../listPage/listSellasistTokens";
import type { ProductBulkHubChoice } from "../../../pages/Products/productBulkHubTypes";
import { PRODUCT_BULK_PRIMARY_ACTIONS } from "./productListBulkActions";

export type ProductListBulkActionPickerProps = {
  disabled?: boolean;
  selectKey: number;
  onSelect: (action: ProductBulkHubChoice) => void;
};

export function ProductListBulkActionPicker({ disabled, selectKey, onSelect }: ProductListBulkActionPickerProps) {
  return (
    <select
      key={selectKey}
      defaultValue=""
      disabled={disabled}
      aria-label="Akcja zbiorcza dla zaznaczonych produktów"
      className={`${listSellasistInputClass} !h-9 max-w-[12rem] shrink-0 text-sm`}
      onChange={(e) => {
        const v = e.target.value as ProductBulkHubChoice | "";
        if (!v) return;
        onSelect(v);
        e.target.value = "";
      }}
    >
      <option value="">Wybierz akcję</option>
      {PRODUCT_BULK_PRIMARY_ACTIONS.map((a) => (
        <option key={a.id} value={a.id}>
          {a.label}
        </option>
      ))}
    </select>
  );
}

export type ProductListMutationsMenuProps = {
  disabled?: boolean;
  onSelect: (action: ProductBulkHubChoice) => void;
};

export function ProductListMutationsMenu({ disabled, onSelect }: ProductListMutationsMenuProps) {
  return (
    <details className="group relative">
      <summary
        className={`inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 shadow-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden ${
          disabled ? "pointer-events-none opacity-40" : ""
        }`}
        aria-label="Mutacje"
      >
        Multiakcje
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute left-0 z-50 mt-1 max-h-[min(70vh,28rem)] w-[min(100vw-2rem,17rem)] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60">
        <button
          type="button"
          className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
          onClick={() => {
            onSelect("increase_price_percent");
            const det = (document.activeElement as HTMLElement | null)?.closest("details");
            if (det) det.open = false;
          }}
        >
          Podniesienie ceny %
        </button>
        <button
          type="button"
          className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
          onClick={() => {
            onSelect("clear_logistics_data");
            const det = (document.activeElement as HTMLElement | null)?.closest("details");
            if (det) det.open = false;
          }}
        >
          Wyczyść dane logistyczne
        </button>
        <button
          type="button"
          disabled
          title="Wkrótce"
          className="flex w-full px-3 py-2 text-left text-sm text-slate-400"
        >
          Obniżenie ceny %
        </button>
        <button
          type="button"
          disabled
          title="Wkrótce"
          className="flex w-full px-3 py-2 text-left text-sm text-slate-400"
        >
          Zmiana marży
        </button>
        <button
          type="button"
          disabled
          title="Wkrótce"
          className="flex w-full px-3 py-2 text-left text-sm text-slate-400"
        >
          Zaokrąglenie cen
        </button>
        <button
          type="button"
          disabled
          title="Wkrótce"
          className="flex w-full px-3 py-2 text-left text-sm text-slate-400"
        >
          Zmiana cen wg reguł
        </button>
      </div>
    </details>
  );
}
