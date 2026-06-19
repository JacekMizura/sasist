import { useMemo, useState, type Dispatch, type SetStateAction } from "react";

import type { ReturnModuleConfigDto } from "../../../types/returnModuleConfig";
import { CustomerFormPreviewCard } from "./CustomerFormPreviewCard";
import { DictionaryEntryModal } from "./DictionaryEntryModal";
import { DictionaryListCard } from "./DictionaryListCard";
import type { DictionaryKind } from "./constants";

type Props = {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
};

type ModalState =
  | { kind: "return_type"; mode: "create" | "edit"; row?: ReturnModuleConfigDto["customer_return_types"][number] }
  | { kind: "source"; mode: "create" | "edit"; row?: ReturnModuleConfigDto["order_sources"][number] }
  | null;

export function ReturnsDictionariesConfigurator({ cfg, setDraft }: Props) {
  const [modal, setModal] = useState<ModalState>(null);
  const [previewTypeCode, setPreviewTypeCode] = useState<string | null>(null);
  const [previewSourceCode, setPreviewSourceCode] = useState<string | null>(null);

  const typeSortNext = useMemo(() => (cfg.customer_return_types.at(-1)?.sort_order ?? 0) + 10, [cfg.customer_return_types]);
  const sourceSortNext = useMemo(() => (cfg.order_sources.at(-1)?.sort_order ?? 0) + 10, [cfg.order_sources]);

  const deleteEntry = (kind: DictionaryKind, code: string) => {
    const label =
      kind === "return_type"
        ? cfg.customer_return_types.find((r) => r.code === code)?.label
        : cfg.order_sources.find((r) => r.code === code)?.label;
    if (!window.confirm(`Usunąć „${label ?? code}”?`)) return;
    if (kind === "return_type") {
      setDraft({ ...cfg, customer_return_types: cfg.customer_return_types.filter((r) => r.code !== code) });
      if (previewTypeCode === code) setPreviewTypeCode(null);
    } else {
      setDraft({ ...cfg, order_sources: cfg.order_sources.filter((r) => r.code !== code) });
      if (previewSourceCode === code) setPreviewSourceCode(null);
    }
  };

  const saveEntry = (
    kind: DictionaryKind,
    mode: "create" | "edit",
    entry: ReturnModuleConfigDto["customer_return_types"][number] | ReturnModuleConfigDto["order_sources"][number],
    originalCode?: string,
  ) => {
    const matchCode = mode === "edit" ? (originalCode ?? entry.code) : entry.code;
    if (kind === "return_type") {
      const row = entry as ReturnModuleConfigDto["customer_return_types"][number];
      if (mode === "create") {
        setDraft({ ...cfg, customer_return_types: [...cfg.customer_return_types, row] });
        setPreviewTypeCode(row.code);
      } else {
        setDraft({
          ...cfg,
          customer_return_types: cfg.customer_return_types.map((r) => (r.code === matchCode ? row : r)),
        });
      }
    } else {
      const row = entry as ReturnModuleConfigDto["order_sources"][number];
      if (mode === "create") {
        setDraft({ ...cfg, order_sources: [...cfg.order_sources, row] });
        setPreviewSourceCode(row.code);
      } else {
        setDraft({
          ...cfg,
          order_sources: cfg.order_sources.map((r) => (r.code === matchCode ? row : r)),
        });
      }
    }
    setModal(null);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Słowniki zwrotów</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">
          Rodzaje zwrotów i źródła zamówień widoczne w formularzu klienta. Zmiany zapisujesz przyciskiem na dole strony.
        </p>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
        <div className="space-y-6">
          <DictionaryListCard
            title="Rodzaje zwrotów"
            description="Powody wybierane przez klienta podczas tworzenia zwrotu."
            addLabel="Dodaj rodzaj"
            kind="return_type"
            rows={cfg.customer_return_types}
            onAdd={() => setModal({ kind: "return_type", mode: "create" })}
            onEdit={(row) => setModal({ kind: "return_type", mode: "edit", row: row as ReturnModuleConfigDto["customer_return_types"][number] })}
            onDelete={(row) => deleteEntry("return_type", row.code)}
          />
          <DictionaryListCard
            title="Źródła zwrotów"
            description="Kanały sprzedaży dostępne przy tworzeniu zwrotu."
            addLabel="Dodaj źródło"
            kind="source"
            rows={cfg.order_sources}
            onAdd={() => setModal({ kind: "source", mode: "create" })}
            onEdit={(row) => setModal({ kind: "source", mode: "edit", row: row as ReturnModuleConfigDto["order_sources"][number] })}
            onDelete={(row) => deleteEntry("source", row.code)}
          />
        </div>

        <CustomerFormPreviewCard
          cfg={cfg}
          selectedTypeCode={previewTypeCode}
          selectedSourceCode={previewSourceCode}
          onSelectType={setPreviewTypeCode}
          onSelectSource={setPreviewSourceCode}
        />
      </div>

      {modal ? (
        <DictionaryEntryModal
          open
          mode={modal.mode}
          kind={modal.kind}
          row={modal.row ?? null}
          defaultSortOrder={modal.kind === "return_type" ? typeSortNext : sourceSortNext}
          onClose={() => setModal(null)}
          onSave={(entry) => saveEntry(modal.kind, modal.mode, entry, modal.row?.code)}
        />
      ) : null}
    </div>
  );
}
