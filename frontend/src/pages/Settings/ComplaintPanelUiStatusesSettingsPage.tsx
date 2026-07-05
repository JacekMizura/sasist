import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  createComplaintUiStatus,
  deleteComplaintUiStatus,
  getComplaintUiStatusSummary,
  updateComplaintUiStatus,
} from "../../api/complaintUiStatusApi";
import { useWarehouse } from "../../context/WarehouseContext";
import { HexColorField, DEFAULT_PANEL_STATUS_HEX, isValidPanelStatusHex } from "../../components/panel/HexColorField";
import { PanelStatusConfiguratorAside } from "../../components/settings/PanelStatusConfiguratorAside";
import { usePanelStatusCounterColor } from "../../hooks/usePanelStatusCounterColor";
import type {
  ComplaintUiMainGroup,
  ComplaintUiStatusRead,
  ComplaintUiStatusUpdatePayload,
} from "../../types/complaintUiStatus";
import { panelStatusChipStyle } from "../../utils/panelStatusColor";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import PageLayout from "../../components/layout/PageLayout";
import { DocumentTemplateScopeSection } from "../Settings/document-templates/components/DocumentTemplateScopeSection";
import { COMPLAINTS_SCOPE_KINDS } from "../Settings/document-templates/documentTemplateScopeKinds";

const GROUP_ORDER: ComplaintUiMainGroup[] = ["NEW", "IN_PROGRESS", "DONE"];

