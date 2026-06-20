import { useEffect, useMemo, useState } from "react";

import { CompactLabelColorPicker } from "../../../components/label/CompactLabelColorPicker";
import { PanelStatusConfiguratorAside } from "../../../components/settings/PanelStatusConfiguratorAside";
import { DEFAULT_PANEL_STATUS_HEX } from "../../../components/panel/HexColorField";
import { usePanelStatusCounterColor } from "../../../hooks/usePanelStatusCounterColor";
import type {
  ReturnUiMainGroup,
  ReturnUiPanelSubgroupRead,
  ReturnUiStatusCreatePayload,
  ReturnUiStatusPanelSummary,
  ReturnUiStatusUpdatePayload,
  ReturnUiStatusWithCount,
} from "../../../types/wmsReturn";
import { DAMAGE_TENANT_ID } from "../../damage/damageShared";
import { RETURN_MAIN_GROUP_LABELS, RETURN_MAIN_GROUP_ORDER } from "./constants";
import { ReturnsConfiguratorModalShell } from "./ReturnsConfiguratorModalShell";
import { IntegrationsApiPanel } from "./AdvancedSettingsPanel";

const inp = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300";
const lab = "block text-xs font-medium text-slate-600";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  status: ReturnUiStatusWithCount | null;
  initialMainGroup?: ReturnUiMainGroup;
  panelSubgroups: ReturnUiPanelSubgroupRead[];
  summary: ReturnUiStatusPanelSummary | null;
  warehouseId: number;
  busy: boolean;
  onClose: () => void;
  onSaveCreate: (body: ReturnUiStatusCreatePayload) => Promise<number | false>;
  onSaveEdit: (id: number, draft: ReturnUiStatusUpdatePayload) => Promise<boolean>;
  onUploadImage?: (statusId: number, file: File) => Promise<boolean>;
  onClearImage?: (statusId: number) => Promise<boolean>;
};

function emptyCreate(mainGroup: ReturnUiMainGroup): ReturnUiStatusCreatePayload {
  return {
    name: "",
    main_group: mainGroup,
    group_name: null,
    color: DEFAULT_PANEL_STATUS_HEX,
    sort_order: 0,
    subgroup_name: null,
    sort_group: 0,
    sort_subgroup: 0,
    sort_status: 0,
    badge_color: DEFAULT_PANEL_STATUS_HEX,
    background_color: DEFAULT_PANEL_STATUS_HEX,
    text_color: "#0f172a",
    is_active: true,
  };
}

