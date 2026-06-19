import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Calendar,
  Check,
  ChevronDown,
  Copy,
  FlaskConical,
  MousePointerClick,
  Save,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import { useWarehouse } from "../../context/WarehouseContext";
import { useAuth } from "../../context/AuthContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { useOrderAutomationStore } from "../../hooks/useOrderAutomationStore";
import type {
  AutomationCondition,
  AutomationConditionJoin,
  AutomationConditionOp,
  AutomationEffect,
  AutomationEffectKind,
  OrderAutomationManualTrigger,
  OrderAutomationRule,
  OrderAutomationScheduleSpec,
} from "../../types/orderAutomation";
import { loadActionGroups, newUid, saveActionGroups } from "../../utils/orderAutomationLocalStore";
import {
  ORDER_AUTOMATION_CONDITION_FIELDS,
  ORDER_AUTOMATION_OPERATOR_UI,
  buildConditionCategorySteps,
  buildEffectCategorySteps,
  conditionFieldLabel,
} from "../../utils/orderAutomationCatalog";
import { formatConditionChipShort, formatEffectPill } from "../../utils/orderAutomationPreview";
import {
  decodeScheduleCron,
  defaultScheduleSpec,
  defaultTimezone,
  encodeScheduleCron,
  normalizeScheduleRows,
} from "../../utils/orderAutomationSchedule";
import { getManualIconComponent } from "@/modules/orders/automation/utils/orderAutomationManualIcons";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { AutomationIconGridPicker } from "../../components/orders/automation/AutomationIconGridPicker";
import { AutomationCategoryStepMenu } from "../../components/orders/automation/AutomationCategoryStepMenu";
import { AutomationAnchorMenu, type AutomationAnchorMenuGroup } from "../../components/orders/automation/AutomationAnchorMenu";
import { WmsOrderedStatusPopover } from "../../components/orders/automation/WmsOrderedStatusPopover";
import { renderAutomationEffectConfigEditor } from "../../components/orders/automation/effects/orderAutomationEffectEditorRenderers";
import { FlatPageSection } from "../../components/layout/FlatPageSection";
import { flatFormSectionsStackClass, flatSectionDividerClass, moduleSettingsPageShellClass } from "../../components/layout/flatSectionTokens";
import { ModuleListBreadcrumb } from "../../components/listPage/moduleList";
import { IntegrationsApiPanel } from "../Settings/returnsStatusesConfigurator/AdvancedSettingsPanel";
import {
  moduleListRowClass,
  moduleListTableClass,
  moduleListTableScrollClass,
  moduleListTdClass,
  moduleListThClass,
  moduleListTheadClass,
} from "../../components/listPage/moduleList";
import {
  oaBtn,
  oaBtnPri,
  oaBtnDanger,
  oaIconGhost,
  oaInp,
  oaInpDense,
  oaLbl,
  oaToggleChip,
} from "../../components/orders/automation/orderAutomationUiTokens";

function defaultRule(): OrderAutomationRule {
  return {
    id: newUid("rule"),
    name: "Nowa automatyzacja",
    group: "Ogólne",
    enabled: true,
    manualTrigger: {
      enabled: false,
      label: "Akcja",
      icon: "⚡",
      color: "#0f172a",
      shortcut: "",
      iconSource: "system",
      iconKey: "Zap",
      customImageDataUrl: null,
    },
    conditions: [],
    effects: [],
    execution: {
      onOrderCreated: true,
      onStatusChanged: true,
      onSchedule: false,
      scheduleCron: "",
    },
    stats: { lastRunAt: null, runCount: 0 },
  };
}

function migrateManualTrigger(m: OrderAutomationManualTrigger | null | undefined): OrderAutomationManualTrigger {
  const defaults: OrderAutomationManualTrigger = {
    enabled: false,
    label: "Akcja",
    icon: "⚡",
    color: "#0f172a",
    shortcut: "",
    iconSource: "system",
    iconKey: "Zap",
    customImageDataUrl: null,
  };
  if (!m || typeof m !== "object") return defaults;
  return {
    ...defaults,
    ...m,
    iconSource: m.iconSource ?? "system",
    iconKey: m.iconKey ?? "Zap",
    customImageDataUrl: m.customImageDataUrl ?? null,
  };
}

function ensureEffectPayload(effect: AutomationEffect): AutomationEffect {
  const defaults = payloadForKind(effect.kind);
  const merged: Record<string, string | number | boolean | null> = { ...defaults, ...effect.payload };
  if (effect.kind === "print" && !String(merged.print_document ?? "").trim() && String(merged.template ?? "").trim()) {
    merged.print_document = String(merged.template);
  }
  return { ...effect, payload: merged };
}

