import { useMemo, useState } from "react";

import { flatSectionDividerClass, flatSectionsStackClass } from "../../../components/layout/flatSectionTokens";
import type { ReturnModuleConfigDto } from "../../../types/returnModuleConfig";
import { DictionaryListCard } from "./DictionaryListCard";
import { OrderSourceEntryModal, ReturnTypeEntryModal } from "./DictionaryEntryModal";
import { renumberDictionary } from "./constants";
import { ORDER_SOURCE_MARKETPLACE_PRESETS, slugDictionaryCode } from "./marketplaceSourceUtils";

type Props = {
  cfg: ReturnModuleConfigDto;
  saving?: boolean;
  onPersist: (next: ReturnModuleConfigDto) => Promise<boolean>;
};

type ModalState =
  | { kind: "return_type"; mode: "create" | "edit"; row: ReturnModuleConfigDto["customer_return_types"][number] }
  | { kind: "source"; mode: "create" | "edit"; row: ReturnModuleConfigDto["order_sources"][number] }
  | null;

export function ReturnsDictionariesConfigurator({ cfg, saving = false, onPersist }: Props) {
  const [modal, setModal] = useState<ModalState>(null);

  const typeSortNext = useMemo(() => (cfg.customer_return_types.at(-1)?.sort_order ?? 0) + 10, [cfg.customer_return_types]);
  const sourceSortNext = useMemo(() => (cfg.order_sources.at(-1)?.sort_order ?? 0) + 10, [cfg.order_sources]);

  const persistTypes = async (types: ReturnModuleConfigDto["customer_return_types"]) => {
    await onPersist({ ...cfg, customer_return_types: types });
  };

  const persistSources = async (sources: ReturnModuleConfigDto["order_sources"]) => {
    await onPersist({ ...cfg, order_sources: sources });
  };

  const deleteEntry = async (kind: "return_type" | "source", code: string) => {
    const label =
      kind === "return_type"
        ? cfg.customer_return_types.find((r) => r.code === code)?.label
        : cfg.order_sources.find((r) => r.code === code)?.label;
    if (!window.confirm(`Usunąć „${label ?? code}”?`)) return;
    if (kind === "return_type") {
      await persistTypes(cfg.customer_return_types.filter((r) => r.code !== code));
    } else {
      await persistSources(cfg.order_sources.filter((r) => r.code !== code));
    }
  };

  const toggleActive = async (kind: "return_type" | "source", code: string, active: boolean) => {
    if (kind === "return_type") {
      await persistTypes(cfg.customer_return_types.map((r) => (r.code === code ? { ...r, is_active: active } : r)));
    } else {
      await persistSources(cfg.order_sources.map((r) => (r.code === code ? { ...r, is_active: active } : r)));
    }
  };

  const reorderTypes = async (rows: ReturnModuleConfigDto["customer_return_types"]) => {
    await persistTypes(renumberDictionary(rows));
  };

  const reorderSources = async (rows: ReturnModuleConfigDto["order_sources"]) => {
    await persistSources(renumberDictionary(rows));
  };

  const openCreateReturnType = () => {
    setModal({
      kind: "return_type",
      mode: "create",
      row: { code: slugDictionaryCode("rodzaj", "nowy"), label: "", sort_order: typeSortNext, is_active: true },
    });
  };

  const openCreateSource = () => {
    const preset = ORDER_SOURCE_MARKETPLACE_PRESETS[0];
    setModal({
      kind: "source",
      mode: "create",
      row: { code: preset.code, label: preset.label, sort_order: sourceSortNext, is_active: true },
    });
  };

  const saveReturnType = async (entry: ReturnModuleConfigDto["customer_return_types"][number], mode: "create" | "edit", originalCode?: string) => {
    const matchCode = mode === "edit" ? (originalCode ?? entry.code) : entry.code;
    let next = entry;
    if (mode === "create") {
      next = { ...entry, code: slugDictionaryCode("rodzaj", entry.label) };
      await persistTypes([...cfg.customer_return_types, next]);
    } else {
      await persistTypes(cfg.customer_return_types.map((r) => (r.code === matchCode ? next : r)));
    }
    setModal(null);
  };

  const saveSource = async (entry: ReturnModuleConfigDto["order_sources"][number], mode: "create" | "edit", originalCode?: string) => {
    const matchCode = mode === "edit" ? (originalCode ?? entry.code) : entry.code;
    let next = entry;
    if (mode === "create") {
      const preset = ORDER_SOURCE_MARKETPLACE_PRESETS.find((p) => p.code === entry.code);
      next = preset ? { ...entry, code: preset.code } : { ...entry, code: slugDictionaryCode("zrodlo", entry.label) };
      await persistSources([...cfg.order_sources, next]);
    } else {
      await persistSources(cfg.order_sources.map((r) => (r.code === matchCode ? next : r)));
    }
    setModal(null);
  };

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Słowniki zwrotów</h1>
        <div className={flatSectionDividerClass} aria-hidden />
      </header>

      <div className={flatSectionsStackClass}>
        <DictionaryListCard
          title="Rodzaje zwrotów"
          addLabel="Dodaj rodzaj"
          kind="return_type"
          rows={cfg.customer_return_types}
          busy={saving}
          onAdd={openCreateReturnType}
          onEdit={(row) =>
            setModal({ kind: "return_type", mode: "edit", row: row as ReturnModuleConfigDto["customer_return_types"][number] })
          }
          onDelete={(row) => void deleteEntry("return_type", row.code)}
          onToggleActive={(row, active) => void toggleActive("return_type", row.code, active)}
          onReorder={(rows) => void reorderTypes(rows as ReturnModuleConfigDto["customer_return_types"])}
        />
        <DictionaryListCard
          title="Źródła zamówień"
          addLabel="Dodaj źródło"
          kind="source"
          rows={cfg.order_sources}
          busy={saving}
          onAdd={openCreateSource}
          onEdit={(row) => setModal({ kind: "source", mode: "edit", row: row as ReturnModuleConfigDto["order_sources"][number] })}
          onDelete={(row) => void deleteEntry("source", row.code)}
          onToggleActive={(row, active) => void toggleActive("source", row.code, active)}
          onReorder={(rows) => void reorderSources(rows as ReturnModuleConfigDto["order_sources"])}
        />
      </div>

      {modal?.kind === "return_type" ? (
        <ReturnTypeEntryModal
          open
          mode={modal.mode}
          row={modal.row}
          onClose={() => setModal(null)}
          onSave={(entry) => void saveReturnType(entry, modal.mode, modal.mode === "edit" ? modal.row.code : undefined)}
        />
      ) : null}

      {modal?.kind === "source" ? (
        <OrderSourceEntryModal
          open
          mode={modal.mode}
          row={modal.row}
          onClose={() => setModal(null)}
          onSave={(entry) => void saveSource(entry, modal.mode, modal.mode === "edit" ? modal.row.code : undefined)}
        />
      ) : null}
    </div>
  );
}
