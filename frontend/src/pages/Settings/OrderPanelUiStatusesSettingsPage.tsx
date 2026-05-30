import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Edit2, Trash2, Plus } from "lucide-react";
import { Link } from "react-router-dom";

import {
  createOrderUiStatus,
  deleteOrderUiStatus,
  getOrderPanelSubgroups,
  getOrderUiStatusSummary,
  reorderOrderSubstatuses,
  updateOrderUiStatus,
  uploadOrderUiStatusImage,
} from "../../api/orderUiStatusApi";
import { CompactLabelColorPicker } from "../../components/label/CompactLabelColorPicker";
import { PanelStatusMiniPreview } from "../../components/settings/PanelStatusMiniPreview";
import { OrderUiStatusConfigRowPresent } from "../../components/orders/orderList/OrderUiStatusConfigRowPresent";
import {
  stBtnDanger,
  stBtnGhost,
  stBtnPrimary,
  stFieldLabel,
  stIconBtn,
  stInput,
  stSelect,
} from "../../components/settings/panelUiStatusSettingsStyles";
import { useWarehouse } from "../../context/WarehouseContext";
import { DEFAULT_PANEL_STATUS_HEX, isValidPanelStatusHex } from "../../components/panel/HexColorField";
import type { OrderUiMainGroup, OrderUiStatusRead, OrderUiStatusUpdatePayload, OrderUiStatusWithCount } from "../../types/orderUiStatus";
import PageLayout from "../../components/layout/PageLayout";
import { tabsNavItemClassName } from "../../components/layout/TabsNav";
import { OrderPanelSubgroupsManager } from "./OrderPanelSubgroupsManager";
import { partitionStatusesBySubgroupForSettings, subgroupSectionTitle } from "../../utils/panelUiStatusSettingsTree";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";

const GROUP_ORDER: OrderUiMainGroup[] = ["NEW", "IN_PROGRESS", "DONE"];

const GROUP_LABELS: Record<OrderUiMainGroup, string> = {
  NEW: "Nowe",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

// Zaktualizowane, nowoczesne style dla nagłówków głównych grup
const MAIN_HEAD: Record<OrderUiMainGroup, string> = {
  NEW: "bg-blue-50/50 text-blue-950 border-b border-blue-100",
  IN_PROGRESS: "bg-amber-50/50 text-amber-950 border-b border-amber-100",
  DONE: "bg-emerald-50/50 text-emerald-950 border-b border-emerald-100",
};

function keyMain(mg: OrderUiMainGroup): string {
  return `m:${mg}`;
}

function keySub(mg: OrderUiMainGroup, partKey: string): string {
  return `sg:${mg}:${partKey}`;
}

function defaultExpanded(): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const g of GROUP_ORDER) m[keyMain(g)] = true;
  return m;
}