function normalizeRule(r: OrderAutomationRule): OrderAutomationRule {
  const def = defaultRule();
  const conditions = Array.isArray(r.conditions) ? r.conditions : [];
  const effects = Array.isArray(r.effects) ? r.effects : [];
  const execution =
    r.execution && typeof r.execution === "object"
      ? r.execution
      : { ...def.execution };
  const stats =
    r.stats && typeof r.stats === "object"
      ? { lastRunAt: r.stats.lastRunAt ?? null, runCount: Number(r.stats.runCount) || 0 }
      : { ...def.stats };

  const decodedSch = decodeScheduleCron(execution.scheduleCron);
  const scheduleCron = decodedSch ? encodeScheduleCron(decodedSch) : execution.scheduleCron ?? "";

  return {
    ...def,
    ...r,
    manualTrigger: migrateManualTrigger(r.manualTrigger),
    execution: { ...execution, scheduleCron },
    conditions: conditions.map((c, i) => ({
      ...c,
      joinToNext: i < conditions.length - 1 ? (c.joinToNext ?? "and") : undefined,
    })),
    effects: effects.map(ensureEffectPayload),
    stats,
  };
}

function payloadForKind(kind: AutomationEffectKind): Record<string, string | number | boolean | null> {
  switch (kind) {
    case "change_status":
      return { order_ui_status_id: "" };
    case "send_message":
      return { template: "", message_channel: "email", delay_min: "0" };
    case "print":
      return { printer: "", print_document: "", template: "", copies: "1" };
    case "assign_courier":
      return { courier_preset: "", courier: "" };
    case "add_tag":
      return { tag: "" };
    case "generate_document":
      return { doc_type: "", doc_series: "", print_station: "", copies: "1" };
    case "wms_action":
      return { action_key: "" };
    default:
      return {};
  }
}

const OA_DAY_ROWS: { day: number; label: string }[] = [
  { day: 1, label: "Pn" },
  { day: 2, label: "Wt" },
  { day: 3, label: "Śr" },
  { day: 4, label: "Cz" },
  { day: 5, label: "Pt" },
  { day: 6, label: "So" },
  { day: 7, label: "Nd" },
];

type LogicAddZoneProps = {
  variant: "condition" | "effect";
  label: string;
  hint: string;
  expanded: boolean;
  anchorRef?: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
};

function LogicAddZone({ variant, label, hint, expanded, anchorRef, onClick }: LogicAddZoneProps) {
  const tone =
    variant === "condition"
      ? "border-sky-200/90 hover:border-sky-300 hover:bg-sky-50/40"
      : "border-emerald-200/90 hover:border-emerald-300 hover:bg-emerald-50/40";
  const plusTone = variant === "condition" ? "text-sky-500" : "text-emerald-500";

  return (
    <button
      type="button"
      ref={anchorRef}
      onClick={onClick}
      className={`flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-white px-4 text-center transition ${tone} ${expanded ? "min-h-[10rem] flex-1 py-10" : "py-5"}`}
    >
      <span className={`text-2xl font-light leading-none ${plusTone}`}>+</span>
      <span className="text-sm font-medium text-slate-900">{label}</span>
      {expanded ? <span className="max-w-xs text-xs text-slate-500">{hint}</span> : null}
    </button>
  );
}

const LOG_ROWS = [
  {
    when: "2026-02-04, 14:32",
    user: "Anna Kowalska",
    initials: "AK",
    event: "Utworzono akcję i ustawiono tryb: Samoczynnie",
  },
  {
    when: "2026-02-03, 09:15",
    user: "Marek Nowak",
    initials: "MN",
    event: "Zmieniono warunek #1: Status zamówienia → jest równe → Opłacone",
  },
  {
    when: "2026-02-01, 16:48",
    user: "System",
    initials: "SY",
    event: "Zapisano szablon akcji (bez publikacji)",
  },
];

