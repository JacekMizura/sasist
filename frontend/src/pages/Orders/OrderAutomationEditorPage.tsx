import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ChevronDown, FlaskConical, Save, Trash2 } from "lucide-react";
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
} from "../../types/orderAutomation";
import { loadActionGroups, allocateRulePublicId, newUid, saveActionGroups } from "../../utils/orderAutomationLocalStore";
import { defaultExecution, migrateExecution, normalizeExecution } from "../../utils/orderAutomationExecution";
import {
  ORDER_AUTOMATION_CONDITION_FIELDS,
  buildConditionCategorySteps,
  buildEffectCategorySteps,
} from "../../utils/orderAutomationCatalog";
import { getOrderUiStatusSummary } from "../../api/orderUiStatusApi";
import type { OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import { AutomationExecutionSettingsSection } from "../../components/orders/automation/AutomationExecutionSettingsSection";
import { AutomationAnchorMenu, type AutomationAnchorMenuGroup } from "../../components/orders/automation/AutomationAnchorMenu";
import { AutomationCategoryPickerModal } from "../../components/orders/automation/AutomationCategoryPickerModal";
import { AutomationConditionEditModal } from "../../components/orders/automation/AutomationConditionEditModal";
import { AutomationEffectEditModal } from "../../components/orders/automation/AutomationEffectEditModal";
import { AutomationIfThenSection } from "../../components/orders/automation/AutomationIfThenSection";
import { moduleAutomationShellClass } from "../../components/layout/flatSectionTokens";
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
  oaInp,
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
    execution: defaultExecution(),
    stats: { lastRunAt: null, runCount: 0 },
    delayMinutes: 0,
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
  const execution = migrateExecution(
    r.execution && typeof r.execution === "object" ? r.execution : undefined,
    r.manualTrigger,
  );
  const stats =
    r.stats && typeof r.stats === "object"
      ? { lastRunAt: r.stats.lastRunAt ?? null, runCount: Number(r.stats.runCount) || 0 }
      : { ...def.stats };

  const executionNorm = normalizeExecution(execution);

  return {
    ...def,
    ...r,
    manualTrigger: { ...migrateManualTrigger(r.manualTrigger), enabled: !executionNorm.automatic },
    execution: executionNorm,
    conditions: conditions.map((c, i) => ({
      ...c,
      joinToNext: i < conditions.length - 1 ? (c.joinToNext ?? "and") : undefined,
    })),
    effects: effects.map(ensureEffectPayload),
    stats,
    delayMinutes: Math.max(0, Math.floor(Number(r.delayMinutes) || 0)),
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

  const [addCondPickerOpen, setAddCondPickerOpen] = useState(false);
  const [addEffPickerOpen, setAddEffPickerOpen] = useState(false);
  const [editCondUid, setEditCondUid] = useState<string | null>(null);
  const [editEffUid, setEditEffUid] = useState<string | null>(null);
  const groupMenuAnchorRef = useRef<HTMLElement | null>(null);

  const [groupMenuOpen, setGroupMenuOpen] = useState(false);

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

  const ops: AutomationConditionOp[] = ["eq", "neq", "contains"];

  const addCondition = (fieldKey: string) => {
    const def = ORDER_AUTOMATION_CONDITION_FIELDS.find((f) => f.key === fieldKey);
    const uid = newUid("c");
    const c: AutomationCondition = {
      uid,
      fieldKey,
      operator: def?.valueKind === "number" ? "eq" : "eq",
      value: "",
      joinToNext: "and",
    };
    setDraft((d) => normalizeRule({ ...d, conditions: [...d.conditions, c] }));
    setEditCondUid(uid);
  };

  const addEffect = (kind: AutomationEffectKind) => {
    const uid = newUid("e");
    const base: AutomationEffect = { uid, kind, payload: payloadForKind(kind) };
    setDraft((d) => ({ ...d, effects: [...d.effects, base] }));
    setEditEffUid(uid);
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

  const save = () => {
    setNameTouched(true);
    if (!draft.name.trim()) {
      toast.error("Podaj nazwę automatyzacji.");
      return;
    }
    let toSave = normalizeRule(draft);
    if ((typeof toSave.publicId !== "number" || toSave.publicId <= 0) && wid != null) {
      toSave = { ...toSave, publicId: allocateRulePublicId(DAMAGE_TENANT_ID, wid, scope) };
      setDraft(toSave);
    }
    upsertRule(toSave);
    toast.success("Zapisano.");
    if (isNew) navigate(`${baseList}/${draft.id}/edit`, { replace: true });
  };

  const nameInvalid = nameTouched && !draft.name.trim();

  const editingCondition = editCondUid ? draft.conditions.find((c) => c.uid === editCondUid) ?? null : null;
  const editingConditionIdx = editCondUid ? draft.conditions.findIndex((c) => c.uid === editCondUid) : -1;
  const editingEffect = editEffUid ? draft.effects.find((e) => e.uid === editEffUid) ?? null : null;

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
    <div className={`${moduleAutomationShellClass} min-w-0 pb-8 text-[13px] text-slate-900`}>
      <ModuleListBreadcrumb items={breadcrumbItems} />

      <div className="mb-4 mt-4 flex flex-wrap items-end justify-between gap-3">
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
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
          <div>
            <span className={oaLbl}>Grupa</span>
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
          <label className={`${oaLbl} flex h-9 items-center gap-2 pb-0.5`}>
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
              checked={draft.enabled}
              onChange={() => setDraft((d) => ({ ...d, enabled: !d.enabled }))}
            />
            Aktywna
          </label>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className={`${oaBtn} gap-2`} onClick={() => setTestOpen(true)}>
            <FlaskConical className="h-4 w-4" /> Test
          </button>
          <button type="button" className={`${oaBtnPri} gap-2`} onClick={save}>
            <Save className="h-4 w-4" /> Zapisz
          </button>
        </div>
      </div>
      {nameInvalid ? <span className="-mt-2 mb-3 block text-xs text-red-600">Nazwa jest wymagana</span> : null}

      <div className="w-full max-w-none space-y-6">
        <AutomationIfThenSection
          conditions={draft.conditions}
          effects={draft.effects}
          statusNameById={statusNameById}
          onAddCondition={() => setAddCondPickerOpen(true)}
          onAddEffect={() => setAddEffPickerOpen(true)}
          onEditCondition={setEditCondUid}
          onEditEffect={setEditEffUid}
          onDuplicateCondition={duplicateCondition}
          onRemoveCondition={(uid) =>
            setDraft((d) => normalizeRule({ ...d, conditions: d.conditions.filter((x) => x.uid !== uid) }))
          }
          onDuplicateEffect={duplicateEffect}
          onRemoveEffect={(uid) => setDraft((d) => ({ ...d, effects: d.effects.filter((x) => x.uid !== uid) }))}
        />

        <AutomationExecutionSettingsSection
          automatic={draft.execution.automatic}
          runMode={draft.execution.runMode}
          windowFrom={draft.execution.windowFrom}
          windowTo={draft.execution.windowTo}
          activeDays={draft.execution.activeDays}
          delayMinutes={draft.delayMinutes ?? 0}
          onChange={(patch) =>
            setDraft((d) => {
              const nextExecution = normalizeExecution({ ...d.execution, ...patch });
              return normalizeRule({
                ...d,
                delayMinutes: patch.delayMinutes ?? d.delayMinutes,
                execution: nextExecution,
              });
            })
          }
        />

        <IntegrationsApiPanel title="⋯ Historia zmian">
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
        </IntegrationsApiPanel>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
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
      </div>

      {/* MENU I POPOVERY */}
      <AutomationCategoryPickerModal
        open={addCondPickerOpen}
        title="Dodaj warunek"
        categories={conditionCategorySteps}
        onClose={() => setAddCondPickerOpen(false)}
        onPick={(id) => addCondition(id)}
      />
      <AutomationCategoryPickerModal
        open={addEffPickerOpen}
        title="Dodaj akcję"
        categories={effectCategorySteps}
        onClose={() => setAddEffPickerOpen(false)}
        onPick={(id) => addEffect(id as AutomationEffectKind)}
      />
      {wid != null && editingCondition ? (
        <AutomationConditionEditModal
          open={editCondUid !== null}
          condition={editingCondition}
          ops={ops}
          statusNameById={statusNameById}
          tenantId={DAMAGE_TENANT_ID}
          warehouseId={wid}
          showJoin={editingConditionIdx >= 0 && editingConditionIdx < draft.conditions.length - 1}
          joinToNext={editingCondition.joinToNext ?? "and"}
          onClose={() => setEditCondUid(null)}
          onPatch={(patch) =>
            setDraft((d) =>
              normalizeRule({
                ...d,
                conditions: d.conditions.map((x) => (x.uid === editingCondition.uid ? { ...x, ...patch } : x)),
              }),
            )
          }
          onSetJoin={(join) => setJoinToNext(editingCondition.uid, join)}
        />
      ) : null}
      {editingEffect ? (
        <AutomationEffectEditModal
          open={editEffUid !== null}
          effect={editingEffect}
          statusNameById={statusNameById}
          panelStatusOptions={panelStatusOptions}
          onClose={() => setEditEffUid(null)}
          onChangeKind={(kind) => patchEffectKind(editingEffect.uid, kind)}
          onPatchPayload={(partial) => patchEffectPayload(editingEffect.uid, partial)}
        />
      ) : null}
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