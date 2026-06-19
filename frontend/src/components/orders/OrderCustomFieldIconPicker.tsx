import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Loader2, RotateCcw, Trash2, Upload } from "lucide-react";

import {
  uploadOrderCustomFieldDefinitionIcon,
  removeOrderCustomFieldDefinitionIcon,
  type OrderCustomFieldDto,
} from "../../api/orderCustomFieldsApi";
import { getApiErrorMessage } from "../../utils/apiError";
import {
  ORDER_CUSTOM_FIELD_ICON_KEYS,
  ORDER_CUSTOM_FIELD_LUCIDE_ICONS,
  defaultLucideIconKeyForBackendType,
} from "./orderCustomFieldLucideIcon";
import OrderCustomFieldGlyph from "./OrderCustomFieldGlyph";

type DefinitionUploadCtx = {
  fieldId: number;
  tenantId: number;
  warehouseId: number;
  onDefinitionUpdated: (dto: OrderCustomFieldDto) => void;
};

type Props = {
  backendType: string;
  previewSettings: Record<string, unknown>;
  lucideKey: string | null;
  onLucideKeyChange: (next: string | null) => void;
  customIconUrl: string | null;
  onCustomIconUrlChange: (next: string | null) => void;
  definitionUpload?: DefinitionUploadCtx;
  /** Jedna linia: podgląd + Zmień (bez dużej karty). */
  compact?: boolean;
};

const PREVIEW_BOX =
  "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200/90 bg-white text-slate-600";
const LUCIDE_IN_PREVIEW = "h-[18px] w-[18px]";