export function ReturnUiStatusModal({
  open,
  mode,
  status,
  initialMainGroup = "NEW",
  panelSubgroups,
  summary,
  warehouseId,
  busy,
  onClose,
  onSaveCreate,
  onSaveEdit,
  onUploadImage,
  onClearImage,
}: Props) {
  const [createDraft, setCreateDraft] = useState(() => emptyCreate(initialMainGroup));
  const [editDraft, setEditDraft] = useState<ReturnUiStatusUpdatePayload>({});
  const [previewBlob, setPreviewBlob] = useState<string | null>(null);
  const [pendingCounterColor, setPendingCounterColor] = useState<string | null>(null);

  const statusId = mode === "edit" ? status?.id ?? null : null;
  const { counterColor, setCounterColor, persistForStatusId } = usePanelStatusCounterColor(
    "returns",
    DAMAGE_TENANT_ID,
    warehouseId,
    statusId,
  );

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      setCreateDraft(emptyCreate(initialMainGroup));
      setPendingCounterColor(null);
    } else if (status) {
      setEditDraft({
        name: status.name,
        color: status.color,
        sort_order: status.sort_order,
        main_group: status.main_group,
        subgroup_name: status.subgroup_name,
        sort_status: status.sort_status ?? status.sort_order,
        badge_color: status.badge_color,
        background_color: status.background_color,
        text_color: status.text_color,
        is_active: status.is_active !== false,
      });
    }
    setPreviewBlob(null);
  }, [open, mode, status, initialMainGroup]);

  useEffect(() => () => {
    if (previewBlob) URL.revokeObjectURL(previewBlob);
  }, [previewBlob]);

  const mg = (mode === "create" ? createDraft.main_group : editDraft.main_group ?? status?.main_group ?? "NEW") as ReturnUiMainGroup;
  const subOpts = useMemo(
    () => panelSubgroups.filter((s) => s.main_group === mg).sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "pl")),
    [panelSubgroups, mg],
  );

  const name = mode === "create" ? createDraft.name : (editDraft.name ?? status?.name ?? "");
  const badge = mode === "create" ? createDraft.badge_color ?? createDraft.color : editDraft.badge_color ?? editDraft.color ?? status?.badge_color ?? status?.color ?? DEFAULT_PANEL_STATUS_HEX;
  const bg = mode === "create" ? createDraft.background_color : editDraft.background_color ?? status?.background_color ?? badge;
  const tx = mode === "create" ? createDraft.text_color : editDraft.text_color ?? status?.text_color ?? "#0f172a";
  const subVal = mode === "create" ? (createDraft.subgroup_name ?? "") : (editDraft.subgroup_name ?? status?.subgroup_name ?? "").trim();
  const imageUrl = previewBlob ?? status?.image_url ?? null;
  const effectiveCounterColor = mode === "create" ? pendingCounterColor : counterColor;

  const handleSave = async () => {
    if (mode === "create") {
      const createdId = await onSaveCreate({
        ...createDraft,
        name: createDraft.name.trim(),
        subgroup_name: createDraft.subgroup_name?.trim() || null,
      });
      if (createdId !== false) {
        if (pendingCounterColor) persistForStatusId(createdId, pendingCounterColor);
        onClose();
      }
    } else if (status) {
      const ok = await onSaveEdit(status.id, editDraft);
      if (ok) onClose();
    }
  };

  const previewAside = (
    <PanelStatusConfiguratorAside
      preview={{
        name: name.trim() || "Nazwa statusu",
        count: status?.count ?? 4,
        mainGroup: mg,
        mainGroupLabel: RETURN_MAIN_GROUP_LABELS[mg],
        subgroupLabel: subVal || null,
        badgeHex: badge ?? DEFAULT_PANEL_STATUS_HEX,
        backgroundHex: bg ?? DEFAULT_PANEL_STATUS_HEX,
        textHex: tx ?? "#0f172a",
        imageUrl,
        active: true,
      }}
      summary={summary}
      mainGroupLabels={RETURN_MAIN_GROUP_LABELS}
      mainGroupOrder={RETURN_MAIN_GROUP_ORDER}
      highlightStatusId={mode === "edit" ? status?.id : null}
      highlightDraft={
        mode === "create"
          ? { name, main_group: mg, subgroup_name: subVal || null }
          : null
      }
      counterColorHex={effectiveCounterColor}
      onCounterColorChange={mode === "create" ? setPendingCounterColor : setCounterColor}
    />
  );

  return (
    <ReturnsConfiguratorModalShell
      open={open}
      wide
      busy={busy}
      title={mode === "create" ? "Nowa etykieta listy" : "Edytuj etykietę"}
      subtitle="Nazwa i kolory widoczne na liście zwrotów oraz w panelu bocznym."
      onClose={onClose}
      aside={previewAside}
      footer={
        <>
          <button type="button" disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100" onClick={onClose}>
            Anuluj
          </button>
          <button
            type="button"
            disabled={busy || !name.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-45"
            onClick={() => void handleSave()}
          >
            {busy ? "Zapisywanie…" : "Zapisz"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className={lab}>
          Nazwa statusu
          <input
            className={inp}
            value={name}
            onChange={(e) =>
              mode === "create"
                ? setCreateDraft((d) => ({ ...d, name: e.target.value }))
                : setEditDraft((d) => ({ ...d, name: e.target.value }))
            }
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={lab}>
            Grupa główna
            <select
              className={inp}
              value={mg}
              onChange={(e) => {
                const next = e.target.value as ReturnUiMainGroup;
                if (mode === "create") setCreateDraft((d) => ({ ...d, main_group: next, subgroup_name: null }));
                else setEditDraft((d) => ({ ...d, main_group: next, subgroup_name: null }));
              }}
            >
              {RETURN_MAIN_GROUP_ORDER.map((g) => (
                <option key={g} value={g}>
                  {RETURN_MAIN_GROUP_LABELS[g]}
                </option>
              ))}
            </select>
          </label>
          <label className={lab}>
            Podgrupa
            <select
              className={inp}
              value={subVal}
              onChange={(e) => {
                const v = e.target.value.trim() || null;
                if (mode === "create") setCreateDraft((d) => ({ ...d, subgroup_name: v }));
                else setEditDraft((d) => ({ ...d, subgroup_name: v }));
              }}
            >
              <option value="">Bez podgrupy</option>
              {subOpts.map((sg) => (
                <option key={sg.id} value={sg.name}>
                  {sg.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          <span className={lab}>Kolory</span>
          <div className="mt-2 flex flex-wrap gap-4">
            <CompactLabelColorPicker
              label="Pasek"
              value={badge ?? DEFAULT_PANEL_STATUS_HEX}
              onChange={(hex) =>
                mode === "create"
                  ? setCreateDraft((d) => ({ ...d, badge_color: hex, color: hex }))
                  : setEditDraft((d) => ({ ...d, badge_color: hex, color: hex }))
              }
            />
            <CompactLabelColorPicker
              label="Tło"
              value={bg ?? DEFAULT_PANEL_STATUS_HEX}
              onChange={(hex) =>
                mode === "create" ? setCreateDraft((d) => ({ ...d, background_color: hex })) : setEditDraft((d) => ({ ...d, background_color: hex }))
              }
            />
            <CompactLabelColorPicker
              label="Tekst"
              value={tx ?? "#0f172a"}
              onChange={(hex) =>
                mode === "create" ? setCreateDraft((d) => ({ ...d, text_color: hex })) : setEditDraft((d) => ({ ...d, text_color: hex }))
              }
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={mode === "create" ? createDraft.is_active !== false : editDraft.is_active !== false}
              onChange={(e) =>
                mode === "create"
                  ? setCreateDraft((d) => ({ ...d, is_active: e.target.checked }))
                  : setEditDraft((d) => ({ ...d, is_active: e.target.checked }))
              }
            />
            Aktywna etykieta
          </label>
        </div>
        <IntegrationsApiPanel>
          <label className={lab}>
            Kolejność na liście
            <input
              type="number"
              className={`${inp} max-w-[8rem]`}
              value={mode === "create" ? createDraft.sort_status ?? 0 : editDraft.sort_status ?? editDraft.sort_order ?? 0}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (mode === "create") setCreateDraft((d) => ({ ...d, sort_status: n, sort_order: n }));
                else setEditDraft((d) => ({ ...d, sort_status: n, sort_order: n }));
              }}
            />
          </label>
        </IntegrationsApiPanel>
        {mode === "edit" && status && onUploadImage ? (
          <div>
            <span className={lab}>Logo (opcjonalnie)</span>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {imageUrl ? <img src={imageUrl} alt="" className="h-10 w-10 rounded object-contain" /> : null}
              <label className="cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                Wgraj plik
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      setPreviewBlob(URL.createObjectURL(f));
                      void onUploadImage(status.id, f);
                    }
                  }}
                />
              </label>
              {imageUrl && onClearImage ? (
                <button type="button" className="text-xs font-medium text-red-600 hover:text-red-700" onClick={() => void onClearImage(status.id)}>
                  Usuń logo
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </ReturnsConfiguratorModalShell>
  );
}
