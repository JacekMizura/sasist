import { useCallback, useEffect, useState } from "react";

import {
  createReturnUiStatus,
  deleteReturnUiStatus,
  getReturnPanelSubgroups,
  getReturnUiStatusSummary,
  updateReturnUiStatus,
  uploadReturnUiStatusImage,
  type ReturnUiStatusCreatePayload,
} from "../../../api/returnUiStatusApi";
import { DEFAULT_PANEL_STATUS_HEX, isValidPanelStatusHex } from "../../../components/panel/HexColorField";
import type {
  ReturnUiMainGroup,
  ReturnUiPanelSubgroupRead,
  ReturnUiStatusPanelSummary,
  ReturnUiStatusRead,
  ReturnUiStatusUpdatePayload,
  ReturnUiStatusWithCount,
} from "../../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";

export function useReturnPanelStatusesConfig(warehouseId: number | null) {
  const [summary, setSummary] = useState<ReturnUiStatusPanelSummary | null>(null);
  const [panelSubgroups, setPanelSubgroups] = useState<ReturnUiPanelSubgroupRead[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
        getReturnUiStatusSummary(DAMAGE_TENANT_ID, warehouseId, { includeInactive: true }),
        getReturnPanelSubgroups(DAMAGE_TENANT_ID, warehouseId),
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

  const validateColors = (badge: string, d: ReturnUiStatusUpdatePayload): string | null => {
    for (const c of [badge, d.background_color, d.text_color]) {
      if (c != null && String(c).trim() && !isValidPanelStatusHex(String(c))) return "Kolory: format #RRGGBB.";
    }
    return null;
  };

  const saveStatus = async (id: number, editDraft: ReturnUiStatusUpdatePayload) => {
    const badge = (editDraft.badge_color ?? editDraft.color ?? DEFAULT_PANEL_STATUS_HEX).trim();
    const msg = validateColors(badge, editDraft);
    if (msg) {
      setErr(msg);
      return false;
    }
    try {
      const payload: ReturnUiStatusUpdatePayload = {
        name: editDraft.name,
        main_group: editDraft.main_group,
        group_name: null,
        subgroup_name: editDraft.subgroup_name != null ? (String(editDraft.subgroup_name).trim() || null) : undefined,
        color: badge.toLowerCase(),
        ...(editDraft.badge_color?.trim()
          ? { badge_color: editDraft.badge_color.trim().toLowerCase() }
          : { badge_color: null }),
        ...(editDraft.background_color?.trim()
          ? { background_color: editDraft.background_color.trim().toLowerCase() }
          : { background_color: null }),
        ...(editDraft.text_color?.trim() ? { text_color: editDraft.text_color.trim().toLowerCase() } : { text_color: null }),
        is_active: editDraft.is_active,
        sort_status: editDraft.sort_status,
        sort_order: editDraft.sort_status ?? editDraft.sort_order,
        sort_group: 0,
        sort_subgroup: 0,
      };
      await updateReturnUiStatus(id, DAMAGE_TENANT_ID, payload, warehouseId);
      await load();
      return true;
    } catch {
      setErr("Nie udało się zapisać statusu.");
      return false;
    }
  };

  const createStatus = async (body: ReturnUiStatusCreatePayload): Promise<number | false> => {
    const badge = (body.badge_color ?? body.color ?? DEFAULT_PANEL_STATUS_HEX).trim();
    if (!isValidPanelStatusHex(badge) || !isValidPanelStatusHex(body.background_color ?? badge) || !isValidPanelStatusHex(body.text_color ?? "#0f172a")) {
      setErr("Kolory: format #RRGGBB.");
      return false;
    }
    try {
      const created = await createReturnUiStatus(DAMAGE_TENANT_ID, body, warehouseId);
      await load();
      return created.id;
    } catch {
      setErr("Nie udało się utworzyć statusu.");
      return false;
    }
  };

  const removeStatus = async (id: number) => {
    if (!window.confirm("Usunąć ten status? Powiązania ze zwrotami zostaną wyczyszczone.")) return false;
    try {
      await deleteReturnUiStatus(id, DAMAGE_TENANT_ID, warehouseId);
      await load();
      return true;
    } catch {
      setErr("Nie udało się usunąć statusu.");
      return false;
    }
  };

  const uploadImage = async (statusId: number, file: File) => {
    if (warehouseId == null) return false;
    try {
      await uploadReturnUiStatusImage(statusId, DAMAGE_TENANT_ID, file, warehouseId);
      await load();
      return true;
    } catch {
      setErr("Nie udało się wgrać logo.");
      return false;
    }
  };

  const clearImage = async (statusId: number) => {
    try {
      await updateReturnUiStatus(statusId, DAMAGE_TENANT_ID, { image_url: null }, warehouseId);
      await load();
      return true;
    } catch {
      setErr("Nie udało się usunąć logo.");
      return false;
    }
  };

  const moveStatus = async (mainGroup: ReturnUiMainGroup, r: ReturnUiStatusWithCount, direction: "up" | "down") => {
    const block = summary?.groups.find((x) => x.main_group === mainGroup);
    const subs = block?.sub_statuses ?? [];
    const idx = subs.findIndex((s) => s.id === r.id);
    const j = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || j < 0 || j >= subs.length) return;
    const a = subs[idx];
    const b = subs[j];
    try {
      await updateReturnUiStatus(a.id, DAMAGE_TENANT_ID, { sort_status: b.sort_status ?? b.sort_order, sort_order: b.sort_order }, warehouseId);
      await updateReturnUiStatus(b.id, DAMAGE_TENANT_ID, { sort_status: a.sort_status ?? a.sort_order, sort_order: a.sort_order }, warehouseId);
      await load();
    } catch {
      setErr("Nie udało się zmienić kolejności.");
    }
  };

  const startEditDraft = (r: ReturnUiStatusRead): ReturnUiStatusUpdatePayload => ({
    name: r.name,
    color: r.color,
    sort_order: r.sort_order,
    main_group: r.main_group,
    subgroup_name: r.subgroup_name,
    sort_status: r.sort_status ?? r.sort_order,
    badge_color: r.badge_color,
    background_color: r.background_color,
    text_color: r.text_color,
    is_active: r.is_active !== false,
  });

  return {
    summary,
    panelSubgroups,
    loading,
    err,
    setErr,
    reload: load,
    saveStatus,
    createStatus,
    removeStatus,
    uploadImage,
    clearImage,
    moveStatus,
    startEditDraft,
  };
}
