import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
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
  stCard,
  stCardBody,
  stCardHead,
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

const MAIN_HEAD: Record<OrderUiMainGroup, string> = {
  NEW: "bg-emerald-50/90 text-emerald-950 ring-1 ring-emerald-200/60",
  IN_PROGRESS: "bg-sky-50/90 text-sky-950 ring-1 ring-sky-200/60",
  DONE: "bg-slate-100/90 text-slate-900 ring-1 ring-slate-200/70",
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
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="min-w-0">
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
              <label className="min-w-0 sm:col-span-1">
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
              <label className="min-w-0 sm:col-span-1">
                <span className={stFieldLabel}>Nazwa statusu</span>
                <input
                  value={editDraft.name ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                  className={stInput}
                  placeholder="np. Pilne"
                />
              </label>
            </div>
            <div>
              <span className={stFieldLabel}>Kolory</span>
              <div className="mt-1 flex flex-wrap items-end gap-4">
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
            <div>
              <span className={stFieldLabel}>Logo</span>
              <div className="mt-1 flex flex-wrap items-end gap-3">
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
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={editDraft.is_active !== false}
                onChange={(e) => setEditDraft((d) => ({ ...d, is_active: e.target.checked }))}
              />
              Aktywny
            </label>
            <label className="block max-w-[10rem]">
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
            <PanelStatusMiniPreview
              className="pt-1"
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
          <div className="flex flex-row gap-2 lg:flex-col lg:pt-6">
            <button type="button" className={stBtnGhost} onClick={cancelEdit}>
              Anuluj
            </button>
            <button type="button" className={stBtnPrimary} onClick={() => void saveEdit(r.id)}>
              Zapisz
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderPreviewRow = (mg: OrderUiMainGroup, r: OrderUiStatusWithCount, customs: OrderUiStatusWithCount[]) => {
    const isEdit = editingId === r.id;
    const isSystem = Boolean(r.is_system);
    const idxInCustom = customs.findIndex((s) => s.id === r.id);
    const canReorder = !isSystem && idxInCustom >= 0;
    if (isEdit) return <li key={r.id}>{renderEditorBlock(r, isSystem)}</li>;

    return (
      <li key={r.id} className={`border-b border-slate-100 last:border-0 ${r.is_active === false ? "opacity-55" : ""}`}>
        <div className="flex items-stretch gap-0 py-1.5 pl-1 pr-2 sm:py-2">
          <OrderUiStatusConfigRowPresent status={r} count={r.count} className="ml-1" />
          <div className="ml-1 flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              disabled={!canReorder || idxInCustom <= 0}
              className={stIconBtn}
              title="Wyżej"
              onClick={() => void moveSubstatus(mg, r, "up")}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canReorder || idxInCustom < 0 || idxInCustom >= customs.length - 1}
              className={stIconBtn}
              title="Niżej"
              onClick={() => void moveSubstatus(mg, r, "down")}
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button type="button" className={`${stIconBtn} px-2 text-xs font-medium`} onClick={() => startEdit(r)}>
              Edytuj
            </button>
            <button
              type="button"
              disabled={isSystem}
              className={`${stBtnDanger} h-8 px-2 text-xs`}
              title={isSystem ? "Status systemowy" : undefined}
              onClick={() => void onDelete(r.id)}
            >
              Usuń
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

      {tab === "statuses" ? (
        <div className="space-y-6 border-t border-slate-100 pt-6">
          <div className="max-w-4xl">
          <div className={stCard}>
            <div className={stCardHead}>
              <h2 className="text-sm font-semibold text-slate-800">Nowy status</h2>
            </div>
            <div className={`${stCardBody} space-y-3`}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="min-w-0">
                  <span className={stFieldLabel}>Grupa główna</span>
                  <select value={newMainGroup} onChange={(e) => setNewMainGroup(e.target.value as OrderUiMainGroup)} className={stSelect}>
                    {GROUP_ORDER.map((g) => (
                      <option key={g} value={g}>
                        {GROUP_LABELS[g]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="min-w-0">
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
                <label className="min-w-0">
                  <span className={stFieldLabel}>Nazwa statusu</span>
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} className={stInput} placeholder="np. Spakowane" />
                </label>
              </div>
              <div>
                <span className={stFieldLabel}>Kolory</span>
                <div className="mt-1 flex flex-wrap items-end gap-4">
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
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="rounded border-slate-300" checked={newActive} onChange={(e) => setNewActive(e.target.checked)} />
                  Aktywny
                </label>
                <label className="max-w-[10rem]">
                  <span className={stFieldLabel}>Kolejność</span>
                  <input type="number" className={stInput} value={newSort} onChange={(e) => setNewSort(Number(e.target.value))} />
                </label>
                <div className="ml-auto flex gap-2">
                  <button type="button" className={stBtnPrimary} disabled={creating || !newName.trim()} onClick={() => void onCreate()}>
                    Dodaj
                  </button>
                </div>
                </div>
              </div>
          </div>
          </div>

          <div className={stCard}>
            <div className={stCardHead}>
              <h2 className="text-sm font-semibold text-slate-800">Lista statusów</h2>
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
                        className={`flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold ${MAIN_HEAD[mg]}`}
                        onClick={() => toggle(mk)}
                      >
                        {isOpen(mk) ? <ChevronDown className="h-4 w-4 shrink-0 opacity-70" /> : <ChevronRight className="h-4 w-4 shrink-0 opacity-70" />}
                        <span className="min-w-0 truncate">{GROUP_LABELS[mg]}</span>
                        <span className="ml-auto text-xs font-normal opacity-80 tabular-nums">{subs.length}</span>
                      </button>
                      {isOpen(mk) ? (
                        <div className="border-t border-slate-100 px-2 pb-2 pt-1 sm:px-3">
                          {ungrouped.length ? (
                            <ul className="mb-3 ml-1 list-none border-l-2 border-transparent pl-1 sm:ml-2 sm:pl-2">
                              {ungrouped.map((row) => renderPreviewRow(mg, row, customs))}
                            </ul>
                          ) : null}
                          {subgroupBuckets.map((buck) => {
                            const sk = keySub(mg, encodeURIComponent(buck.subgroupKey));
                            return (
                              <div key={sk} className="mb-3 last:mb-0">
                                <button
                                  type="button"
                                  className="mt-1 flex w-full items-center gap-2 rounded-lg border border-slate-300/90 bg-gradient-to-b from-slate-50 to-slate-200/85 px-3 py-2 text-left shadow-sm ring-1 ring-slate-200/70 transition hover:from-white hover:to-slate-100 hover:shadow-md"
                                  onClick={() => toggle(sk)}
                                >
                                  {isOpen(sk) ? (
                                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
                                  )}
                                  <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-normal text-slate-900">
                                    {subgroupSectionTitle(buck.subgroupKey)}
                                  </span>
                                  <span className="shrink-0 rounded-full border border-slate-400/25 bg-slate-800/[0.07] px-2 py-0.5 text-xs font-bold tabular-nums text-slate-900">
                                    {buck.rows.reduce((a, r) => a + r.count, 0)}
                                  </span>
                                </button>
                                {isOpen(sk) ? (
                                  <ul className="ml-3 mt-1.5 list-none border-l-2 border-slate-200/90 pl-2.5 sm:ml-4 sm:pl-3">
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
