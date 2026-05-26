import { useMemo, type Dispatch, type SetStateAction } from "react";
import { Link } from "react-router-dom";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import type { ReturnUiMainGroup, ReturnUiStatusPanelSummary } from "../../types/wmsReturn";
import type {
  ReturnCustomerReturnTypeDto,
  ReturnDamageClassDto,
  ReturnDamageReasonDto,
  ReturnModuleConfigDto,
  ReturnOrderSourceDto,
  ReturnProductDecisionDto,
} from "../../types/returnModuleConfig";

const GROUP_TITLE: Record<ReturnUiMainGroup, string> = {
  NEW: "Nowe",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

/** Sekcja — ciaśniejsza niż stary SectionCard, wyraźna hierarchia. */
export function OpsSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200/90 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-3">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{eyebrow}</p>
        ) : null}
        <h3 className="text-lg font-semibold tracking-tight text-slate-900">{title}</h3>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function TechKeyDetails({
  code,
  onChange,
}: {
  code: string;
  onChange: (v: string) => void;
}) {
  return (
    <details className="mt-2 rounded-md border border-slate-100 bg-slate-50/90 text-xs">
      <summary className="cursor-pointer select-none px-2 py-1.5 font-medium text-slate-500 hover:text-slate-700">
        Zaawansowane — identyfikator dla systemu
      </summary>
      <div className="border-t border-slate-100 px-2 py-2">
        <label className="block text-[10px] font-medium uppercase text-slate-400">Identyfikator</label>
        <input
          value={code}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1 font-mono text-[11px]"
          spellCheck={false}
        />
        <p className="mt-1.5 text-[11px] leading-snug text-slate-500">
          Zmiana może wpływać na integracje — zwykle nie trzeba tego ruszać.
        </p>
      </div>
    </details>
  );
}

function renumber<T extends { sort_order: number }>(rows: T[], start = 10, step = 10): T[] {
  return rows.map((r, i) => ({ ...r, sort_order: start + i * step }));
}

function GripSortRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-stretch gap-2 rounded-lg border border-slate-200/90 bg-white px-2 py-2 shadow-sm"
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Przeciągnij aby zmienić kolejność"
        aria-label="Przeciągnij"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Podgląd statusów widocznych na liście zwrotów (dane z API statusów panelowych). */
