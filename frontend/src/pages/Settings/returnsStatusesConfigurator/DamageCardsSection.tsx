import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Pencil, Plus } from "lucide-react";

import type {
  ReturnDamageClassDto,
  ReturnDamageReasonDto,
  ReturnModuleConfigDto,
} from "../../../types/returnModuleConfig";
import { IntegrationsApiPanel, IntegrationsCodeField } from "./AdvancedSettingsPanel";
import { ConfiguratorSectionShell, WMS_VISIBILITY_LABEL } from "./ConfiguratorSectionShell";
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

  const patchClass = (row: ReturnDamageClassDto, patch: Partial<ReturnDamageClassDto>) => {
    setDraft({
      ...cfg,
      damage_classes: cfg.damage_classes.map((r) => (r.code === row.code ? { ...r, ...patch } : r)),
    });
  };

  const patchReason = (row: ReturnDamageReasonDto, patch: Partial<ReturnDamageReasonDto>) => {
    setDraft({
      ...cfg,
      damage_reasons: cfg.damage_reasons.map((r) =>
        r.code === row.code && r.class_code === row.class_code ? { ...r, ...patch } : r,
      ),
    });
  };

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
    const merged = {
      ...next,
      is_active: original?.is_active ?? next.is_active,
      visible_wms: original?.visible_wms ?? next.visible_wms,
      code: original?.code ?? next.code,
      sort_order: original?.sort_order ?? next.sort_order,
    };
    if (mode === "create") setDraft({ ...cfg, damage_reasons: [...cfg.damage_reasons, merged] });
    else if (original) {
      setDraft({
        ...cfg,
        damage_reasons: cfg.damage_reasons.map((r) =>
          r.code === original.code && r.class_code === original.class_code ? merged : r,
        ),
      });
    }
    setReasonModal(null);
  };

  return (
    <>
      <ConfiguratorSectionShell
        id="uszkodzenia"
        title="Uszkodzenia"
        action={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-slate-900"
            onClick={() => setClassModal({ mode: "create" })}
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj grupę
          </button>
        }
      >
        <div className="space-y-10">
          {classes.map((cls) => {
            const reasons = reasonsByClass.get(cls.code) ?? [];
            return (
              <div key={cls.code} className="space-y-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: cls.color_hex?.startsWith("#") ? cls.color_hex : "#94a3b8" }}
                    aria-hidden
                  />
                  <button
                    type="button"
                    className="text-sm font-bold text-slate-900 hover:underline"
                    onClick={() => setClassModal({ mode: "edit", row: cls })}
                  >
                    {cls.label || cls.code}
                  </button>
                  <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      className="rounded border-slate-300"
                      checked={cls.is_active}
                      onChange={(e) => patchClass(cls, { is_active: e.target.checked })}
                    />
                    Aktywna
                  </label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
                    onClick={() => setClassModal({ mode: "edit", row: cls })}
                  >
                    <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden />
                    Edytuj grupę
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {reasons.map((r) => (
                    <DamageReasonTile
                      key={`${r.class_code}-${r.code}`}
                      row={r}
                      onEdit={() => setReasonModal({ mode: "edit", row: r })}
                      onPatch={(patch) => patchReason(r, patch)}
                    />
                  ))}
                  <button
                    type="button"
                    className="flex min-h-[5rem] items-center justify-center rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-700"
                    onClick={() => setReasonModal({ mode: "create", classCode: cls.code })}
                  >
                    <Plus className="mr-1.5 h-4 w-4" strokeWidth={2} aria-hidden />
                    Dodaj typ
                  </button>
                </div>
              </div>
            );
          })}
          {classes.length === 0 ? <p className="text-sm text-slate-400">Brak grup — dodaj pierwszą.</p> : null}
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
                  if (!window.confirm(`Usunąć grupę „${classModal.row!.label}”?`)) return;
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

function DamageReasonTile({
  row,
  onEdit,
  onPatch,
}: {
  row: ReturnDamageReasonDto;
  onEdit: () => void;
  onPatch: (patch: Partial<ReturnDamageReasonDto>) => void;
}) {
  return (
    <div className={`space-y-2 rounded-lg border border-slate-200/80 px-3 py-3 ${row.is_active ? "" : "opacity-60"}`}>
      <button type="button" className="text-left text-sm font-semibold text-slate-900 hover:underline" onClick={onEdit}>
        {row.label}
      </button>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={row.is_active}
          onChange={(e) => onPatch({ is_active: e.target.checked })}
        />
        Aktywne
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input
          type="checkbox"
          className="rounded border-slate-300"
          checked={row.visible_wms}
          onChange={(e) => onPatch({ visible_wms: e.target.checked })}
        />
        {WMS_VISIBILITY_LABEL}
      </label>
    </div>
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
        code: `grupa_${cfg.damage_classes.length + 1}`,
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
      title={mode === "create" ? "Nowa grupa uszkodzeń" : "Edytuj grupę"}
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
            placeholder="np. Lekkie uszkodzenia, Towar pełnowartościowy"
            onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            autoFocus
          />
        </label>
        <label className="block text-xs font-medium text-slate-600">
          Kolor
          <input
            type="color"
            className="mt-1 h-10 w-14 cursor-pointer rounded border border-slate-200"
            value={draft.color_hex?.startsWith("#") ? draft.color_hex : "#64748b"}
            onChange={(e) => setDraft((d) => ({ ...d, color_hex: e.target.value }))}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft((d) => ({ ...d, is_active: e.target.checked }))} />
          Aktywna
        </label>

        <IntegrationsApiPanel>
          <IntegrationsCodeField label="Kod grupy (class_code)" value={draft.code} onChange={(v) => setDraft((d) => ({ ...d, code: v.trim() }))} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.visible_wms} onChange={(e) => setDraft((d) => ({ ...d, visible_wms: e.target.checked }))} />
            {WMS_VISIBILITY_LABEL}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.resale_allowed} onChange={(e) => setDraft((d) => ({ ...d, resale_allowed: e.target.checked }))} />
            Produkt może wrócić do sprzedaży
          </label>
        </IntegrationsApiPanel>
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
      title={mode === "create" ? "Nowy typ uszkodzenia" : "Edytuj typ"}
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
          Grupa
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={draft.class_code}
            onChange={(e) => setDraft((d) => ({ ...d, class_code: e.target.value }))}
          >
            {cfg.damage_classes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label || c.code}
              </option>
            ))}
          </select>
        </label>
        {mode === "create" ? (
          <p className="text-xs text-slate-500">Aktywność i widoczność ustawisz na kafelku po zapisaniu.</p>
        ) : null}
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
