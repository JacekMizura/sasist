import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import {
  Activity,
  ArrowLeft,
  ArrowDown,
  Calendar,
  ChevronDown,
  Clock,
  Filter,
  MousePointerClick,
  PlayCircle,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
  Zap,
  GripVertical
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
  ORDER_AUTOMATION_EFFECT_KINDS,
  ORDER_AUTOMATION_OPERATOR_LABELS,
  conditionFieldLabel,
  effectKindLabel,
} from "../../utils/orderAutomationCatalog";
import {
  decodeScheduleCron,
  defaultScheduleSpec,
  defaultTimezone,
  encodeScheduleCron,
  normalizeScheduleRows,
  scheduleEnabledDayCount,
} from "../../utils/orderAutomationSchedule";
import { getManualIconComponent } from "@/modules/orders/automation/utils/orderAutomationManualIcons";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { AutomationIconGridPicker } from "../../components/orders/automation/AutomationIconGridPicker";
import { AutomationAnchorMenu, type AutomationAnchorMenuGroup } from "../../components/orders/automation/AutomationAnchorMenu";
import { WmsOrderedStatusPopover } from "../../components/orders/automation/WmsOrderedStatusPopover";
import {
  EFFECT_BUSINESS_SIDEBAR,
  renderAutomationEffectConfigEditor,
} from "../../components/orders/automation/effects/orderAutomationEffectEditorRenderers";
import { getStatusClass } from "../../components/orders/orderList/OrderListPanelStatusBadge";
import {
  oaBtn,
  oaBtnPri,
  oaBtnGhost,
  oaBtnDanger,
  oaInp,
  oaInpDense,
  oaLbl,
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
  const [logsOpen, setLogsOpen] = useState(true);

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

  const conditionFieldGroups: AutomationAnchorMenuGroup[] = useMemo(() => {
    const byCat = new Map<string, typeof ORDER_AUTOMATION_CONDITION_FIELDS>();
    for (const f of ORDER_AUTOMATION_CONDITION_FIELDS) {
      if (!byCat.has(f.category)) byCat.set(f.category, []);
      byCat.get(f.category)!.push(f);
    }
    return [...byCat.entries()].map(([title, items]) => ({
      title,
      id: title,
      items: items.map((it) => ({
        id: it.key,
        label: it.label,
        description: it.valueKind === "status" ? "Status panelu (WMS)" : undefined,
        keywords: it.category,
      })),
    }));
  }, []);

  const effectKindGroups: AutomationAnchorMenuGroup[] = useMemo(
    () => [
      {
        id: "fx",
        title: "Efekty",
        items: ORDER_AUTOMATION_EFFECT_KINDS.map((k) => ({
          id: k.kind,
          label: k.label,
          description: k.category,
        })),
      },
    ],
    []
  );

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
    <div className="min-w-0 pb-28 text-[13px] text-slate-900 antialiased font-sans w-full bg-white">
      
      {/* NAGŁÓWEK */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-4 md:px-8">
        <div className="flex items-center gap-4">
          <Link 
            to={baseList} 
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Wróć
          </Link>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            {isNew ? "Nowa akcja automatyczna" : "Edycja akcji automatycznej"}
          </h1>
        </div>
        
        <div className="flex items-center gap-3">
           {!isNew ? (
            <button
              type="button"
              className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-2 shadow-sm"
              onClick={() => {
                if (!window.confirm("Usunąć tę automatyzację?")) return;
                deleteRule(draft.id);
                toast.success("Usunięto.");
                navigate(baseList);
              }}
            >
              <Trash2 className="h-4 w-4" strokeWidth={2} /> Usuń
            </button>
          ) : null}
          <button type="button" className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors shadow-sm" onClick={() => setTestOpen(true)}>
            Test
          </button>
        </div>
      </div>

      <div className="space-y-6 px-4 md:px-8">
        
        {/* USTAWIENIA PODSTAWOWE (Karta na 100% szerokości) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              <div className="lg:col-span-7">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nazwa akcji</label>
                <input
                  type="text"
                  className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${nameInvalid ? "border-red-400 bg-red-50" : "border-gray-300 bg-white shadow-sm"}`}
                  value={draft.name}
                  placeholder="np. Zmiana statusu po opłaceniu"
                  onBlur={() => setNameTouched(true)}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
                {nameInvalid && <span className="text-xs text-red-500 mt-1 block">Pole wymagane</span>}
              </div>
              
              <div className="lg:col-span-3">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Grupa akcji</label>
                <button
                  type="button"
                  className="w-full px-3 py-2 bg-white shadow-sm border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center justify-between"
                  onClick={(e) => {
                    groupMenuAnchorRef.current = e.currentTarget;
                    setGroupMenuOpen(true);
                  }}
                >
                  <span className="truncate text-gray-700">{draft.group || "—"}</span>
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              <div className="lg:col-span-2 flex items-center justify-end gap-3 mt-1 lg:mt-6">
                <span className="text-sm font-medium text-gray-600">Aktywna:</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer" 
                    checked={draft.enabled}
                    onChange={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

            </div>
          </div>
        </div>

        {/* WYZWALACZE */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200 bg-blue-50/40">
            <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Zap className="text-blue-600 w-5 h-5 fill-current" /> Wyzwalacze
            </h3>

            <div className="flex flex-wrap gap-3 mb-5">
              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                  draft.execution.onOrderCreated ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
                onClick={() => setDraft((d) => ({ ...d, execution: { ...d.execution, onOrderCreated: !d.execution.onOrderCreated } }))}
              >
                <Activity className="w-4 h-4" /> Po utworzeniu
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                  draft.execution.onStatusChanged ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
                onClick={() => setDraft((d) => ({ ...d, execution: { ...d.execution, onStatusChanged: !d.execution.onStatusChanged } }))}
              >
                <Activity className="w-4 h-4" /> Zmiana statusu
              </button>
              <button
                type="button"
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors border ${
                  draft.execution.onSchedule ? "bg-blue-100 text-blue-800 border-blue-200" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
                onClick={() =>
                  setDraft((d) => {
                    const on = !d.execution.onSchedule;
                    let cron = d.execution.scheduleCron;
                    if (on && !decodeScheduleCron(cron)) cron = encodeScheduleCron(defaultScheduleSpec());
                    return { ...d, execution: { ...d.execution, onSchedule: on, scheduleCron: cron } };
                  })
                }
              >
                <Calendar className="w-4 h-4" /> Według harmonogramu
              </button>
            </div>

            {draft.execution.onSchedule && (
              <div className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm mb-5 overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-600">
                  <thead className="text-xs text-gray-500 uppercase bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2">Dzień</th>
                      <th className="px-4 py-2 text-center">Aktywny</th>
                      <th className="px-4 py-2">Godzina</th>
                      <th className="px-4 py-2">Powtarzanie</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OA_DAY_ROWS.map(({ day, label }) => {
                      const row =
                        scheduleSpec.rows.find((sch) => sch.day === day) ??
                        ({ day, enabled: false, hour: 8, minute: 0, repeatEveryMin: null } as const);
                      const tVal = `${String(row.hour).padStart(2, "0")}:${String(row.minute).padStart(2, "0")}`;
                      return (
                        <tr key={day} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-2 font-medium">{label}</td>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={row.enabled}
                              onChange={(ev) => bumpSchedule((s) => ({ ...s, rows: s.rows.map((r) => (r.day === day ? { ...r, enabled: ev.target.checked } : r)) }))}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="time"
                              className="px-2 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
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
                          <td className="px-4 py-2 flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              placeholder="—"
                              className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50"
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
                            <span className="text-xs text-gray-400">min</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <details className="group bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
              <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-800 bg-gray-50 hover:bg-gray-100 transition-colors list-none [&::-webkit-details-marker]:hidden">
                <MousePointerClick className="w-4 h-4 text-gray-500" /> Przycisk
                <ChevronDown className="w-4 h-4 text-gray-400 ml-auto group-open:rotate-180 transition-transform" />
              </summary>
              <div className="p-4 border-t border-gray-100 space-y-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    checked={draft.manualTrigger.enabled}
                    onChange={() => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, enabled: !d.manualTrigger.enabled } }))}
                  />
                  Pokaż jako przycisk akcji na ekranie zamówienia
                </label>
                
                {draft.manualTrigger.enabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pl-6">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Nazwa przycisku</label>
                      <input
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500"
                        value={draft.manualTrigger.label}
                        onChange={(e) => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, label: e.target.value } }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Kolor</label>
                      <input
                        type="color"
                        className="h-9 w-full rounded-md cursor-pointer border border-gray-300 p-0.5"
                        value={draft.manualTrigger.color?.startsWith("#") ? draft.manualTrigger.color : "#0f172a"}
                        onChange={(e) => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, color: e.target.value } }))}
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-4">
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Ikona</label>
                        <button
                          type="button"
                          className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md text-sm flex items-center justify-between"
                          onClick={(e) => {
                            iconPickerAnchorRef.current = e.currentTarget;
                            setIconPickerOpen(true);
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {(() => {
                              const Icon = getManualIconComponent(draft.manualTrigger.iconKey);
                              return <Icon className="h-4 w-4 text-gray-600" />;
                            })()}
                            {draft.manualTrigger.iconKey}
                          </span>
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Skrót klawiszowy (opcja)</label>
                        <input
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          placeholder="np. Ctrl+P"
                          value={draft.manualTrigger.shortcut}
                          onChange={(e) => setDraft((d) => ({ ...d, manualTrigger: { ...d.manualTrigger, shortcut: e.target.value } }))}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        </div>

        {/* PODZIAŁ NA KOLUMNY (Warunki i Akcje) */}
        <div className="flex flex-col lg:flex-row min-h-[400px] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          
          {/* LEWA KOLUMNA: WARUNKI */}
          <div className="flex-1 p-6 border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-50/50">
            <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Filter className="text-gray-500 w-5 h-5 fill-current" /> Spełnione są warunki
            </h3>
            
            <div className="space-y-4">
              {draft.conditions.map((c, idx) => {
                const meta = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === c.fieldKey);
                const stName = c.fieldKey === "order_status" && c.value && statusNameById.has(Number(c.value)) ? statusNameById.get(Number(c.value))! : null;
                const join = c.joinToNext ?? "and";
                const isLast = idx >= draft.conditions.length - 1;

                return (
                  <div key={c.uid} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm relative group">
                    <div className="flex justify-between items-center mb-3">
                      <div className="flex items-center gap-2 text-gray-500">
                        <GripVertical className="w-5 h-5 cursor-grab hover:text-gray-700" />
                        <span className="text-xs font-bold bg-gray-100 px-2 py-1 rounded">WARUNEK {idx + 1}</span>
                      </div>
                      <button 
                        type="button" 
                        className="text-gray-400 hover:text-red-500 transition-colors" 
                        onClick={() => setDraft((d) => normalizeRule({ ...d, conditions: d.conditions.filter((x) => x.uid !== c.uid) }))}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    
                    <div className="flex flex-col xl:flex-row gap-2">
                      <button
                        type="button"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 bg-gray-50 text-left flex justify-between items-center"
                        onClick={(e) => {
                          condFieldAnchorRef.current = e.currentTarget;
                          setOpenConditionFieldFor(c.uid);
                        }}
                      >
                        <span className="truncate">{conditionFieldLabel(c.fieldKey)}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                      </button>
                      
                      <select
                        className="xl:w-32 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-600 font-medium bg-gray-50 focus:ring-blue-500 focus:border-blue-500"
                        value={c.operator}
                        onChange={(e) => setDraft((d) => normalizeRule({ ...d, conditions: d.conditions.map((x) => x.uid === c.uid ? { ...x, operator: e.target.value as AutomationConditionOp } : x) }))}
                      >
                        {ops.map((op) => (
                          <option key={op} value={op}>{ORDER_AUTOMATION_OPERATOR_LABELS[op] ?? op}</option>
                        ))}
                      </select>
                      
                      <div className="flex-1 min-w-0">
                        {meta?.valueKind === "status" ? (
                          <button
                            type="button"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-left flex items-center justify-between bg-white font-medium text-blue-700"
                            onClick={(e) => openStatus(e.currentTarget, { mode: "cond", uid: c.uid })}
                          >
                            {stName ? <span className="truncate">{stName}</span> : <span className="text-gray-400 font-normal">Wybierz status...</span>}
                          </button>
                        ) : (
                          <input
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 font-medium"
                            value={c.value}
                            placeholder="Wpisz wartość..."
                            onChange={(e) => setDraft((d) => normalizeRule({ ...d, conditions: d.conditions.map((x) => x.uid === c.uid ? { ...x, value: e.target.value } : x) }))}
                          />
                        )}
                      </div>
                    </div>
                    
                    {!isLast && (
                      <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 z-10">
                        <select
                          className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 outline-none text-center cursor-pointer appearance-none"
                          value={join}
                          onChange={(e) => setJoinToNext(c.uid, e.target.value as AutomationConditionJoin)}
                        >
                          <option value="and">ORAZ</option>
                          <option value="or">LUB</option>
                        </select>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className={`w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-sm font-medium text-gray-500 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 flex items-center justify-center gap-2 transition-all ${draft.conditions.length > 0 ? "mt-8" : "mt-0"}`}
              ref={condAddRef}
              onClick={() => setCondMenuOpen(true)}
            >
              <Plus className="w-4 h-4" /> Dodaj warunek
            </button>
          </div>

          {/* PRAWA KOLUMNA: AKCJE */}
          <div className="flex-1 bg-green-50/30 p-6">
            <h3 className="text-sm font-bold text-green-700 uppercase tracking-wider mb-4 flex items-center gap-2">
              <PlayCircle className="text-green-600 w-5 h-5 fill-current" /> Wykonaj akcje
            </h3>

            <div className="space-y-4">
              {draft.effects.map((e, eidx) => {
                const meta = EFFECT_BUSINESS_SIDEBAR[e.kind as AutomationEffectKind] ?? EFFECT_BUSINESS_SIDEBAR.wms_action;
                const Icon = meta.Icon;
                const isLast = eidx >= draft.effects.length - 1;

                return (
                  <div key={e.uid} className="relative">
                    <div className="bg-white p-4 rounded-lg border border-green-200 shadow-sm relative group">
                      <div className="flex justify-between items-center mb-3">
                        <div className="flex items-center gap-2 text-green-700">
                          <GripVertical className="w-5 h-5 cursor-grab text-gray-400 hover:text-gray-700" />
                          <span className="text-xs font-bold bg-green-100 px-2 py-1 rounded text-green-800">AKCJA {eidx + 1}</span>
                        </div>
                        <button 
                          type="button" 
                          className="text-gray-400 hover:text-red-500 transition-colors"
                          onClick={() => setDraft((d) => ({ ...d, effects: d.effects.filter((x) => x.uid !== e.uid) }))}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="flex flex-col lg:flex-row gap-3">
                        <button
                          type="button"
                          className="lg:w-48 px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm flex items-center gap-2 hover:bg-white transition-colors text-left"
                          onClick={(ev) => {
                            effectKindAnchorRef.current = ev.currentTarget;
                            setOpenEffectKindFor(e.uid);
                          }}
                        >
                          <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                          <span className="truncate font-semibold text-gray-700">{meta.title}</span>
                        </button>
                        
                        <div className="flex-1 min-w-0 border-l-2 border-green-100 pl-3">
                          {renderAutomationEffectConfigEditor({
                            kind: e.kind,
                            effect: e,
                            statusOptions: panelStatusOptions,
                            patchPayload: (partial) => patchEffectPayload(e.uid, partial),
                          })}
                        </div>
                      </div>
                    </div>
                    
                    {!isLast && (
                      <div className="flex justify-center py-2 absolute -bottom-5 left-1/2 -translate-x-1/2 z-10 bg-green-50/30 rounded-full w-8 h-8">
                        <ArrowDown className="w-5 h-5 text-green-400 mt-1.5" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className={`w-full py-3 border-2 border-dashed border-green-300 rounded-lg text-sm font-medium text-green-600 hover:text-green-800 hover:border-green-500 hover:bg-green-100 flex items-center justify-center gap-2 transition-all ${draft.effects.length > 0 ? "mt-8" : "mt-0"}`}
              ref={effAddRef}
              onClick={() => setEffMenuOpen(true)}
            >
              <Plus className="w-4 h-4" /> Dodaj akcję
            </button>
          </div>
        </div>

        {/* LOGI CZYNNOŚCI */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm mb-8">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 p-4 text-left transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
            onClick={() => setLogsOpen((v) => !v)}
            aria-expanded={logsOpen}
          >
            <div className="flex items-center gap-2 text-gray-900">
              <Clock className="h-5 w-5 text-gray-500" strokeWidth={2} aria-hidden />
              <span className="text-base font-semibold">Historia zmian (logi)</span>
            </div>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-gray-500 transition-transform ${logsOpen ? "rotate-180" : ""}`}
              strokeWidth={2}
              aria-hidden
            />
          </button>
          {logsOpen ? (
            <div className="border-t border-gray-100 px-4 pb-4">
              <div className="overflow-x-auto mt-2">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-3 py-3">Data i godzina</th>
                      <th className="px-3 py-3">Użytkownik</th>
                      <th className="px-3 py-3">Zdarzenie / zmiana</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {LOG_ROWS.map((row) => (
                      <tr key={row.when} className="transition hover:bg-gray-50/80">
                        <td className="whitespace-nowrap px-3 py-3 font-medium text-gray-900">{row.when}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-200 to-gray-300 text-xs font-bold text-gray-700 ring-1 ring-gray-300/80"
                              aria-hidden
                            >
                              {row.initials}
                            </span>
                            <span>{row.user}</span>
                          </div>
                        </td>
                        <td className="max-w-md px-3 py-3 text-gray-600">{row.event}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>

      </div>

      {/* MENU I POPOVERY */}
      <AutomationAnchorMenu
        open={condMenuOpen}
        anchorRef={condAddRef}
        title="Nowy warunek"
        groups={conditionFieldGroups}
        onClose={() => setCondMenuOpen(false)}
        onPick={(id) => addCondition(id)}
      />
      <AutomationAnchorMenu
        open={effMenuOpen}
        anchorRef={effAddRef}
        title="Rodzaj efektu"
        groups={effectKindGroups}
        onClose={() => setEffMenuOpen(false)}
        onPick={(id) => addEffect(id as AutomationEffectKind)}
      />
      <AutomationAnchorMenu
        open={openConditionFieldFor !== null}
        anchorRef={condFieldAnchorRef}
        title="Wybierz pole"
        groups={conditionFieldGroups}
        onClose={() => setOpenConditionFieldFor(null)}
        onPick={(id) => {
          const uid = openConditionFieldFor;
          if (uid) {
            setDraft((d) => normalizeRule({ ...d, conditions: d.conditions.map((x) => (x.uid === uid ? { ...x, fieldKey: id, value: "" } : x)) }));
          }
          setOpenConditionFieldFor(null);
        }}
      />
      <AutomationAnchorMenu
        open={openEffectKindFor !== null}
        anchorRef={effectKindAnchorRef}
        title="Rodzaj efektu"
        groups={effectKindGroups}
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

      {/* STICKY FOOTER */}
      <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white p-4 shadow-[0_-4px_24px_rgba(0,0,0,0.06)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 md:px-8">
          <p className="hidden text-sm text-gray-500 sm:block">Zapisz konfigurację po wprowadzeniu zmian.</p>
          <div className="flex justify-end gap-2 sm:ml-auto">
            <button
              type="button"
              className="px-5 py-2.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors w-full sm:w-auto"
              onClick={() => navigate(baseList)}
            >
              Anuluj
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 w-full sm:w-auto"
              onClick={save}
            >
              <Save className="h-5 w-5" strokeWidth={2} aria-hidden />
              Zapisz akcję
            </button>
          </div>
        </div>
      </footer>

      {/* MODAL TESTOWY */}
      {testOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" role="dialog" aria-modal>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/10">
            <h2 className="text-lg font-bold text-slate-900">Test akcji</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Symulacja uruchomienia akcji automatycznej. Wygeneruje ona zapis w dzienniku testów.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" className="px-4 py-2 rounded border border-gray-300 text-sm font-medium" onClick={() => setTestOpen(false)}>
                Zamknij
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-bold shadow-sm"
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