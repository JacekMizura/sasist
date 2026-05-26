import { ChevronDown } from "lucide-react";

export type MultiMenuActionId =
  | "change_status"
  | "change_operator"
  | "add_tag"
  | "remove_tag"
  | "add_note"
  | "change_shipping"
  | "change_payment_status"
  | "packing_queue"
  | "issue_document"
  | "print"
  | "export"
  | "custom_field_value"
  | "delete"
  | "archive";

const MENU_ROWS: { id: MultiMenuActionId; label: string }[] = [
  { id: "change_status", label: "Zmień status" },
  { id: "change_operator", label: "Zmień operatora" },
  { id: "add_tag", label: "Dodaj tag" },
  { id: "remove_tag", label: "Usuń tag" },
  { id: "add_note", label: "Dodaj notatkę" },
  { id: "change_shipping", label: "Zmień metodę wysyłki" },
  { id: "change_payment_status", label: "Zmień status płatności" },
  { id: "packing_queue", label: "Dodaj do kolejki pakowania" },
  { id: "issue_document", label: "Generuj dokument" },
  { id: "print", label: "Drukuj" },
  { id: "export", label: "Eksportuj" },
  { id: "custom_field_value", label: "Zmień wartość pola dodatkowego" },
  { id: "delete", label: "Usuń" },
  { id: "archive", label: "Archiwizuj" },
];

export type OrderListMultiActionsMenuProps = {
  disabled?: boolean;
  onSelect: (id: MultiMenuActionId) => void;
};

export function OrderListMultiActionsMenu({ disabled, onSelect }: OrderListMultiActionsMenuProps) {
  return (
    <details className="group relative">
      <summary
        className={`inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 shadow-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden ${
          disabled ? "pointer-events-none opacity-40" : ""
        }`}
        aria-label="Multiakcje"
      >
        Multiakcje
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute left-0 z-50 mt-1 max-h-[min(70vh,28rem)] w-[min(100vw-2rem,17rem)] overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60">
        {MENU_ROWS.map((row) => (
          <button
            key={row.id}
            type="button"
            className="flex w-full px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-50"
            onClick={() => {
              onSelect(row.id);
              const det = (document.activeElement as HTMLElement | null)?.closest("details");
              if (det) det.open = false;
            }}
          >
            {row.label}
          </button>
        ))}
      </div>
    </details>
  );
}