const GROUP_LABELS: Record<ComplaintUiMainGroup, string> = {
  NEW: "Nowe reklamacje",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

const SECTION_HEAD: Record<ComplaintUiMainGroup, string> = {
  NEW: "border-l-4 border-green-500 bg-green-50 px-3 py-2 text-sm font-bold text-green-900",
  IN_PROGRESS: "border-l-4 border-blue-500 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-950",
  DONE: "border-l-4 border-gray-400 bg-gray-100 px-3 py-2 text-sm font-bold text-gray-800",
};

/** Settings → Complaints: panel sub-statuses (tenant-wide); counts shown for selected warehouse. */
export default function ComplaintPanelUiStatusesSettingsPage() {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;

  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getComplaintUiStatusSummary>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(DEFAULT_PANEL_STATUS_HEX);
  const [newMainGroup, setNewMainGroup] = useState<ComplaintUiMainGroup>("NEW");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ComplaintUiStatusUpdatePayload>({});
  const [newCounterColor, setNewCounterColor] = useState<string | null>(null);
  const { counterColor: editCounterColor, setCounterColor: setEditCounterColor, persistForStatusId } =
    usePanelStatusCounterColor("complaints", DAMAGE_TENANT_ID, warehouseId, editingId);

  const load = useCallback(async () => {
    if (warehouseId == null) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const data = await getComplaintUiStatusSummary(DAMAGE_TENANT_ID, warehouseId);
      setSummary(data);
    } catch {
      setErr("Nie udało się wczytać statusów panelu.");
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [warehouseId]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalSubs = (summary?.groups ?? []).reduce((n, g) => n + g.sub_statuses.length, 0);

  const startEdit = (r: ComplaintUiStatusRead) => {
    setEditingId(r.id);
    setEditDraft({
      name: r.name,
      color: r.color,
      sort_order: r.sort_order,
      main_group: r.main_group,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };

  const saveEdit = async (id: number) => {
    if (editDraft.color != null && !isValidPanelStatusHex(editDraft.color)) {
      setErr("Kolor musi być w formacie #RRGGBB.");
      return;
    }
    try {
      const payload = {
        ...editDraft,
        ...(editDraft.color != null ? { color: editDraft.color.trim().toLowerCase() } : {}),
      };
      await updateComplaintUiStatus(id, DAMAGE_TENANT_ID, payload);
      cancelEdit();
      await load();
    } catch {
      setErr("Nie udało się zapisać zmian.");
    }
  };

  const onCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!isValidPanelStatusHex(newColor)) {
      setErr("Kolor musi być w formacie #RRGGBB (np. #3b82f6).");
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const created = await createComplaintUiStatus(DAMAGE_TENANT_ID, {
        name,
        main_group: newMainGroup,
        color: newColor.trim().toLowerCase(),
        sort_order: 0,
      });
      if (newCounterColor && warehouseId != null) persistForStatusId(created.id, newCounterColor);
      setNewName("");
      setNewColor(DEFAULT_PANEL_STATUS_HEX);
      setNewMainGroup("NEW");
      setNewCounterColor(null);
      await load();
    } catch {
      setErr("Nie udało się utworzyć statusu (unikalna nazwa w grupie dla podmiotu).");
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: number) => {
    if (!window.confirm("Usunąć ten podstatus? Powiązania z reklamacjami w panelu zostaną wyczyszczone.")) return;
    try {
      await deleteComplaintUiStatus(id, DAMAGE_TENANT_ID);
      await load();
    } catch {
      setErr("Nie udało się usunąć statusu.");
    }
  };

  if (warehouseId == null) {
    return (
      <PageLayout fullBleed cardClassName="rounded-2xl shadow-sm space-y-0" className="p-3 md:p-4">
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Wybierz magazyn w górnym pasku (liczniki dotyczą reklamacji w tym magazynie).
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout fullBleed cardClassName="rounded-2xl shadow-sm space-y-0" className="p-3 md:p-4">
    <div className="w-full space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          <Link to="/settings/company" className="font-medium text-blue-700 hover:underline">
            Ustawienia
          </Link>
          <span className="mx-1">/</span>
          <span className="text-gray-700">Reklamacje</span>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Statusy panelu (reklamacje)</h1>
        <p className="mt-2 text-sm text-gray-600">
          Podstatusy są wspólne dla <strong>podmiotu</strong>; liczniki obok — dla <strong>wybranego magazynu</strong>. Grupy{" "}
          <strong>Nowe reklamacje / W toku / Zakończone</strong> są stałe. Kolor: <strong>#RRGGBB</strong>.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <DocumentTemplateScopeSection
          tenantId={DAMAGE_TENANT_ID}
          scopeType="COMPLAINTS"
          scopeId={DAMAGE_TENANT_ID}
          title="Szablony dokumentów reklamacji"
          kinds={COMPLAINTS_SCOPE_KINDS}
        />
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      )}

      <div className="border-t border-slate-100 pt-6">
      <div className="max-w-4xl">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">Nowy podstatus</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block w-full min-w-[10rem] sm:w-44 text-sm">
            <span className="text-gray-600">Grupa główna</span>
            <select
              value={newMainGroup}
              onChange={(e) => setNewMainGroup(e.target.value as ComplaintUiMainGroup)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              {GROUP_ORDER.map((g) => (
                <option key={g} value={g}>
                  {GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[12rem] flex-1 text-sm">
            <span className="text-gray-600">Nazwa</span>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              placeholder="np. Eskalacja"
            />
          </label>
          <div className="block w-full min-w-[12rem] sm:w-auto text-sm">
            <span className="text-gray-600">Kolor (#RRGGBB)</span>
            <div className="mt-1">
              <HexColorField value={newColor} onChange={setNewColor} id="new-complaint-ui-color" />
            </div>
          </div>
          <button
            type="button"
            disabled={creating || !newName.trim()}
            onClick={() => void onCreate()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
          >
            Dodaj
          </button>
        </div>
        <div className="mt-6 border-t border-gray-100 pt-4">
          <PanelStatusConfiguratorAside
            preview={{
              name: newName.trim() || "—",
              count: 4,
              mainGroup: newMainGroup,
              mainGroupLabel: GROUP_LABELS[newMainGroup],
              badgeHex: newColor,
              backgroundHex: newColor,
              textHex: "#0f172a",
              active: true,
            }}
            summary={summary}
            mainGroupLabels={GROUP_LABELS}
            mainGroupOrder={GROUP_ORDER}
            highlightDraft={{ name: newName, main_group: newMainGroup }}
            counterColorHex={newCounterColor}
            onCounterColorChange={setNewCounterColor}
          />
        </div>
      </div>
      </div>
      </div>

      <div className="border-t border-slate-100 pt-6">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Podstatusy według grup</h2>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-gray-500">Ładowanie…</p>
        ) : totalSubs === 0 ? (
          <p className="p-4 text-sm text-gray-600">Brak podstatusów — pierwsze wejście na listę reklamacji utworzy domyślne lub dodaj powyżej.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {GROUP_ORDER.map((g) => {
              const block = summary?.groups.find((x) => x.main_group === g);
              const subs = block?.sub_statuses ?? [];
              return (
                <div key={g}>
                  <div className={SECTION_HEAD[g]}>{GROUP_LABELS[g]}</div>
                  {subs.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-500">Brak podstatusów w tej grupie.</p>
                  ) : (
                    <ul className="divide-y divide-gray-50">
                      {subs.map((r) => {
                        const isEdit = editingId === r.id;
                        const displayColor = isEdit ? (editDraft.color ?? r.color) : r.color;
                        return (
                          <li
                            key={r.id}
                            className="flex flex-col gap-3 px-4 py-4 pl-8 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1">
                              {isEdit ? (
                                <>
                                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                                    <select
                                      value={editDraft.main_group ?? r.main_group}
                                      onChange={(e) =>
                                        setEditDraft((d) => ({
                                          ...d,
                                          main_group: e.target.value as ComplaintUiMainGroup,
                                        }))
                                      }
                                      className="w-full max-w-xs rounded border border-gray-200 px-2 py-1 text-sm"
                                    >
                                      {GROUP_ORDER.map((og) => (
                                        <option key={og} value={og}>
                                          {GROUP_LABELS[og]}
                                        </option>
                                      ))}
                                    </select>
                                    <input
                                      type="text"
                                      value={editDraft.name ?? ""}
                                      onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                                      className="w-full max-w-xs rounded border border-gray-200 px-2 py-1 text-sm"
                                    />
                                    <HexColorField
                                      value={editDraft.color ?? r.color}
                                      onChange={(hex) => setEditDraft((d) => ({ ...d, color: hex }))}
                                    />
                                    <input
                                      type="number"
                                      value={editDraft.sort_order ?? 0}
                                      onChange={(e) =>
                                        setEditDraft((d) => ({ ...d, sort_order: Number(e.target.value) }))
                                      }
                                      className="w-24 rounded border border-gray-200 px-2 py-1 text-sm"
                                      title="Kolejność sortowania"
                                    />
                                  </div>
                                  <div className="mt-4 max-w-sm">
                                    <PanelStatusConfiguratorAside
                                      preview={{
                                        name: (editDraft.name ?? r.name).trim() || "—",
                                        count: r.count,
                                        mainGroup: (editDraft.main_group ?? r.main_group) as ComplaintUiMainGroup,
                                        mainGroupLabel: GROUP_LABELS[(editDraft.main_group ?? r.main_group) as ComplaintUiMainGroup],
                                        badgeHex: displayColor,
                                        backgroundHex: displayColor,
                                        textHex: "#0f172a",
                                        active: true,
                                      }}
                                      summary={summary}
                                      mainGroupLabels={GROUP_LABELS}
                                      mainGroupOrder={GROUP_ORDER}
                                      highlightStatusId={r.id}
                                      counterColorHex={editCounterColor}
                                      onCounterColorChange={setEditCounterColor}
                                    />
                                  </div>
                                </>
                              ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className="inline-flex rounded-full px-2 py-1 text-xs font-semibold"
                                    style={panelStatusChipStyle(displayColor)}
                                  >
                                    {r.name}
                                  </span>
                                  <span className="text-xs text-gray-500">sort: {r.sort_order}</span>
                                  <span className="text-xs text-gray-400">({r.count} rek.)</span>
                                </div>
                              )}
                            </div>
                            <div className="flex shrink-0 gap-2">
                              {isEdit ? (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
                                    onClick={cancelEdit}
                                  >
                                    Anuluj
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-gray-800"
                                    onClick={() => void saveEdit(r.id)}
                                  >
                                    Zapisz
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50"
                                    onClick={() => startEdit(r)}
                                  >
                                    Edytuj
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-800 hover:bg-red-50"
                                    onClick={() => void onDelete(r.id)}
                                  >
                                    Usuń
                                  </button>
                                </>
                              )}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
    </PageLayout>
  );
}