/** Ustawienia → statusy zamówień (panel). */
export default function OrderPanelUiStatusesSettingsPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getOrderUiStatusSummary>> | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<Awaited<ReturnType<typeof getOrderPanelSubgroups>>>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(defaultExpanded);
  const [tab, setTab] = useState<"statuses" | "subgroups">("statuses");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMainGroup, setNewMainGroup] = useState<OrderUiMainGroup>("NEW");
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [newBadge, setNewBadge] = useState(DEFAULT_PANEL_STATUS_HEX);
  const [newBg, setNewBg] = useState(DEFAULT_PANEL_STATUS_HEX);
  const [newText, setNewText] = useState("#0f172a");
  const [newSort, setNewSort] = useState(0);
  const [newActive, setNewActive] = useState(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<OrderUiStatusUpdatePayload>({});
  /** Lokalny podgląd PNG przed odświeżeniem z serwera po uploadzie */
  const [editImageBlobUrl, setEditImageBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (editImageBlobUrl) URL.revokeObjectURL(editImageBlobUrl);
    };
  }, [editImageBlobUrl]);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setSummary(null);
      setPanelSubgroups([]);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const [data, sg] = await Promise.all([
        getOrderUiStatusSummary(DAMAGE_TENANT_ID, warehouseId, { includeInactive: true }),
        getOrderPanelSubgroups(DAMAGE_TENANT_ID, warehouseId),
      ]);
      setSummary(data);
      setPanelSubgroups(sg);
    } catch {
      setErr("Nie udało się wczytać statusów panelu.");
      setSummary(null);
      setPanelSubgroups([]);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const subgroupOptionsFor = useCallback(
    (mg: OrderUiMainGroup) =>
      panelSubgroups.filter((s) => s.main_group === mg).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pl")),
    [panelSubgroups],
  );

  const totalSubs = (summary?.groups ?? []).reduce((n, g) => n + g.sub_statuses.length, 0);

  const toggle = (key: string) => setExpanded((p) => ({ ...p, [key]: !(p[key] !== false) }));
  const isOpen = (key: string) => expanded[key] !== false;

  const startEdit = (r: OrderUiStatusRead) => {
    setEditImageBlobUrl(null);
    setEditingId(r.id);
    setEditDraft({
      name: r.name,
      color: r.color,
      sort_order: r.sort_order,
      main_group: r.main_group,
      subgroup_name: r.subgroup_name,
      sort_group: 0,
      sort_subgroup: 0,
      sort_status: r.sort_status ?? r.sort_order,
      badge_color: r.badge_color,
      background_color: r.background_color,
      text_color: r.text_color,
      is_active: r.is_active !== false,
    });
  };

  const cancelEdit = () => {
    setEditImageBlobUrl(null);
    setEditingId(null);
    setEditDraft({});
  };

  const validateColors = (d: OrderUiStatusUpdatePayload, baseHex: string): string | null => {
    const cols = [baseHex, d.badge_color, d.background_color, d.text_color];
    for (const c of cols) {
      if (c != null && String(c).trim() && !isValidPanelStatusHex(String(c))) return "Kolory: format #RRGGBB.";
    }
    return null;
  };

  const saveEdit = async (id: number) => {
    if (warehouseId == null) return;
    const badge = (editDraft.badge_color ?? editDraft.color ?? "").trim();
    const msg = validateColors(editDraft, badge || DEFAULT_PANEL_STATUS_HEX);
    if (msg) {
      setErr(msg);
      return;
    }
    try {
      const cur = summary?.groups.flatMap((b) => b.sub_statuses).find((s) => s.id === id);
      const payload: OrderUiStatusUpdatePayload = {
        name: editDraft.name,
        main_group: editDraft.main_group,
        group_name: null,
        subgroup_name: editDraft.subgroup_name != null ? (String(editDraft.subgroup_name).trim() || null) : undefined,
        color: badge.toLowerCase(),
        ...(editDraft.badge_color != null && String(editDraft.badge_color).trim()
          ? { badge_color: editDraft.badge_color.trim().toLowerCase() }
          : { badge_color: null }),
        ...(editDraft.background_color != null && String(editDraft.background_color).trim()
          ? { background_color: editDraft.background_color.trim().toLowerCase() }
          : { background_color: null }),
        ...(editDraft.text_color != null && String(editDraft.text_color).trim()
          ? { text_color: editDraft.text_color.trim().toLowerCase() }
          : { text_color: null }),
        is_active: editDraft.is_active,
        sort_status: editDraft.sort_status,
        sort_order: editDraft.sort_status ?? editDraft.sort_order,
        sort_group: 0,
        sort_subgroup: 0,
      };
      if (cur?.is_system) {
        delete payload.sort_order;
        delete payload.sort_group;
        delete payload.sort_subgroup;
        delete payload.sort_status;
      }
      await updateOrderUiStatus(id, DAMAGE_TENANT_ID, warehouseId, payload);
      cancelEdit();
      await load();
    } catch {
      setErr("Nie udało się zapisać zmian.");
    }
  };

  const onCreate = async () => {
    if (warehouseId == null) return;
    const name = newName.trim();
    if (!name) return;
    if (!isValidPanelStatusHex(newBadge) || !isValidPanelStatusHex(newBg) || !isValidPanelStatusHex(newText)) {
      setErr("Kolory: format #RRGGBB.");
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      await createOrderUiStatus(DAMAGE_TENANT_ID, warehouseId, {
        name,
        main_group: newMainGroup,
        group_name: null,
        color: newBadge.trim().toLowerCase(),
        sort_order: newSort,
        subgroup_name: newSubgroupName.trim() || null,
        sort_group: 0,
        sort_subgroup: 0,
        sort_status: newSort,
        badge_color: newBadge.trim().toLowerCase(),
        background_color: newBg.trim().toLowerCase(),
        text_color: newText.trim().toLowerCase(),
        is_active: newActive,
      });
      setNewName("");
      setNewSubgroupName("");
      setNewBadge(DEFAULT_PANEL_STATUS_HEX);
      setNewBg(DEFAULT_PANEL_STATUS_HEX);
      setNewText("#0f172a");
      setNewSort(0);
      setNewMainGroup("NEW");
      setNewActive(true);
      await load();
    } catch {
      setErr("Nie udało się utworzyć statusu (unikalna nazwa w grupie i magazynie).");
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: number) => {
    if (warehouseId == null) return;
    if (!window.confirm("Usunąć ten status? Powiązania z zamówieniami zostaną wyczyszczone.")) return;
    try {
      await deleteOrderUiStatus(id, DAMAGE_TENANT_ID, warehouseId);
      await load();
    } catch {
      setErr("Nie udało się usunąć statusu.");
    }
  };

  const moveSubstatus = useCallback(
    async (mainGroup: OrderUiMainGroup, r: OrderUiStatusWithCount, direction: "up" | "down") => {
      if (warehouseId == null || r.is_system) return;
      setErr(null);
      try {
        const data = await reorderOrderSubstatuses(DAMAGE_TENANT_ID, warehouseId, {
          main_group: mainGroup,
          status_id: r.id,
          direction,
        });
        setSummary(data);
      } catch {
        setErr("Nie udało się zmienić kolejności.");
      }
    },
    [warehouseId],
  );

  const onUploadImage = async (statusId: number, file: File | null) => {
    if (warehouseId == null || !file) return;
    setErr(null);
    setEditImageBlobUrl(URL.createObjectURL(file));
    try {
      await uploadOrderUiStatusImage(statusId, DAMAGE_TENANT_ID, warehouseId, file);
      setEditImageBlobUrl(null);
      await load();
    } catch {
      setErr("Nie udało się wgrać obrazka.");
    }
  };

  const onClearStatusImage = async (statusId: number) => {
    if (warehouseId == null) return;
    setErr(null);
    try {
      await updateOrderUiStatus(statusId, DAMAGE_TENANT_ID, warehouseId, { image_url: null });
      setEditImageBlobUrl(null);
      await load();
    } catch {
      setErr("Nie udało się usunąć logo.");
    }
  };

  useEffect(() => {
    setNewSubgroupName("");
  }, [newMainGroup]);

  // === EDYCJA STATUSU ===
  const renderEditorBlock = (r: OrderUiStatusWithCount, isSystem: boolean) => {
    const badge = editDraft.badge_color ?? editDraft.color ?? r.badge_color ?? r.color;
    const bg = editDraft.background_color ?? r.background_color ?? r.color;
    const tx = editDraft.text_color ?? r.text_color ?? "#0f172a";
    const mgEdit = (editDraft.main_group ?? r.main_group) as OrderUiMainGroup;
    const subOpts = subgroupOptionsFor(mgEdit);
    const subVal = (editDraft.subgroup_name ?? "").trim();
    const previewImg = editImageBlobUrl ?? r.image_url ?? null;
    const subLabel = subVal || null;

    return (
      <div className="bg-white m-3 rounded-xl shadow-sm border border-blue-200 overflow-hidden ring-1 ring-blue-500/10">
        <div className="px-6 py-4 border-b border-slate-100 bg-blue-50/30 flex justify-between items-center">
          <h3 className="font-semibold text-slate-800 text-sm">Edycja statusu: {r.name}</h3>
        </div>
        
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="space-y-4 col-span-2">
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1.5 min-w-0">
                  <span className={stFieldLabel}>Grupa główna</span>
                  <select
                    disabled={isSystem}
                    value={mgEdit}
                    onChange={(e) => {
                      const nextMg = e.target.value as OrderUiMainGroup;
                      setEditDraft((d) => {
                        const sn = (d.subgroup_name ?? "").trim();
                        const opts = subgroupOptionsFor(nextMg);
                        const stillOk = !sn || opts.some((x) => x.name === sn);
                        const nextSub = stillOk && sn ? sn : null;
                        return { ...d, main_group: nextMg, subgroup_name: nextSub };
                      });
                    }}
                    className={stSelect}
                  >
                    {GROUP_ORDER.map((og) => (
                      <option key={og} value={og}>
                        {GROUP_LABELS[og]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5 min-w-0">
                  <span className={stFieldLabel}>Podgrupa</span>
                  <select
                    value={subVal}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      setEditDraft((d) => ({ ...d, subgroup_name: v || null }));
                    }}
                    className={stSelect}
                  >
                    <option value="">Bez przypisania</option>
                    {subOpts.map((sg) => (
                      <option key={sg.id} value={sg.name}>
                        {sg.name}
                      </option>
                    ))}
                    {subVal && !subOpts.some((sg) => sg.name === subVal) ? (
                      <option value={subVal}>{subVal} (spoza słownika)</option>
                    ) : null}
                  </select>
                  {subOpts.length === 0 ? <p className="mt-1 text-[10px] text-slate-500">Brak podgrup — dodaj w zakładce „Podgrupy”.</p> : null}
                </label>
              </div>

              <label className="space-y-1.5 min-w-0 block">
                <span className={stFieldLabel}>Nazwa statusu</span>
                <input
                  value={editDraft.name ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                  className={stInput}
                  placeholder="np. Pilne"
                />
              </label>

              <div>
                <span className={stFieldLabel}>Logo</span>
                <div className="mt-2 flex flex-wrap items-end gap-3">
                  {previewImg ? (
                    <div className="flex flex-col items-start gap-1.5 rounded-md border border-slate-200 bg-white p-2">
                      <img src={previewImg} alt="" className="h-12 w-12 rounded object-contain" />
                      <div className="flex flex-wrap gap-2">
                        <label className="cursor-pointer rounded-md border border-slate-300 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100">
                          Zamień
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            onChange={(e) => void onUploadImage(r.id, e.target.files?.[0] ?? null)}
                          />
                        </label>
                        <button type="button" className={stBtnDanger} onClick={() => void onClearStatusImage(r.id)}>
                          Usuń
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer flex-col gap-1">
                      <span className="text-[10px] font-medium text-slate-500">Wgraj plik</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="max-w-[14rem] text-xs text-slate-600 file:mr-2 file:rounded file:border-0 file:bg-slate-200 file:px-2 file:py-1 file:text-xs file:font-medium"
                        onChange={(e) => void onUploadImage(r.id, e.target.files?.[0] ?? null)}
                      />
                    </label>
                  )}
                </div>
              </div>

            </div>

            <div className="space-y-4">
              <label className="space-y-1.5 block">
                <span className={stFieldLabel}>Kolejność</span>
                <input
                  type="number"
                  disabled={isSystem}
                  className={stInput}
                  value={editDraft.sort_status ?? editDraft.sort_order ?? 0}
                  onChange={(e) =>
                    setEditDraft((d) => ({
                      ...d,
                      sort_status: Number(e.target.value),
                      sort_order: Number(e.target.value),
                    }))
                  }
                />
              </label>
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  checked={editDraft.is_active !== false}
                  onChange={(e) => setEditDraft((d) => ({ ...d, is_active: e.target.checked }))}
                />
                <span className="text-sm font-medium text-slate-700 cursor-pointer">Aktywny (widoczny)</span>
              </div>
            </div>
          </div>

          <hr className="border-slate-100 my-6" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <span className={stFieldLabel}>Konfiguracja Kolorów</span>
              <div className="flex flex-wrap gap-4 mt-2">
                <label className="inline-flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-slate-500">Pasek</span>
                  <CompactLabelColorPicker
                    label="Kolor paska statusu"
                    value={badge}
                    onChange={(hex) => setEditDraft((d) => ({ ...d, badge_color: hex, color: hex }))}
                  />
                </label>
                <label className="inline-flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-slate-500">Tło</span>
                  <CompactLabelColorPicker
                    label="Kolor tła statusu"
                    value={bg}
                    onChange={(hex) => setEditDraft((d) => ({ ...d, background_color: hex }))}
                  />
                </label>
                <label className="inline-flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-slate-500">Tekst</span>
                  <CompactLabelColorPicker
                    label="Kolor tekstu statusu"
                    value={tx}
                    onChange={(hex) => setEditDraft((d) => ({ ...d, text_color: hex }))}
                  />
                </label>
              </div>
            </div>

            <PanelStatusMiniPreview
              name={(editDraft.name ?? r.name).trim() || "—"}
              count={r.count}
              badgeHex={badge}
              backgroundHex={bg}
              textHex={tx}
              imageUrl={previewImg}
              mainGroupLabel={GROUP_LABELS[mgEdit]}
              subgroupLabel={subLabel}
            />
          </div>
        </div>
        
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button type="button" className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors" onClick={cancelEdit}>
            Anuluj
          </button>
          <button type="button" className="px-5 py-2 text-sm font-bold text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors shadow-sm" onClick={() => void saveEdit(r.id)}>
            Zapisz zmiany
          </button>
        </div>
      </div>
    );
  };

  // === WERSJA WIDOKU LISTY ===
  const renderPreviewRow = (mg: OrderUiMainGroup, r: OrderUiStatusWithCount, customs: OrderUiStatusWithCount[]) => {
    const isEdit = editingId === r.id;
    const isSystem = Boolean(r.is_system);
    const idxInCustom = customs.findIndex((s) => s.id === r.id);
    const canReorder = !isSystem && idxInCustom >= 0;
    if (isEdit) return <li key={r.id}>{renderEditorBlock(r, isSystem)}</li>;

    return (
      <li key={r.id} className={`group border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0 ${r.is_active === false ? "opacity-55" : ""}`}>
        <div className="flex items-center justify-between py-2 pl-6 sm:pl-8 pr-4">
          <div className="flex-1 min-w-0">
            <OrderUiStatusConfigRowPresent status={r} count={r.count} className="ml-1" />
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              disabled={!canReorder || idxInCustom <= 0}
              className={`${stIconBtn} disabled:opacity-30`}
              title="Wyżej"
              onClick={() => void moveSubstatus(mg, r, "up")}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canReorder || idxInCustom < 0 || idxInCustom >= customs.length - 1}
              className={`${stIconBtn} disabled:opacity-30`}
              title="Niżej"
              onClick={() => void moveSubstatus(mg, r, "down")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edytuj" onClick={() => startEdit(r)}>
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={isSystem}
              className={`p-1.5 rounded ${isSystem ? 'text-slate-300' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
              title={isSystem ? "Status systemowy" : "Usuń"}
              onClick={() => void onDelete(r.id)}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </li>
    );
  };

  if (warehouseId == null) {
    return (
      <PageLayout fullBleed cardClassName="rounded-2xl shadow-sm space-y-0" className="p-3 md:p-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Wybierz magazyn w górnym pasku.
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout fullBleed cardClassName="rounded-2xl shadow-sm space-y-0" className="p-3 md:p-4">
    <div className="w-full space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link to="/settings/company" className="font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900">
            Ustawienia
          </Link>
          <span className="mx-1.5 text-slate-300">/</span>
          <span className="text-slate-700">Zamówienia</span>
        </p>
      </div>

      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{err}</div> : null}

      <nav className="flex gap-6 border-b border-slate-200" role="tablist" aria-label="Zakładki ustawień statusów zamówień">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "statuses"}
          className={tabsNavItemClassName(tab === "statuses")}
          onClick={() => setTab("statuses")}
        >
          Statusy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "subgroups"}
          className={tabsNavItemClassName(tab === "subgroups")}
          onClick={() => setTab("subgroups")}
        >
          Podgrupy
        </button>
      </nav>

      {tab === "subgroups" ? (
        <div className="border-t border-slate-100 pt-6">
          <OrderPanelSubgroupsManager warehouseId={warehouseId} onChanged={() => void load()} />
        </div>
      ) : null}

      {/* === KREATOR STATUSU === */}
      {tab === "statuses" ? (
        <div className="space-y-8 pt-4">
          
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-w-5xl">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="font-semibold text-slate-800">Kreator Statusu</h2>
              <span className="text-xs font-medium px-2 py-1 bg-blue-50 text-blue-600 rounded-md">Tryb dodawania</span>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="space-y-4 col-span-2">
                  <div className="grid grid-cols-2 gap-4">
                    <label className="space-y-1.5 min-w-0">
                      <span className={stFieldLabel}>Grupa główna</span>
                      <select value={newMainGroup} onChange={(e) => setNewMainGroup(e.target.value as OrderUiMainGroup)} className={stSelect}>
                        {GROUP_ORDER.map((g) => (
                          <option key={g} value={g}>
                            {GROUP_LABELS[g]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1.5 min-w-0">
                      <span className={stFieldLabel}>Podgrupa</span>
                      <select
                        value={newSubgroupName}
                        onChange={(e) => setNewSubgroupName(e.target.value)}
                        className={stSelect}
                      >
                        <option value="">Bez przypisania</option>
                        {subgroupOptionsFor(newMainGroup).map((sg) => (
                          <option key={sg.id} value={sg.name}>
                            {sg.name}
                          </option>
                        ))}
                      </select>
                      {subgroupOptionsFor(newMainGroup).length === 0 ? (
                        <p className="mt-1 text-[10px] text-slate-500">Brak podgrup — dodaj w zakładce „Podgrupy”.</p>
                      ) : null}
                    </label>
                  </div>

                  <label className="space-y-1.5 min-w-0 block">
                    <span className={stFieldLabel}>Nazwa statusu</span>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} className={stInput} placeholder="np. Spakowane" />
                  </label>
                </div>

                <div className="space-y-4">
                  <label className="space-y-1.5 block">
                    <span className={stFieldLabel}>Kolejność</span>
                    <input type="number" className={stInput} value={newSort} onChange={(e) => setNewSort(Number(e.target.value))} />
                  </label>
                  <div className="flex items-center gap-2 pt-2">
                    <input type="checkbox" className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" checked={newActive} onChange={(e) => setNewActive(e.target.checked)} />
                    <span className="text-sm font-medium text-slate-700 cursor-pointer">Aktywny (widoczny)</span>
                  </div>
                </div>
              </div>

              <hr className="border-slate-100 my-6" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <span className={stFieldLabel}>Konfiguracja Kolorów</span>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <label className="inline-flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-slate-500">Pasek</span>
                      <CompactLabelColorPicker label="Kolor paska statusu" value={newBadge} onChange={setNewBadge} />
                    </label>
                    <label className="inline-flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-slate-500">Tło</span>
                      <CompactLabelColorPicker label="Kolor tła statusu" value={newBg} onChange={setNewBg} />
                    </label>
                    <label className="inline-flex flex-col gap-1">
                      <span className="text-[10px] font-medium text-slate-500">Tekst</span>
                      <CompactLabelColorPicker label="Kolor tekstu statusu" value={newText} onChange={setNewText} />
                    </label>
                  </div>
                </div>

                <PanelStatusMiniPreview
                  name={newName.trim() || "—"}
                  badgeHex={newBadge}
                  backgroundHex={newBg}
                  textHex={newText}
                  mainGroupLabel={GROUP_LABELS[newMainGroup]}
                  subgroupLabel={newSubgroupName.trim() || null}
                />
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button type="button" className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-slate-800 rounded-lg hover:bg-slate-900 transition-colors shadow-sm disabled:opacity-50" disabled={creating || !newName.trim()} onClick={() => void onCreate()}>
                <Plus size={16} />
                Dodaj status
              </button>
            </div>
          </div>

          {/* === LISTA STATUSÓW === */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden max-w-5xl">
            <div className="px-6 py-4 border-b border-slate-100 bg-white flex justify-between items-center">
              <h2 className="font-semibold text-slate-800">Zarządzaj strukturą statusów</h2>
            </div>
            
            {loading ? (
              <p className="p-4 text-sm text-slate-500">Ładowanie…</p>
            ) : totalSubs === 0 ? (
              <p className="p-4 text-sm text-slate-600">Brak statusów — dodaj pierwszy powyżej.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {GROUP_ORDER.map((mg) => {
                  const block = summary?.groups.find((x) => x.main_group === mg);
                  const subs = block?.sub_statuses ?? [];
                  const { ungrouped, subgroupBuckets } = partitionStatusesBySubgroupForSettings(subs);
                  const customs = subs.filter((s) => !s.is_system);
                  const mk = keyMain(mg);
                  return (
                    <div key={mg} className="bg-white">
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold transition-colors ${MAIN_HEAD[mg]}`}
                        onClick={() => toggle(mk)}
                      >
                        {isOpen(mk) ? <ChevronDown className="h-4 w-4 shrink-0 opacity-70" /> : <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />}
                        <span className="min-w-0 truncate">{GROUP_LABELS[mg]}</span>
                        <span className="ml-auto bg-white/50 px-2 py-0.5 rounded-full text-xs font-bold tabular-nums">{subs.length}</span>
                      </button>
                      
                      {isOpen(mk) ? (
                        <div className="pb-2">
                          {ungrouped.length ? (
                            <ul className="list-none border-l-2 border-transparent">
                              {ungrouped.map((row) => renderPreviewRow(mg, row, customs))}
                            </ul>
                          ) : null}
                          
                          {subgroupBuckets.map((buck) => {
                            const sk = keySub(mg, encodeURIComponent(buck.subgroupKey));
                            return (
                              <div key={sk} className="mb-2 last:mb-0">
                                <button
                                  type="button"
                                  className="flex w-full items-center gap-2 px-4 py-2 opacity-80 hover:opacity-100 transition-opacity"
                                  onClick={() => toggle(sk)}
                                >
                                  {isOpen(sk) ? (
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                                  )}
                                  <div className="h-px bg-slate-200 flex-1"></div>
                                  <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                    {subgroupSectionTitle(buck.subgroupKey).replace(/[-]/g, '')}
                                  </span>
                                  <div className="h-px bg-slate-200 flex-1"></div>
                                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">
                                    {buck.rows.reduce((a, r) => a + r.count, 0)}
                                  </span>
                                </button>
                                
                                {isOpen(sk) ? (
                                  <ul className="list-none">
                                    {buck.rows.map((row) => renderPreviewRow(mg, row, customs))}
                                  </ul>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
    </PageLayout>
  );
}