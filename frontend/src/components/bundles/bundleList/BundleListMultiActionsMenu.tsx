import { ChevronDown } from "lucide-react";

export type BundleMultiMenuActionId = "delete" | "export";

const MENU_ROWS: { id: BundleMultiMenuActionId; label: string }[] = [
  { id: "delete", label: "Usuń zaznaczone" },
  { id: "export", label: "Eksportuj zaznaczone" },
];

export type BundleListMultiActionsMenuProps = {
  disabled?: boolean;
  onSelect: (id: BundleMultiMenuActionId) => void;
};

export function BundleListMultiActionsMenu({ disabled, onSelect }: BundleListMultiActionsMenuProps) {
  return (
    <details className="group relative">
      <summary
        className={`inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-900 shadow-none transition hover:bg-slate-50 [&::-webkit-details-marker]:hidden ${
          disabled ? "pointer-events-none opacity-40" : ""
        }`}
        aria-label="Multiakcje"
      >
        Multiakcje
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-500 group-open:rotate-180" aria-hidden />
      </summary>
      <div className="absolute left-0 z-50 mt-1 w-[min(100vw-2rem,17rem)] overflow-hidden rounded-md border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-200/60">
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