export default function OrderAutomationEditorPage() {
  const { pathname } = useLocation();
  const isInventory = pathname.includes("/orders/automation/inventory");
  const scope = isInventory ? "inventory" : "orders";
  const baseList = isInventory ? "/orders/automation/inventory" : "/orders/automation/orders";
  const isNew = pathname.endsWith("/new");

  const { ruleId } = useParams<{ ruleId: string }>();
  const navigate = useNavigate();
  const { warehouse } = useWarehouse();
  const wid = warehouse?.id ?? null;
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("settings.automation");

  const store = useOrderAutomationStore(DAMAGE_TENANT_ID, wid, scope);
  const { hydrated, reload, upsertRule, deleteRule, recordTestRun, byId } = store;

  const [draft, setDraft] = useState<OrderAutomationRule>(() => defaultRule());
  const [statusSummary, setStatusSummary] = useState<OrderUiStatusPanelSummary | null>(null);
  const [groupOptions, setGroupOptions] = useState<string[]>([]);
  const [nameTouched, setNameTouched] = useState(false);
  const [testOpen, setTestOpen] = useState(false);

  const condAddRef = useRef<HTMLButtonElement>(null);
  const effAddRef = useRef<HTMLButtonElement>(null);
  const statusAnchorRef = useRef<HTMLElement | null>(null);
  const condFieldAnchorRef = useRef<HTMLElement | null>(null);
  const effectKindAnchorRef = useRef<HTMLElement | null>(null);
  const groupMenuAnchorRef = useRef<HTMLElement | null>(null);
  const iconPickerAnchorRef = useRef<HTMLElement | null>(null);

  const [condMenuOpen, setCondMenuOpen] = useState(false);
  const [effMenuOpen, setEffMenuOpen] = useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [openConditionFieldFor, setOpenConditionFieldFor] = useState<string | null>(null);
  const [openEffectKindFor, setOpenEffectKindFor] = useState<string | null>(null);
  const [statusPick, setStatusPick] = useState<null | { mode: "cond"; uid: string }>(null);

  const seededNew = useRef(false);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!testOpen) return;
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key === "Escape") setTestOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [testOpen]);

  useEffect(() => {
    if (wid == null) return;
    void (async () => {
      try {
        const s = await getOrderUiStatusSummary(DAMAGE_TENANT_ID, wid, { includeInactive: true });
        setStatusSummary(s);
      } catch {
        setStatusSummary(null);
      }
    })();
    try {
      const g = loadActionGroups(DAMAGE_TENANT_ID, wid).map((x) => x.name);
      setGroupOptions([...new Set(g)].sort((a, b) => a.localeCompare(b, "pl")));
    } catch {
      setGroupOptions([]);
    }
  }, [wid]);

  useEffect(() => {
    if (!hydrated) return;
    if (isNew) {
      if (!seededNew.current) {
        setDraft(defaultRule());
        seededNew.current = true;
      }
      return;
    }
    seededNew.current = false;
    const id = ruleId ?? "";
    const r = byId.get(id);
    if (r) setDraft(normalizeRule({ ...r }));
  }, [hydrated, isNew, ruleId, byId, scope]);

  const statusNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const g of statusSummary?.groups ?? []) {
      for (const s of g.sub_statuses ?? []) {
        m.set(s.id, s.name);
      }
    }
    return m;
  }, [statusSummary]);

  const panelStatusOptions = useMemo(() => {
    const out: { id: number; name: string }[] = [];
    for (const g of statusSummary?.groups ?? []) {
      for (const s of g.sub_statuses ?? []) {
        out.push({ id: s.id, name: s.name });
      }
    }
    return out;
  }, [statusSummary]);

  const conditionCategorySteps = useMemo(() => buildConditionCategorySteps(), []);
  const effectCategorySteps = useMemo(() => buildEffectCategorySteps(), []);

  const groupPickerGroups: AutomationAnchorMenuGroup[] = useMemo(() => {
    const items: AutomationAnchorMenuGroup["items"] = groupOptions.map((g) => ({ id: g, label: g }));
    items.push({ id: "__new__", label: "+ Utwórz nową grupę" });
    return [{ id: "grp", title: "", items }];
  }, [groupOptions]);

  const scheduleSpec: OrderAutomationScheduleSpec = useMemo(() => {
    const base = decodeScheduleCron(draft.execution.scheduleCron) ?? defaultScheduleSpec();
    return { ...base, rows: normalizeScheduleRows(base.rows) };
  }, [draft.execution.scheduleCron]);

  const bumpSchedule = (fn: (s: OrderAutomationScheduleSpec) => OrderAutomationScheduleSpec) => {
    setDraft((d) => {
      const cur = decodeScheduleCron(d.execution.scheduleCron) ?? defaultScheduleSpec();
      const next = fn({ ...cur, timezone: cur.timezone || defaultTimezone() });
      return { ...d, execution: { ...d.execution, scheduleCron: encodeScheduleCron(next) } };
    });
  };

  const ops: AutomationConditionOp[] = ["eq", "neq", "contains"];

  const addCondition = (fieldKey: string) => {
    const def = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === fieldKey);
    const c: AutomationCondition = {
      uid: newUid("c"),
      fieldKey,
      operator: def?.valueKind === "number" ? "eq" : "eq",
      value: "",
      joinToNext: "and",
    };
    setDraft((d) => {
      const next = [...d.conditions, c];
      return normalizeRule({ ...d, conditions: next });
    });
  };

  const addEffect = (kind: AutomationEffectKind) => {
    const base: AutomationEffect = { uid: newUid("e"), kind, payload: payloadForKind(kind) };
    setDraft((d) => ({ ...d, effects: [...d.effects, base] }));
  };

  const duplicateCondition = (c: AutomationCondition) => {
    const copy: AutomationCondition = { ...c, uid: newUid("c") };
    setDraft((d) => {
      const idx = d.conditions.findIndex((x) => x.uid === c.uid);
      if (idx < 0) return d;
      const next = [...d.conditions];
      next.splice(idx + 1, 0, copy);
      return normalizeRule({ ...d, conditions: next });
    });
  };

  const duplicateEffect = (e: AutomationEffect) => {
    const copy: AutomationEffect = { uid: newUid("e"), kind: e.kind, payload: { ...e.payload } };
    setDraft((d) => {
      const idx = d.effects.findIndex((x) => x.uid === e.uid);
      if (idx < 0) return d;
      const next = [...d.effects];
      next.splice(idx + 1, 0, copy);
      return { ...d, effects: next };
    });
  };

  const patchEffectKind = (uid: string, kind: AutomationEffectKind) => {
    setDraft((d) => ({
      ...d,
      effects: d.effects.map((x) => (x.uid === uid ? { uid: x.uid, kind, payload: payloadForKind(kind) } : x)),
    }));
  };

  const patchEffectPayload = (uid: string, partial: Record<string, string | number | boolean | null>) => {
    setDraft((d) => ({
      ...d,
      effects: d.effects.map((x) => (x.uid === uid ? { ...x, payload: { ...x.payload, ...partial } } : x)),
    }));
  };

  const setJoinToNext = (conditionUid: string, join: AutomationConditionJoin) => {
    setDraft((d) =>
      normalizeRule({
        ...d,
        conditions: d.conditions.map((c) => (c.uid === conditionUid ? { ...c, joinToNext: join } : c)),
      }),
    );
  };

  const openStatus = (el: HTMLElement, pick: { mode: "cond"; uid: string }) => {
    statusAnchorRef.current = el;
    setStatusPick(pick);
  };

  const save = () => {
    setNameTouched(true);
    if (!draft.name.trim()) {
      toast.error("Podaj nazwę automatyzacji.");
      return;
    }
    upsertRule(normalizeRule(draft));
    toast.success("Zapisano.");
    if (isNew) navigate(`${baseList}/${draft.id}/edit`, { replace: true });
  };

  const selectedStatusId =
    statusPick?.mode === "cond"
      ? Number(draft.conditions.find((c) => c.uid === statusPick.uid)?.value) || null
      : null;

  const nameInvalid = nameTouched && !draft.name.trim();

  const breadcrumbItems = useMemo(() => {
    const base = [
      { label: "Zamówienia", to: "/orders/list" as const },
      { label: "Akcje automatyczne", to: baseList as const },
    ];
    if (isNew) return [...base, { label: "Nowa akcja" }];
    return [...base, { label: draft.name.trim() || "Edycja akcji" }];
  }, [baseList, draft.name, isNew]);

  if (wid == null) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Wybierz magazyn w nagłówku aplikacji.
      </div>
    );
  }

  if (!canWrite) {
    return (
      <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
        Brak uprawnienia <span className="font-mono text-[11px]">settings.automation</span>.
      </div>
    );
  }

  if (!isNew && hydrated && ruleId && !byId.has(ruleId)) {
    return (
      <div className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
        Nie znaleziono akcji.
        <Link to={baseList} className="mt-2 block text-sm font-semibold text-blue-700 hover:underline">
          Wróć do listy
        </Link>
      </div>
    );
  }

  return (
    <div className={`${moduleSettingsPageShellClass} min-w-0 pb-8 text-[13px] text-slate-900`}>
      <ModuleListBreadcrumb items={breadcrumbItems} />

      <div className="mb-8 mt-6">
        <h1 className="text-2xl font-semibold text-slate-900">{isNew ? "Nowa akcja automatyczna" : "Edycja akcji automatycznej"}</h1>
      </div>

      <div className={flatFormSectionsStackClass}>
        <FlatPageSection title="Nazwa akcji" dense>
          <div className="grid gap-5 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-6">
              <label className={oaLbl}>
                Nazwa
                <input
                  type="text"
                  className={`${oaInp} mt-1 ${nameInvalid ? "border-red-400 ring-2 ring-red-200" : ""}`}
                  value={draft.name}
                  placeholder="np. Zmiana statusu po opłaceniu"
                  onBlur={() => setNameTouched(true)}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              {nameInvalid ? <span className="mt-1 block text-xs text-red-600">Pole wymagane</span> : null}
            </div>
            <div className="sm:col-span-4">
              <span className={oaLbl}>Grupa akcji</span>
              <button
                type="button"
                className={`${oaInp} mt-1 flex items-center justify-between text-left`}
                onClick={(e) => {
                  groupMenuAnchorRef.current = e.currentTarget;
                  setGroupMenuOpen(true);
                }}
              >
                <span className="truncate">{draft.group || "—"}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
              </button>
            </div>
            <label className={`${oaLbl} flex items-center gap-2 sm:col-span-2 sm:pb-2`}>
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={draft.enabled}
                onChange={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
              />
              Aktywna
            </label>
          </div>
        </FlatPageSection>

        <FlatPageSection title="Wyzwalacze" dense>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={oaToggleChip(draft.execution.onOrderCreated)}
              onClick={() => setDraft((d) => ({ ...d, execution: { ...d.execution, onOrderCreated: !d.execution.onOrderCreated } }))}
            >
              <Activity className="h-4 w-4" /> Po utworzeniu
            </button>
            <button
              type="button"
              className={oaToggleChip(draft.execution.onStatusChanged)}
              onClick={() => setDraft((d) => ({ ...d, execution: { ...d.execution, onStatusChanged: !d.execution.onStatusChanged } }))}
            >
              <Activity className="h-4 w-4" /> Zmiana statusu
            </button>
            <button
              type="button"
              className={oaToggleChip(draft.execution.onSchedule)}
              onClick={() =>
                setDraft((d) => {
                  const on = !d.execution.onSchedule;
                  let cron = d.execution.scheduleCron;
                  if (on && !decodeScheduleCron(cron)) cron = encodeScheduleCron(defaultScheduleSpec());
                  return { ...d, execution: { ...d.execution, onSchedule: on, scheduleCron: cron } };
                })
              }
            >
              <Calendar className="h-4 w-4" /> Harmonogram
            </button>
          </div>

          {draft.execution.onSchedule ? (
            <div className={`${moduleListTableScrollClass} mt-5`}>
              <table className={moduleListTableClass}>
                <thead className={moduleListTheadClass}>
                  <tr>
                    <th className={moduleListThClass}>Dzień</th>
                    <th className={`${moduleListThClass} text-center`}>Aktywny</th>
                    <th className={moduleListThClass}>Godzina</th>
                    <th className={moduleListThClass}>Powtarzanie</th>
                  </tr>
                </thead>
                <tbody>
                  {OA_DAY_ROWS.map(({ day, label }) => {
                    const row =
                      scheduleSpec.rows.find((sch) => sch.day === day) ??
                      ({ day, enabled: false, hour: 8, minute: 0, repeatEveryMin: null } as const);
                    const tVal = `${String(row.hour).padStart(2, "0")}:${String(row.minute).padStart(2, "0")}`;
                    return (
                      <tr key={day} className={moduleListRowClass}>
                        <td className={moduleListTdClass}>{label}</td>
                        <td className={`${moduleListTdClass} text-center`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={row.enabled}
                            onChange={(ev) => bumpSchedule((s) => ({ ...s, rows: s.rows.map((r) => (r.day === day ? { ...r, enabled: ev.target.checked } : r)) }))}
                          />
                        </td>
                        <td className={moduleListTdClass}>
                          <input
                            type="time"
                            className={oaInpDense}
                            disabled={!row.enabled}
                            value={tVal}
                            onChange={(ev) => {
                              const [hs, ms] = ev.target.value.split(":");
                              const h = Math.min(23, Math.max(0, Number(hs) || 0));
                              const m = Math.min(59, Math.max(0, Number(ms) || 0));
                              bumpSchedule((s) => ({ ...s, rows: s.rows.map((r) => (r.day === day ? { ...r, hour: h, minute: m } : r)) }));
                            }}
                          />
                        </td>
                        <td className={moduleListTdClass}>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              placeholder="—"
                              className={`${oaInpDense} w-20`}
                              disabled={!row.enabled}
                              value={row.repeatEveryMin ?? ""}
                              onChange={(ev) => {
                                const raw = ev.target.value;
                                bumpSchedule((s) => ({
                                  ...s,
                                  rows: s.rows.map((r) => r.day === day ? { ...r, repeatEveryMin: !raw.trim() ? null : Math.max(1, Number(raw) || 1) } : r),
                                }));
                              }}
                            />
                            <span className="text-xs text-slate-500">min</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          <IntegrationsApiPanel title="⋯ Przycisk ręczny">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300"
                checked={draft.manualTrigger.enabled}
                onChange={() => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, enabled: !d.manualTrigger.enabled } }))}
              />
              <MousePointerClick className="h-4 w-4 text-slate-500" />
              Pokaż jako przycisk akcji na ekranie zamówienia
            </label>
            {draft.manualTrigger.enabled ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className={oaLbl}>
                  Nazwa przycisku
                  <input
                    className={`${oaInp} mt-1`}
                    value={draft.manualTrigger.label}
                    onChange={(e) => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, label: e.target.value } }))}
                  />
                </label>
                <label className={oaLbl}>
                  Kolor
                  <input
                    type="color"
                    className="mt-1 h-9 w-full cursor-pointer rounded-lg border border-slate-200 p-0.5"
                    value={draft.manualTrigger.color?.startsWith("#") ? draft.manualTrigger.color : "#0f172a"}
                    onChange={(e) => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, color: e.target.value } }))}
                  />
                </label>
                <div>
                  <span className={oaLbl}>Ikona</span>
                  <button
                    type="button"
                    className={`${oaInp} mt-1 flex items-center justify-between`}
                    onClick={(e) => {
                      iconPickerAnchorRef.current = e.currentTarget;
                      setIconPickerOpen(true);
                    }}
                  >
                    <span className="flex items-center gap-2">
                      {(() => {
                        const Icon = getManualIconComponent(draft.manualTrigger.iconKey);
                        return <Icon className="h-4 w-4 text-slate-600" />;
                      })()}
                      {draft.manualTrigger.iconKey}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  </button>
                </div>
                <label className={oaLbl}>
                  Skrót klawiszowy (opcja)
                  <input
                    className={`${oaInp} mt-1`}
                    placeholder="np. Ctrl+P"
                    value={draft.manualTrigger.shortcut}
                    onChange={(e) => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, shortcut: e.target.value } }))}
                  />
                </label>
              </div>
            ) : null}
          </IntegrationsApiPanel>
        </FlatPageSection>

        <section className="w-full space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Jeśli → To</h2>
            <p className="mt-1 text-sm text-slate-500">Spełnione warunki po lewej — wykonywane akcje po prawej.</p>
          </div>
          <div className={flatSectionDividerClass} aria-hidden />

          <div className="grid w-full items-stretch gap-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-8">
            {/* Jeśli */}
            <div className="flex min-h-[12rem] min-w-0 flex-col">
              <div className="mb-4 shrink-0">
                <h3 className="text-base font-semibold text-slate-900">Jeśli</h3>
                <p className="mt-0.5 text-sm text-slate-500">Warunki muszą być spełnione</p>
              </div>

              <div className="flex flex-1 flex-col">
                {draft.conditions.length > 0 ? (
                  <ul className="mb-4 divide-y divide-gray-100">
                    {draft.conditions.map((c, idx) => {
                      const meta = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === c.fieldKey);
                      const stName =
                        c.fieldKey === "order_status" && c.value && statusNameById.has(Number(c.value))
                          ? statusNameById.get(Number(c.value))!
                          : null;
                      const join = c.joinToNext ?? "and";
                      const isLast = idx >= draft.conditions.length - 1;

                      return (
                        <li key={c.uid} className="py-3 first:pt-0">
                          <p className="mb-2 text-sm font-medium text-slate-900">
                            {formatConditionChipShort(c, statusNameById)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              className={`${oaInpDense} min-w-[7.5rem] flex-1 text-left`}
                              onClick={(e) => {
                                condFieldAnchorRef.current = e.currentTarget;
                                setOpenConditionFieldFor(c.uid);
                              }}
                            >
                              <span className="truncate">{conditionFieldLabel(c.fieldKey)}</span>
                            </button>
                            <select
                              className={`${oaInpDense} w-[7.25rem] shrink-0`}
                              value={c.operator}
                              onChange={(e) =>
                                setDraft((d) =>
                                  normalizeRule({
                                    ...d,
                                    conditions: d.conditions.map((x) =>
                                      x.uid === c.uid ? { ...x, operator: e.target.value as AutomationConditionOp } : x,
                                    ),
                                  }),
                                )
                              }
                            >
                              {ops.map((op) => (
                                <option key={op} value={op}>
                                  {ORDER_AUTOMATION_OPERATOR_UI[op] ?? op}
                                </option>
                              ))}
                            </select>
                            <div className="min-w-[6rem] flex-1">
                              {meta?.valueKind === "status" ? (
                                <button
                                  type="button"
                                  className={`${oaInpDense} w-full text-left`}
                                  onClick={(e) => openStatus(e.currentTarget, { mode: "cond", uid: c.uid })}
                                >
                                  {stName ? (
                                    <span className="truncate">{stName}</span>
                                  ) : (
                                    <span className="text-slate-400">Wybierz…</span>
                                  )}
                                </button>
                              ) : (
                                <input
                                  className={oaInpDense}
                                  value={c.value}
                                  placeholder="Wartość…"
                                  onChange={(e) =>
                                    setDraft((d) =>
                                      normalizeRule({
                                        ...d,
                                        conditions: d.conditions.map((x) =>
                                          x.uid === c.uid ? { ...x, value: e.target.value } : x,
                                        ),
                                      }),
                                    )
                                  }
                                />
                              )}
                            </div>
                            <button type="button" className={oaIconGhost} title="Duplikuj warunek" onClick={() => duplicateCondition(c)}>
                              <Copy className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              className={`${oaIconGhost} hover:text-red-600`}
                              title="Usuń warunek"
                              onClick={() =>
                                setDraft((d) => normalizeRule({ ...d, conditions: d.conditions.filter((x) => x.uid !== c.uid) }))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          {!isLast ? (
                            <div className="mt-2 flex items-center gap-2">
                              <div className="h-px flex-1 bg-gray-200" aria-hidden />
                              <select
                                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 outline-none focus:border-slate-400"
                                value={join}
                                onChange={(e) => setJoinToNext(c.uid, e.target.value as AutomationConditionJoin)}
                                aria-label="Łącznik warunków"
                              >
                                <option value="and">ORAZ</option>
                                <option value="or">LUB</option>
                              </select>
                              <div className="h-px flex-1 bg-gray-200" aria-hidden />
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <div className={draft.conditions.length > 0 ? "mt-auto" : "flex flex-1 flex-col"}>
                  <LogicAddZone
                    variant="condition"
                    label="Dodaj warunek"
                    hint="Przeciągnij pola, aby zbudować warunek"
                    expanded={draft.conditions.length === 0}
                    anchorRef={condAddRef}
                    onClick={() => setCondMenuOpen(true)}
                  />
                </div>
              </div>
            </div>

            {/* Strzałka */}
            <div className="flex items-center justify-center py-1 lg:self-center lg:py-0">
              <ArrowRight className="h-8 w-8 shrink-0 rotate-90 text-slate-300 lg:rotate-0" aria-hidden />
            </div>

            {/* To */}
            <div className="flex min-h-[12rem] min-w-0 flex-col">
              <div className="mb-4 shrink-0">
                <h3 className="text-base font-semibold text-slate-900">To</h3>
                <p className="mt-0.5 text-sm text-slate-500">Akcje wykonywane po spełnieniu warunków</p>
              </div>

              <div className="flex flex-1 flex-col">
                {draft.effects.length > 0 ? (
                  <ul className="mb-4 divide-y divide-gray-100">
                    {draft.effects.map((e) => {
                      const summary = formatEffectPill(e, statusNameById);

                      return (
                        <li key={e.uid} className="py-3 first:pt-0">
                          <div className="flex items-start gap-2">
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.5} aria-hidden />
                            <div className="min-w-0 flex-1">
                              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                <button
                                  type="button"
                                  className="text-left text-sm font-medium text-slate-900 hover:text-slate-700"
                                  onClick={(ev) => {
                                    effectKindAnchorRef.current = ev.currentTarget;
                                    setOpenEffectKindFor(e.uid);
                                  }}
                                >
                                  {summary}
                                </button>
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <button type="button" className={oaIconGhost} title="Duplikuj akcję" onClick={() => duplicateEffect(e)}>
                                    <Copy className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    className={`${oaIconGhost} hover:text-red-600`}
                                    title="Usuń akcję"
                                    onClick={() => setDraft((d) => ({ ...d, effects: d.effects.filter((x) => x.uid !== e.uid) }))}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>
                              <div>
                                {renderAutomationEffectConfigEditor({
                                  kind: e.kind,
                                  effect: e,
                                  statusOptions: panelStatusOptions,
                                  patchPayload: (partial) => patchEffectPayload(e.uid, partial),
                                })}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <div className={draft.effects.length > 0 ? "mt-auto" : "flex flex-1 flex-col"}>
                  <LogicAddZone
                    variant="effect"
                    label="Dodaj akcję"
                    hint="Przeciągnij akcję, aby ją dodać"
                    expanded={draft.effects.length === 0}
                    anchorRef={effAddRef}
                    onClick={() => setEffMenuOpen(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <FlatPageSection title="Historia zmian" dense>
          <div className={moduleListTableScrollClass}>
            <table className={moduleListTableClass}>
              <thead className={moduleListTheadClass}>
                <tr>
                  <th className={moduleListThClass}>Data i godzina</th>
                  <th className={moduleListThClass}>Użytkownik</th>
                  <th className={moduleListThClass}>Zdarzenie</th>
                </tr>
              </thead>
              <tbody>
                {LOG_ROWS.map((row) => (
                  <tr key={row.when} className={moduleListRowClass}>
                    <td className={`${moduleListTdClass} whitespace-nowrap font-medium text-slate-900`}>{row.when}</td>
                    <td className={moduleListTdClass}>{row.user}</td>
                    <td className={`${moduleListTdClass} text-slate-600`}>{row.event}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </FlatPageSection>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 pt-8">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={oaBtn} onClick={() => navigate(baseList)}>Anuluj</button>
            {!isNew ? (
              <button
                type="button"
                className={oaBtnDanger}
                onClick={() => {
                  if (!window.confirm("Usunąć tę automatyzację?")) return;
                  deleteRule(draft.id);
                  toast.success("Usunięto.");
                  navigate(baseList);
                }}
              >
                <Trash2 className="h-4 w-4" /> Usuń
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={`${oaBtn} gap-2`} onClick={() => setTestOpen(true)}>
              <FlaskConical className="h-4 w-4" /> Test
            </button>
            <button type="button" className={`${oaBtnPri} gap-2`} onClick={save}>
              <Save className="h-4 w-4" /> Zapisz
            </button>
          </div>
        </div>
      </div>

      {/* MENU I POPOVERY */}
      <AutomationCategoryStepMenu
        open={condMenuOpen}
        anchorRef={condAddRef}
        title="Dodaj warunek"
        categories={conditionCategorySteps}
        onClose={() => setCondMenuOpen(false)}
        onPick={(id) => addCondition(id)}
      />
      <AutomationCategoryStepMenu
        open={effMenuOpen}
        anchorRef={effAddRef}
        title="Dodaj akcję"
        categories={effectCategorySteps}
        onClose={() => setEffMenuOpen(false)}
        onPick={(id) => addEffect(id as AutomationEffectKind)}
      />
      <AutomationCategoryStepMenu
        open={openConditionFieldFor !== null}
        anchorRef={condFieldAnchorRef}
        title="Wybierz pole"
        categories={conditionCategorySteps}
        onClose={() => setOpenConditionFieldFor(null)}
        onPick={(id) => {
          const uid = openConditionFieldFor;
          if (uid) {
            setDraft((d) =>
              normalizeRule({
                ...d,
                conditions: d.conditions.map((x) => (x.uid === uid ? { ...x, fieldKey: id, value: "" } : x)),
              }),
            );
          }
          setOpenConditionFieldFor(null);
        }}
      />
      <AutomationCategoryStepMenu
        open={openEffectKindFor !== null}
        anchorRef={effectKindAnchorRef}
        title="Zmień akcję"
        categories={effectCategorySteps}
        onClose={() => setOpenEffectKindFor(null)}
        onPick={(id) => {
          const uid = openEffectKindFor;
          if (uid) patchEffectKind(uid, id as AutomationEffectKind);
          setOpenEffectKindFor(null);
        }}
      />
      <AutomationAnchorMenu
        open={groupMenuOpen}
        anchorRef={groupMenuAnchorRef}
        title=""
        groups={groupPickerGroups}
        onClose={() => setGroupMenuOpen(false)}
        onPick={(id) => {
          if (id === "__new__") {
            const name = window.prompt("Nazwa nowej grupy:")?.trim();
            if (name && wid != null) {
              const existing = loadActionGroups(DAMAGE_TENANT_ID, wid);
              if (existing.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
                toast.error("Grupa już istnieje.");
              } else {
                const maxOrder = existing.reduce((m, x) => Math.max(m, x.sortOrder), 0);
                saveActionGroups(DAMAGE_TENANT_ID, wid, [...existing, { id: newUid("grp"), name, sortOrder: maxOrder + 10 }]);
                setGroupOptions((prev) => [...new Set([...prev, name])].sort((a, b) => a.localeCompare(b, "pl")));
                setDraft((d) => ({ ...d, group: name }));
                toast.success("Dodano grupę.");
              }
            }
          } else {
            setDraft((d) => ({ ...d, group: id }));
          }
          setGroupMenuOpen(false);
        }}
      />
      <AutomationIconGridPicker
        open={iconPickerOpen}
        anchorRef={iconPickerAnchorRef}
        selectedKey={draft.manualTrigger.iconKey}
        onClose={() => setIconPickerOpen(false)}
        onPick={(key) => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, iconKey: key, iconSource: "system" } }))}
      />
      {statusPick && wid != null ? (
        <WmsOrderedStatusPopover
          open
          anchorRef={statusAnchorRef}
          tenantId={DAMAGE_TENANT_ID}
          warehouseId={wid}
          selectedId={selectedStatusId}
          onClose={() => setStatusPick(null)}
          onSelect={(sid) => {
            setDraft((d) => normalizeRule({ ...d, conditions: d.conditions.map((c) => (c.uid === statusPick.uid ? { ...c, value: String(sid) } : c)) }));
            setStatusPick(null);
          }}
        />
      ) : null}

      {/* STICKY FOOTER removed — actions under form */}

      {/* MODAL TESTOWY */}
      {testOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" role="dialog" aria-modal>
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">Test akcji</h2>
            <p className="mt-2 text-sm text-slate-600">Symulacja uruchomienia akcji automatycznej.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className={oaBtn} onClick={() => setTestOpen(false)}>Zamknij</button>
              <button
                type="button"
                className={oaBtnPri}
                onClick={() => {
                  recordTestRun(draft, true, "Test (edytor — placeholder)", JSON.stringify({ name: draft.name }));
                  toast.success("Zapisano w dzienniku.");
                  setTestOpen(false);
                }}
              >
                Zapisz test w dzienniku
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}