export default function OrderCustomFieldIconPicker({
  backendType,
  previewSettings,
  lucideKey,
  onLucideKeyChange,
  customIconUrl,
  onCustomIconUrlChange,
  definitionUpload,
  compact = false,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"lucide" | "upload" | "url">("lucide");
  const [upBusy, setUpBusy] = useState(false);
  const [extErr, setExtErr] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const u = (customIconUrl ?? "").trim();
    if (u && /^https:\/\//i.test(u)) setUrlDraft(u);
    else if (!u || u.startsWith("/uploads/")) setUrlDraft("");
  }, [customIconUrl]);

  const mergedPreview = useMemo(() => {
    const draftUrl = urlDraft.trim();
    if (tab === "url" && /^https:\/\//i.test(draftUrl)) {
      return {
        ...previewSettings,
        ui: {
          ...((previewSettings.ui as object) ?? {}),
          icon: null,
          custom_icon_url: draftUrl,
        },
      };
    }
    return {
      ...previewSettings,
      ui: {
        ...((previewSettings.ui as object) ?? {}),
        icon: lucideKey,
        custom_icon_url: customIconUrl,
      },
    };
  }, [previewSettings, lucideKey, customIconUrl, tab, urlDraft]);

  const filteredKeys = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return ORDER_CUSTOM_FIELD_ICON_KEYS;
    return ORDER_CUSTOM_FIELD_ICON_KEYS.filter((k) => k.toLowerCase().includes(t));
  }, [q]);

  const autoKey = defaultLucideIconKeyForBackendType(backendType);

  const sourceTypeLabel = useMemo(() => {
    const u = (customIconUrl ?? "").trim();
    if (u.startsWith("/uploads/")) return "Własny plik";
    if (/^https:\/\//i.test(u)) return "Adres obrazka";
    if (lucideKey) return "Ikona systemowa";
    return "Automatycznie (wg typu pola)";
  }, [customIconUrl, lucideKey]);

  const displayName = useMemo(() => {
    const u = (customIconUrl ?? "").trim();
    if (u.startsWith("/uploads/")) return "Ikona z pliku";
    if (/^https:\/\//i.test(u)) return "Obraz z adresu URL";
    if (lucideKey) return lucideKey;
    return autoKey;
  }, [customIconUrl, lucideKey, autoKey]);

  const hasCustomSelection = Boolean(
    (customIconUrl ?? "").trim() || lucideKey != null,
  );

  const onPickFile = useCallback(
    async (file: File | undefined) => {
      setExtErr(null);
      if (!file || !definitionUpload) return;
      const lower = file.name.toLowerCase();
      const okExt = [".svg", ".png", ".webp", ".jpg", ".jpeg"].some((e) => lower.endsWith(e));
      if (!okExt) {
        setExtErr("Dozwolone: PNG, JPG, SVG, WEBP.");
        return;
      }
      setUpBusy(true);
      try {
        const dto = await uploadOrderCustomFieldDefinitionIcon(
          definitionUpload.fieldId,
          { tenant_id: definitionUpload.tenantId, warehouse_id: definitionUpload.warehouseId },
          file,
        );
        definitionUpload.onDefinitionUpdated(dto);
        setTab("upload");
      } catch (e) {
        const detail = getApiErrorMessage(e);
        setExtErr(detail.trim() || "Nie udało się wgrać pliku.");
      } finally {
        setUpBusy(false);
      }
    },
    [definitionUpload],
  );

  const onRemoveCustom = async () => {
    setExtErr(null);
    if (definitionUpload && customIconUrl && customIconUrl.startsWith("/uploads/")) {
      setUpBusy(true);
      try {
        const dto = await removeOrderCustomFieldDefinitionIcon(definitionUpload.fieldId, {
          tenant_id: definitionUpload.tenantId,
          warehouse_id: definitionUpload.warehouseId,
        });
        definitionUpload.onDefinitionUpdated(dto);
      } catch {
        setExtErr("Nie udało się usunąć ikony.");
      } finally {
        setUpBusy(false);
      }
      return;
    }
    onCustomIconUrlChange(null);
  };

  const onDropUpload = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      void onPickFile(f);
    },
    [onPickFile],
  );

  const pickerPanel = pickerOpen ? (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2.5">
      <div
        className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5"
        role="tablist"
        aria-label="Źródło ikony"
      >
        {(
          [
            ["lucide", "Systemowe"],
            ["upload", "Plik"],
            ["url", "URL"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`rounded-[0.35rem] px-2.5 py-1 text-[11px] font-medium transition ${
              tab === id
                ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "lucide" ? (
        <div className="space-y-1.5">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Szukaj ikony…"
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-1 focus:ring-slate-300/40"
          />
          <div className="max-h-[min(40vh,220px)] overflow-y-auto rounded-md border border-slate-200/80 bg-white p-1">
            <div className="grid grid-cols-7 gap-0.5 sm:grid-cols-8">
              {filteredKeys.map((key) => {
                const Icon = ORDER_CUSTOM_FIELD_LUCIDE_ICONS[key];
                const selected = lucideKey === key;
                return (
                  <button
                    key={key}
                    type="button"
                    title={key}
                    onClick={() => {
                      onLucideKeyChange(key);
                      onCustomIconUrlChange(null);
                    }}
                    className={`flex h-9 w-9 items-center justify-center rounded border text-slate-700 transition hover:bg-slate-50 ${
                      selected
                        ? "border-slate-700 bg-slate-100 shadow-sm"
                        : "border-transparent hover:border-slate-200"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {tab === "upload" ? (
        <div className="space-y-1.5">
          {!definitionUpload ? (
            <p className="text-xs leading-snug text-slate-600">
              Zapisz pole („Utwórz pole”), aby wgrać plik — potem edytuj definicję i wybierz „Plik”.
            </p>
          ) : (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".svg,.png,.webp,.jpg,.jpeg,image/svg+xml,image/png,image/webp,image/jpeg"
                className="hidden"
                disabled={upBusy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  void onPickFile(f);
                }}
              />
              <button
                type="button"
                disabled={upBusy}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDropUpload}
                onClick={() => fileRef.current?.click()}
                className={`flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-2 py-2 text-left text-[11px] transition ${
                  dragOver
                    ? "border-sky-400 bg-sky-50/80"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80"
                }`}
              >
                {upBusy ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" aria-hidden />
                ) : (
                  <Upload className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                )}
                <span className="min-w-0 text-slate-800">
                  <span className="font-medium">Wybierz plik</span>
                  <span className="text-slate-500"> · PNG, JPG, SVG, WEBP</span>
                </span>
              </button>
              {customIconUrl?.startsWith("/uploads/") ? (
                <button
                  type="button"
                  disabled={upBusy}
                  onClick={() => void onRemoveCustom()}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-md border border-red-200/90 bg-red-50/80 py-1.5 text-[11px] font-medium text-red-900 hover:bg-red-100"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Usuń wgrany plik
                </button>
              ) : null}
            </>
          )}
          {extErr ? <p className="text-[11px] text-red-600">{extErr}</p> : null}
        </div>
      ) : null}

      {tab === "url" ? (
        <div className="space-y-1">
          <input
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:ring-1 focus:ring-slate-300/40"
            placeholder="https://…"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onBlur={() => {
              const v = urlDraft.trim();
              if (!v) {
                onCustomIconUrlChange(null);
                return;
              }
              if (/^https:\/\//i.test(v)) {
                onCustomIconUrlChange(v);
                onLucideKeyChange(null);
              }
            }}
          />
          <p className="text-[10px] text-slate-500">HTTPS. Zapis po wyjściu z pola.</p>
        </div>
      ) : null}
    </div>
  ) : null;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <OrderCustomFieldGlyph
            type={backendType}
            settings={mergedPreview}
            boxClassName={PREVIEW_BOX}
            lucideClassName={LUCIDE_IN_PREVIEW}
          />
          <span className="text-sm text-slate-700">{displayName}</span>
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50"
          >
            {pickerOpen ? "Zwiń" : "Zmień"}
          </button>
          {hasCustomSelection ? (
            <button
              type="button"
              onClick={() => {
                onLucideKeyChange(null);
                void onRemoveCustom();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              title="Przywróć domyślną ikonę wg typu"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              Reset
            </button>
          ) : null}
        </div>
        {pickerPanel}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200/80 bg-white px-2.5 py-2">
        <OrderCustomFieldGlyph
          type={backendType}
          settings={mergedPreview}
          boxClassName={PREVIEW_BOX}
          lucideClassName={LUCIDE_IN_PREVIEW}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-800">{displayName}</p>
          <p className="text-[11px] text-slate-500">{sourceTypeLabel}</p>
        </div>
        <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100"
          >
            {pickerOpen ? "Zwiń" : "Zmień ikonę"}
          </button>
          <button
            type="button"
            disabled={!hasCustomSelection}
            onClick={() => {
              onLucideKeyChange(null);
              void onRemoveCustom();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-40"
            title="Przywróć domyślną ikonę wg typu"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </button>
        </div>
      </div>

      {pickerPanel}
    </div>
  );
}
