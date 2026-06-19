import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Plus } from "lucide-react";

import type {
  ReturnDamageClassDto,
  ReturnDamageReasonDto,
  ReturnModuleConfigDto,
} from "../../../types/returnModuleConfig";
import { AdvancedCodeField, AdvancedSettingsPanel } from "./AdvancedSettingsPanel";
import { damageClassDisplayLabel } from "./businessLabels";
import { ConfiguratorSectionShell } from "./ConfiguratorSectionShell";
import { ReturnsConfiguratorModalShell } from "./ReturnsConfiguratorModalShell";

type Props = {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
};

export function DamageCardsSection({ cfg, setDraft }: Props) {
  const [classModal, setClassModal] = useState<{ mode: "create" | "edit"; row?: ReturnDamageClassDto } | null>(null);
  const [reasonModal, setReasonModal] = useState<{ mode: "create" | "edit"; row?: ReturnDamageReasonDto; classCode?: string } | null>(
    null,
  );

  const classes = useMemo(
    () => [...cfg.damage_classes].sort((a, b) => a.sort_order - b.sort_order),
    [cfg.damage_classes],
  );

  const reasonsByClass = useMemo(() => {
    const m = new Map<string, ReturnDamageReasonDto[]>();
    for (const r of cfg.damage_reasons) {
      if (!m.has(r.class_code)) m.set(r.class_code, []);
      m.get(r.class_code)!.push(r);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [cfg.damage_reasons]);

  const saveClass = (next: ReturnDamageClassDto, mode: "create" | "edit", original?: ReturnDamageClassDto) => {
    if (mode === "create") setDraft({ ...cfg, damage_classes: [...cfg.damage_classes, next] });
    else if (original) {
      setDraft({
        ...cfg,
        damage_classes: cfg.damage_classes.map((r) => (r.code === original.code ? next : r)),
      });
    }
    setClassModal(null);
  };

  const saveReason = (next: ReturnDamageReasonDto, mode: "create" | "edit", original?: ReturnDamageReasonDto) => {
    if (mode === "create") setDraft({ ...cfg, damage_reasons: [...cfg.damage_reasons, next] });
    else if (original) {
      setDraft({
        ...cfg,
        damage_reasons: cfg.damage_reasons.map((r) =>
          r.code === original.code && r.class_code === original.class_code ? next : r,
        ),
      });
    }
    setReasonModal(null);
  };

  return (
    <>
      <ConfiguratorSectionShell
        id="uszkodzenia"
        eyebrow="Sekcja 4"
        title="Uszkodzenia"
        description="Typy uszkodzeń wybierane przy kontroli jakości — bez technicznych kodów klas na liście głównej."
        action={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setClassModal({ mode: "create" })}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj grupę
          </button>
        }
      >
        <div className="space-y-8">
          {classes.map((cls) => {
            const reasons = reasonsByClass.get(cls.code) ?? [];
            return (
              <div key={cls.code}>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full ring-2 ring-white"
                    style={{ backgroundColor: cls.color_hex?.startsWith("#") ? cls.color_hex : "#94a3b8" }}
                    aria-hidden
                  />
                  <h3 className="text-sm font-bold text-slate-900">{damageClassDisplayLabel(cls)}</h3>
                  <button
                    type="button"
                    className="text-xs font-semibold text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-800"
                    onClick={() => setClassModal({ mode: "edit", row: cls })}
                  >
                    Edytuj grupę
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {reasons.map((r) => (
                    <DamageReasonCard key={`${r.class_code}-${r.code}`} row={r} onEdit={() => setReasonModal({ mode: "edit", row: r })} />
                  ))}
                  <button
                    type="button"
                    className="flex min-h-[4.5rem] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-4 py-3 text-sm font-semibold text-slate-600 hover:border-slate-400 hover:bg-white"
                    onClick={() => setReasonModal({ mode: "create", classCode: cls.code })}
                  >
                    <Plus className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                    Dodaj typ
                  </button>
                </div>
              </div>
            );
          })}
          {classes.length === 0 ? <p className="text-sm text-slate-400">Brak grup uszkodzeń — dodaj pierwszą.</p> : null}
        </div>
      </ConfiguratorSectionShell>

      {classModal ? (
        <DamageClassModal
          mode={classModal.mode}
          row={classModal.row}
          cfg={cfg}
          onClose={() => setClassModal(null)}
          onSave={saveClass}
          onDelete={
            classModal.row
              ? () => {
                  if (!window.confirm(`Usunąć grupę „${damageClassDisplayLabel(classModal.row!)}”?`)) return;
                  setDraft({
                    ...cfg,
                    damage_classes: cfg.damage_classes.filter((c) => c.code !== classModal.row!.code),
                    damage_reasons: cfg.damage_reasons.filter((r) => r.class_code !== classModal.row!.code),
                  });
                  setClassModal(null);
                }
              : undefined
          }
        />
      ) : null}

      {reasonModal ? (
        <DamageReasonModal
          mode={reasonModal.mode}
          row={reasonModal.row}
          defaultClassCode={reasonModal.classCode ?? classes[0]?.code ?? "B"}
          cfg={cfg}
          onClose={() => setReasonModal(null)}
          onSave={saveReason}
          onDelete={
            reasonModal.row
              ? () => {
                  if (!window.confirm(`Usunąć „${reasonModal.row!.label}”?`)) return;
                  setDraft({
                    ...cfg,
                    damage_reasons: cfg.damage_reasons.filter(
                      (r) => !(r.code === reasonModal.row!.code && r.class_code === reasonModal.row!.class_code),
                    ),
                  });
                  setReasonModal(null);
                }
              : undefined
          }
        />
      ) : null}
    </>
  );
}

function DamageReasonCard({ row, onEdit }: { row: ReturnDamageReasonDto; onEdit: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition hover:border-slate-300 hover:shadow ${
        row.is_active ? "border-slate-200/90" : "border-slate-100 opacity-60"
      }`}
      onClick={onEdit}
    >
      <p className="font-medium text-slate-900">{row.label}</p>
      <p className="mt-1 text-xs text-slate-500">
        {row.visible_wms ? "Widoczne na terminalu WMS" : "Tylko panel biurowy"}
        {!row.is_active ? " · Nieaktywne" : ""}
      </p>
    </button>
  );
}

function DamageClassModal({
  mode,
  row,
  cfg,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "create" | "edit";
  row?: ReturnDamageClassDto;
  cfg: ReturnModuleConfigDto;
  onClose: () => void;
  onSave: (next: ReturnDamageClassDto, mode: "create" | "edit", original?: ReturnDamageClassDto) => void;
  onDelete?: () => void;
}) {
  const sorted = [...cfg.damage_classes].sort((a, b) => a.sort_order - b.sort_order);
  const [draft, setDraft] = useState<ReturnDamageClassDto>(
    () =>
      row ?? {
        code: `c${cfg.damage_classes.length + 1}`,
        label: "",
        color_hex: "#64748b",
        description: null,
        warehouse_behavior: null,
        resale_allowed: true,
        visible_wms: true,
        sort_order: (sorted.at(-1)?.sort_order ?? 0) + 10,
        is_active: true,
      },
  );

  return (
    <ReturnsConfiguratorModalShell
      open
      title={mode === "create" ? "Nowa grupa uszkodzeń" : "Edytuj grupę uszkodzeń"}
      subtitle="Nazwa widoczna dla operatorów — np. „Lekkie uszkodzenia”."
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && onDelete ? (
            <button type="button" className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" onClick={onDelete}>
              Usuń grupę
            </button>
          ) : null}
          <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={!draft.label.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={() => onSave({ ...draft, label: draft.label.trim() }, mode, row)}
          >
            Zapisz
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          Nazwa grupy
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={draft.label}
            placeholder="np. Lekkie uszkodzenia"
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            autoFocus
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Kolor etykiety
          <input
            type="color"
            className="mt-1 h-10 w-14 cursor-pointer rounded border border-slate-200"
            value={draft.color_hex?.startsWith("#") ? draft.color_hex : "#64748b"}
            onChange={(e) => setDraft((d) => ({ ...d, color_hex: e.target.value }))}
          />
        </label>
        <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.visible_wms} onChange={(e) => setDraft((d) => ({ ...d, visible_wms: e.target.checked }))} />
            Widoczna na terminalu WMS
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.resale_allowed} onChange={(e) => setDraft((d) => ({ ...d, resale_allowed: e.target.checked }))} />
            Produkt może wrócić do sprzedaży
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
            Grupa aktywna
          </label>
        </div>
        <AdvancedSettingsPanel>
          <AdvancedCodeField label="Kod klasy (class_code)" value={draft.code} onChange={(v) => setDraft((d) => ({ ...d, code: v.trim() }))} />
          <label className="block text-xs font-medium text-slate-600">
            Zachowanie magazynowe (warehouse_behavior)
            <input
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
              value={draft.warehouse_behavior ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, warehouse_behavior: e.target.value.trim() || null }))}
            />
          </label>
          <label className="block text-xs font-medium text-slate-600">
            Opis wewnętrzny
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={2}
              value={draft.description ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value.trim() || null }))}
            />
          </label>
        </AdvancedSettingsPanel>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}

function DamageReasonModal({
  mode,
  row,
  defaultClassCode,
  cfg,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "create" | "edit";
  row?: ReturnDamageReasonDto;
  defaultClassCode: string;
  cfg: ReturnModuleConfigDto;
  onClose: () => void;
  onSave: (next: ReturnDamageReasonDto, mode: "create" | "edit", original?: ReturnDamageReasonDto) => void;
  onDelete?: () => void;
}) {
  const inClass = cfg.damage_reasons.filter((r) => r.class_code === (row?.class_code ?? defaultClassCode));
  const [draft, setDraft] = useState<ReturnDamageReasonDto>(
    () =>
      row ?? {
        class_code: defaultClassCode,
        code: `dr_${Date.now()}`,
        label: "",
        visible_wms: true,
        sort_order: (inClass.at(-1)?.sort_order ?? 0) + 10,
        is_active: true,
      },
  );

  return (
    <ReturnsConfiguratorModalShell
      open
      title={mode === "create" ? "Nowy typ uszkodzenia" : "Edytuj typ uszkodzenia"}
      onClose={onClose}
      footer={
        <>
          {mode === "edit" && onDelete ? (
            <button type="button" className="mr-auto rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50" onClick={onDelete}>
              Usuń
            </button>
          ) : null}
          <button type="button" className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={!draft.label.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={() => onSave({ ...draft, label: draft.label.trim() }, mode, row)}
          >
            Zapisz
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block text-xs font-medium text-slate-600">
          Nazwa
          <input
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={draft.label}
            placeholder="np. Rysy, Brak metki"
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            autoFocus
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Grupa uszkodzeń
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={draft.class_code}
            onChange={(e) => setDraft((d) => ({ ...d, class_code: e.target.value }))}
          >
            {cfg.damage_classes.map((c) => (
              <option key={c.code} value={c.code}>
                {damageClassDisplayLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={draft.visible_wms} onChange={(e) => setDraft((d) => ({ ...d, visible_wms: e.target.checked }))} />
          Widoczne na terminalu WMS
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
          Aktywne
        </label>
        <AdvancedSettingsPanel>
          <AdvancedCodeField label="Identyfikator (code)" value={draft.code} onChange={(v) => setDraft((d) => ({ ...d, code: v.trim() }))} />
          <label className="block text-xs font-medium text-slate-600">
            Kolejność
            <input
              type="number"
              className="mt-1 w-full max-w-[8rem] rounded-lg border border-slate-200 px-3 py-2 text-sm"
              value={draft.sort_order}
              onChange={(e) => setDraft((d) => ({ ...d, sort_order: Number(e.target.value) }))}
            />
          </label>
        </AdvancedSettingsPanel>
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