export function ReturnsPanelStatusesOverview({
  panelSnap,
  count,
}: {
  panelSnap: ReturnUiStatusPanelSummary | null;
  count: number;
}) {
  return (
    <OpsSection
      eyebrow="Lista i szczegóły zwrotu"
      title="Statusy zwrotu"
      description="Nazwy i kolory etykiet na liście zwrotów — edytujesz je w jednym miejscu."
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-700">
          Aktywnych etykiet: <span className="font-semibold tabular-nums text-slate-900">{count}</span>
        </p>
        <Link
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          to="/orders/returns/panel-statuses"
        >
          Edytuj statusy i kolory
        </Link>
      </div>
      {panelSnap?.groups?.length ? (
        <div className="mt-4 space-y-4">
          {panelSnap.groups.map((g) => (
            <div key={g.main_group} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {GROUP_TITLE[g.main_group]}
                </span>
                <span className="text-[11px] tabular-nums text-slate-400">{g.total_count} na liście</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.sub_statuses.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex max-w-full items-center gap-2 truncate rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-800 shadow-sm"
                    title={s.name}
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white"
                      style={{
                        backgroundColor:
                          (s.badge_color && s.badge_color.startsWith("#") ? s.badge_color : null) ?? "#94a3b8",
                      }}
                      aria-hidden
                    />
                    {s.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">Brak wczytanych grup — wybierz magazyn i odśwież konfigurację.</p>
      )}
    </OpsSection>
  );
}

export function ProductDecisionsEditor({
  cfg,
  setDraft,
}: {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const accepted = useMemo(
    () => [...cfg.product_decisions].filter((p) => p.category === "ACCEPTED").sort((a, b) => a.sort_order - b.sort_order),
    [cfg.product_decisions],
  );
  const rejected = useMemo(
    () => [...cfg.product_decisions].filter((p) => p.category === "REJECTED").sort((a, b) => a.sort_order - b.sort_order),
    [cfg.product_decisions],
  );

  const idsA = useMemo(() => accepted.map((p) => `pd:A:${p.code}`), [accepted]);
  const idsR = useMemo(() => rejected.map((p) => `pd:R:${p.code}`), [rejected]);

  const mergeBack = (nextA: ReturnProductDecisionDto[], nextR: ReturnProductDecisionDto[]) => {
    setDraft({
      ...cfg,
      product_decisions: [...renumber(nextA), ...renumber(nextR)],
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const aid = String(active.id);
    const oid = String(over.id);
    if (aid.startsWith("pd:A:") && oid.startsWith("pd:A:")) {
      const oldIndex = accepted.findIndex((p) => `pd:A:${p.code}` === aid);
      const newIndex = accepted.findIndex((p) => `pd:A:${p.code}` === oid);
      if (oldIndex === -1 || newIndex === -1) return;
      mergeBack(arrayMove(accepted, oldIndex, newIndex), rejected);
      return;
    }
    if (aid.startsWith("pd:R:") && oid.startsWith("pd:R:")) {
      const oldIndex = rejected.findIndex((p) => `pd:R:${p.code}` === aid);
      const newIndex = rejected.findIndex((p) => `pd:R:${p.code}` === oid);
      if (oldIndex === -1 || newIndex === -1) return;
      mergeBack(accepted, arrayMove(rejected, oldIndex, newIndex));
    }
  };

  const updateRow = (row: ReturnProductDecisionDto, patch: Partial<ReturnProductDecisionDto>) => {
    setDraft({
      ...cfg,
      product_decisions: cfg.product_decisions.map((r) =>
        r.category === row.category && r.code === row.code ? { ...r, ...patch } : r,
      ),
    });
  };

  const renderDecision = (row: ReturnProductDecisionDto, cat: "ACCEPTED" | "REJECTED") => (
    <GripSortRow id={cat === "ACCEPTED" ? `pd:A:${row.code}` : `pd:R:${row.code}`} key={`${cat}-${row.code}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={row.label}
          onChange={(e) => updateRow(row, { label: e.target.value })}
          className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm font-medium text-slate-900"
          placeholder="Nazwa dla operatorów"
        />
        <div className="flex shrink-0 flex-wrap items-center gap-4">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={row.visible_wms}
              onChange={(e) => updateRow(row, { visible_wms: e.target.checked })}
            />
            WMS
          </label>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input type="checkbox" checked={row.is_active} onChange={(e) => updateRow(row, { is_active: e.target.checked })} />
            Aktywny
          </label>
          {cat === "REJECTED" ? (
            <label className="flex max-w-[200px] items-start gap-1.5 text-xs leading-snug text-slate-600">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={row.creates_stock_document === true}
                onChange={(e) => updateRow(row, { creates_stock_document: e.target.checked })}
              />
              <span>PZ_RT — przyjęcie na magazyn przy zamknięciu RMZ</span>
            </label>
          ) : null}
        </div>
      </div>
      <TechKeyDetails code={row.code} onChange={(v) => updateRow(row, { code: v.trim() })} />
    </GripSortRow>
  );

  return (
    <OpsSection
      eyebrow="Decyzja na pozycji"
      title="Decyzje produktowe"
      description="To nie są statusy dokumentu RMZ — tylko etykiety decyzji na linii produktu (WMS / panel)."
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Przyjęcia i zamiana</p>
            <SortableContext items={idsA} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">{accepted.map((r) => renderDecision(r, "ACCEPTED"))}</div>
            </SortableContext>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Odrzucone</p>
            <SortableContext items={idsR} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">{rejected.map((r) => renderDecision(r, "REJECTED"))}</div>
            </SortableContext>
          </div>
        </div>
      </DndContext>
      <button
        type="button"
        className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() =>
          setDraft({
            ...cfg,
            product_decisions: [
              ...cfg.product_decisions,
              {
                category: "ACCEPTED",
                code: `pd_${Date.now()}`,
                label: "Nowa decyzja",
                visible_wms: true,
                sort_order: (accepted.at(-1)?.sort_order ?? 0) + 10,
                is_active: true,
                creates_stock_document: false,
              },
            ],
          })
        }
      >
        Dodaj decyzję (przyjęcie)
      </button>
      <button
        type="button"
        className="ml-2 mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() =>
          setDraft({
            ...cfg,
            product_decisions: [
              ...cfg.product_decisions,
              {
                category: "REJECTED",
                code: `pd_${Date.now()}`,
                label: "Nowy powód odrzucenia",
                visible_wms: true,
                sort_order: (rejected.at(-1)?.sort_order ?? 0) + 10,
                is_active: true,
                creates_stock_document: false,
              },
            ],
          })
        }
      >
        Dodaj decyzję (odrzucenie)
      </button>
    </OpsSection>
  );
}

export function DamageClassesEditor({
  cfg,
  setDraft,
}: {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sorted = useMemo(
    () => [...cfg.damage_classes].sort((a, b) => a.sort_order - b.sort_order),
    [cfg.damage_classes],
  );
  const ids = useMemo(() => sorted.map((r) => `dc:${r.code}`), [sorted]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((r) => `dc:${r.code}` === String(active.id));
    const newIndex = sorted.findIndex((r) => `dc:${r.code}` === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = renumber(arrayMove(sorted, oldIndex, newIndex));
    const codes = new Set(next.map((x) => x.code));
    const rest = cfg.damage_classes.filter((r) => !codes.has(r.code));
    setDraft({ ...cfg, damage_classes: [...next, ...rest] });
  };

  const update = (row: ReturnDamageClassDto, patch: Partial<ReturnDamageClassDto>) => {
    setDraft({
      ...cfg,
      damage_classes: cfg.damage_classes.map((r) => (r.code === row.code ? { ...r, ...patch } : r)),
    });
  };

  return (
    <OpsSection
      eyebrow="Grupy uszkodzeń"
      title="Klasy uszkodzenia"
      description="Używane przy klasyfikacji stanu — kolory pomagają na terminalu."
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {sorted.map((row) => (
              <GripSortRow key={row.code} id={`dc:${row.code}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    type="color"
                    className="h-9 w-12 cursor-pointer rounded border border-slate-200"
                    value={row.color_hex?.startsWith("#") ? row.color_hex : "#64748b"}
                    onChange={(e) => update(row, { color_hex: e.target.value })}
                  />
                  <input
                    value={row.label}
                    onChange={(e) => update(row, { label: e.target.value })}
                    className="min-w-[160px] flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm font-medium"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={row.resale_allowed}
                      onChange={(e) => update(row, { resale_allowed: e.target.checked })}
                    />
                    Odsprzedaż
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    <input type="checkbox" checked={row.visible_wms} onChange={(e) => update(row, { visible_wms: e.target.checked })} />
                    WMS
                  </label>
                  <label className="flex items-center gap-1 text-xs text-slate-600">
                    <input type="checkbox" checked={row.is_active} onChange={(e) => update(row, { is_active: e.target.checked })} />
                    Aktywny
                  </label>
                </div>
                <TechKeyDetails code={row.code} onChange={(v) => update(row, { code: v.trim() })} />
              </GripSortRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() =>
          setDraft({
            ...cfg,
            damage_classes: [
              ...cfg.damage_classes,
              {
                code: `c${cfg.damage_classes.length + 1}`,
                label: "Nowa klasa",
                color_hex: "#64748b",
                description: null,
                warehouse_behavior: null,
                resale_allowed: true,
                visible_wms: true,
                sort_order: (sorted.at(-1)?.sort_order ?? 0) + 10,
                is_active: true,
              },
            ],
          })
        }
      >
        Dodaj klasę
      </button>
    </OpsSection>
  );
}

export function DamageReasonsEditor({
  cfg,
  setDraft,
}: {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byClass = useMemo(() => {
    const m = new Map<string, ReturnDamageReasonDto[]>();
    for (const r of cfg.damage_reasons) {
      const k = r.class_code;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    for (const [, arr] of m) arr.sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [cfg.damage_reasons]);

  const classOrder = useMemo(
    () => [...cfg.damage_classes].sort((a, b) => a.sort_order - b.sort_order).map((c) => c.code),
    [cfg.damage_classes],
  );

  const onDragEndClass = (classCode: string) => (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const local = [...(byClass.get(classCode) ?? [])];
    const ids = local.map((r) => `dr:${classCode}:${r.code}`);
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const moved = renumber(arrayMove(local, oldIndex, newIndex));
    const others = cfg.damage_reasons.filter((r) => r.class_code !== classCode);
    setDraft({ ...cfg, damage_reasons: [...others, ...moved] });
  };

  const updateReason = (row: ReturnDamageReasonDto, patch: Partial<ReturnDamageReasonDto>) => {
    setDraft({
      ...cfg,
      damage_reasons: cfg.damage_reasons.map((r) => (r.code === row.code && r.class_code === row.class_code ? { ...r, ...patch } : r)),
    });
  };

  return (
    <OpsSection
      eyebrow="Tagi dla uszkodzeń"
      title="Powody i typy uszkodzenia"
      description="Wybór przy zgłaszaniu stanu — jak tagi, nie jak tabela SQL."
    >
      <div className="space-y-6">
        {classOrder.map((cc) => {
          const cls = cfg.damage_classes.find((c) => c.code === cc);
          const rows = byClass.get(cc) ?? [];
          const ids = rows.map((r) => `dr:${cc}:${r.code}`);
          return (
            <div key={cc}>
              <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: cls?.color_hex?.startsWith("#") ? cls.color_hex : "#94a3b8" }}
                  aria-hidden
                />
                {cls?.label ?? cc}
              </p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndClass(cc)}>
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {rows.map((row) => (
                      <GripSortRow key={row.code} id={`dr:${cc}:${row.code}`}>
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-800"
                            value={row.class_code}
                            onChange={(e) => updateReason(row, { class_code: e.target.value })}
                            title="Grupa"
                          >
                            {cfg.damage_classes.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <span className="inline-flex max-w-[min(100%,28rem)] items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 shadow-sm">
                            <input
                              value={row.label}
                              onChange={(e) => updateReason(row, { label: e.target.value })}
                              className="min-w-[12rem] flex-1 border-0 bg-transparent p-0 text-sm focus:outline-none focus:ring-0"
                            />
                          </span>
                          <label className="flex items-center gap-1 text-[11px] text-slate-600">
                            <input
                              type="checkbox"
                              checked={row.visible_wms}
                              onChange={(e) => updateReason(row, { visible_wms: e.target.checked })}
                            />
                            WMS
                          </label>
                          <label className="flex items-center gap-1 text-[11px] text-slate-600">
                            <input
                              type="checkbox"
                              checked={row.is_active}
                              onChange={(e) => updateReason(row, { is_active: e.target.checked })}
                            />
                            Aktywny
                          </label>
                        </div>
                        <TechKeyDetails code={row.code} onChange={(v) => updateReason(row, { code: v.trim() })} />
                      </GripSortRow>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() => {
          const cls = cfg.damage_classes[0]?.code ?? "B";
          setDraft({
            ...cfg,
            damage_reasons: [
              ...cfg.damage_reasons,
              {
                class_code: cls,
                code: `powod_${Date.now()}`,
                label: "Nowy powód",
                visible_wms: true,
                sort_order: (cfg.damage_reasons.filter((r) => r.class_code === cls).at(-1)?.sort_order ?? 0) + 10,
                is_active: true,
              },
            ],
          });
        }}
      >
        Dodaj powód
      </button>
    </OpsSection>
  );
}

export function CustomerReturnTypesEditor({
  cfg,
  setDraft,
}: {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sorted = useMemo(
    () => [...cfg.customer_return_types].sort((a, b) => a.sort_order - b.sort_order),
    [cfg.customer_return_types],
  );
  const ids = useMemo(() => sorted.map((r) => `crt:${r.code}`), [sorted]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((r) => `crt:${r.code}` === String(active.id));
    const newIndex = sorted.findIndex((r) => `crt:${r.code}` === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setDraft({ ...cfg, customer_return_types: renumber(arrayMove(sorted, oldIndex, newIndex)) });
  };

  const update = (row: ReturnCustomerReturnTypeDto, patch: Partial<ReturnCustomerReturnTypeDto>) => {
    setDraft({
      ...cfg,
      customer_return_types: cfg.customer_return_types.map((r) => (r.code === row.code ? { ...r, ...patch } : r)),
    });
  };

  return (
    <OpsSection
      eyebrow="Formularz klienta"
      title="Rodzaje zwrotów"
      description="Co klient wybiera jako powód — bez kodów technicznych w widoku głównym."
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {sorted.map((row) => (
              <GripSortRow key={row.code} id={`crt:${row.code}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={row.label}
                    onChange={(e) => update(row, { label: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm font-medium"
                  />
                  <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={row.is_active} onChange={(e) => update(row, { is_active: e.target.checked })} />
                    Aktywny
                  </label>
                </div>
                <TechKeyDetails code={row.code} onChange={(v) => update(row, { code: v.trim() })} />
              </GripSortRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() =>
          setDraft({
            ...cfg,
            customer_return_types: [
              ...cfg.customer_return_types,
              {
                code: `rodzaj_${Date.now()}`,
                label: "Nowy rodzaj zwrotu",
                sort_order: (sorted.at(-1)?.sort_order ?? 0) + 10,
                is_active: true,
              },
            ],
          })
        }
      >
        Dodaj rodzaj
      </button>
    </OpsSection>
  );
}

export function OrderSourcesEditor({
  cfg,
  setDraft,
}: {
  cfg: ReturnModuleConfigDto;
  setDraft: Dispatch<SetStateAction<ReturnModuleConfigDto | null>>;
}) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const sorted = useMemo(() => [...cfg.order_sources].sort((a, b) => a.sort_order - b.sort_order), [cfg.order_sources]);
  const ids = useMemo(() => sorted.map((r) => `os:${r.code}`), [sorted]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sorted.findIndex((r) => `os:${r.code}` === String(active.id));
    const newIndex = sorted.findIndex((r) => `os:${r.code}` === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    setDraft({ ...cfg, order_sources: renumber(arrayMove(sorted, oldIndex, newIndex)) });
  };

  const update = (row: ReturnOrderSourceDto, patch: Partial<ReturnOrderSourceDto>) => {
    setDraft({
      ...cfg,
      order_sources: cfg.order_sources.map((r) => (r.code === row.code ? { ...r, ...patch } : r)),
    });
  };

  return (
    <OpsSection
      eyebrow="Kanały sprzedaży"
      title="Źródła zamówień"
      description="Widoczna nazwa dla ludzi — kolejność przeciągnięciem."
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {sorted.map((row) => (
              <GripSortRow key={row.code} id={`os:${row.code}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    value={row.label}
                    onChange={(e) => update(row, { label: e.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm font-medium"
                    placeholder="Np. Allegro"
                  />
                  <label className="flex shrink-0 items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={row.is_active} onChange={(e) => update(row, { is_active: e.target.checked })} />
                    Aktywny
                  </label>
                </div>
                <TechKeyDetails code={row.code} onChange={(v) => update(row, { code: v.trim() })} />
              </GripSortRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button
        type="button"
        className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        onClick={() =>
          setDraft({
            ...cfg,
            order_sources: [
              ...cfg.order_sources,
              {
                code: `zrodlo_${Date.now()}`,
                label: "Nowe źródło",
                sort_order: (sorted.at(-1)?.sort_order ?? 0) + 10,
                is_active: true,
              },
            ],
          })
        }
      >
        Dodaj źródło
      </button>
    </OpsSection>
  );
}
