import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { DocumentSeriesDto } from "../../../../api/documentSeriesApi";
import { useWarehouse } from "../../../../context/WarehouseContext";
import { DAMAGE_TENANT_ID } from "../../../damage/damageShared";
import {
  DOCUMENT_SERIES_EDITOR_TABS,
  type DocumentSeriesEditorTab,
} from "../../documentSeriesEditorTypes";
import { useDocumentSeriesEditor } from "../../hooks/useDocumentSeriesEditor";
import { warehouseCapabilitiesFor } from "../../warehouseSeriesCapabilities";
import { WarehouseDocumentSeriesForm } from "../WarehouseDocumentSeriesForm";
import { SaleDocumentSeriesEditorByTab } from "./SaleDocumentSeriesEditorByTab";
import {
  FormActions,
  FormError,
  PrimaryButton,
  SecondaryButton,
  brandTabsNavItemClassName,
  brandTabsNavRowClassName,
  typography,
} from "@/design-system";

type Props = {
  seriesId: string | null;
  isCreate: boolean;
  onClose: () => void;
  onSaved: (saved: DocumentSeriesDto, mode: "create" | "update") => void;
};

function visibleEditorTabs(type: string, subtype: string): DocumentSeriesEditorTab[] {
  if (type === "WAREHOUSE") {
    const cap = warehouseCapabilitiesFor(subtype);
    const tabs: DocumentSeriesEditorTab[] = ["basics", "document", "numbering"];
    if (cap?.show_order_status_hooks) tabs.push("automation");
    if (cap?.show_company_block) tabs.push("company");
    return tabs;
  }
  return DOCUMENT_SERIES_EDITOR_TABS.map((t) => t.id);
}

export function DocumentSeriesEditorPanel({ seriesId, isCreate, onClose, onSaved }: Props) {
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const tenantId = DAMAGE_TENANT_ID;
  const warehouseLabel = warehouse?.name?.trim() || (warehouseId != null ? `Magazyn #${warehouseId}` : "—");

  const editor = useDocumentSeriesEditor({
    seriesId,
    isCreate,
    tenantId,
    warehouseId,
    onSaved,
  });

  const tabs = useMemo(
    () => visibleEditorTabs(editor.draft.type, editor.draft.subtype),
    [editor.draft.type, editor.draft.subtype],
  );
  const [activeTab, setActiveTab] = useState<DocumentSeriesEditorTab>("basics");

  useEffect(() => {
    if (!tabs.includes(activeTab)) setActiveTab(tabs[0] ?? "basics");
  }, [tabs, activeTab]);

  useEffect(() => {
    setActiveTab("basics");
  }, [seriesId, isCreate]);

  const title = isCreate ? "Nowa seria" : editor.draft.name.trim() || "Seria dokumentów";

  return (
    <aside
      className="flex h-full min-h-0 w-full min-w-0 flex-col border-l border-slate-200 bg-white"
      data-testid="document-series-editor-panel"
      aria-label="Edycja serii dokumentów"
    >
      <header className="flex shrink-0 items-start gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
            {editor.draft.is_active ? (
              <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                Aktywna
              </span>
            ) : (
              <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                Nieaktywna
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          title="Zamknij edycję"
          aria-label="Zamknij edycję"
          data-testid="document-series-editor-close"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <nav className={`${brandTabsNavRowClassName} shrink-0 gap-4 overflow-x-auto px-4 pt-2`} aria-label="Sekcje serii">
        {DOCUMENT_SERIES_EDITOR_TABS.filter((t) => tabs.includes(t.id)).map((t) => (
          <button
            key={t.id}
            type="button"
            className={brandTabsNavItemClassName(activeTab === t.id)}
            onClick={() => setActiveTab(t.id)}
            data-testid={`document-series-tab-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {editor.err ? <FormError className="mb-3 mt-0 text-sm">{editor.err}</FormError> : null}
        {editor.loading ? (
          <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-600" aria-hidden />
            <p className={`text-sm font-medium ${typography.body}`}>Ładowanie…</p>
          </div>
        ) : editor.isWarehouse ? (
          <WarehouseDocumentSeriesForm
            draft={editor.draft}
            setDraft={editor.setDraft}
            warehouseLabel={warehouseLabel}
            tenantId={tenantId}
            activeTab={activeTab}
          />
        ) : (
          <SaleDocumentSeriesEditorByTab
            activeTab={activeTab}
            draft={editor.draft}
            setDraft={editor.setDraft}
            setField={editor.setField}
            allowedSubtypes={editor.allowedSubtypes}
            correctionOptions={editor.correctionOptions}
            warehouseSeriesOptions={editor.warehouseSeriesOptions}
            statuses={editor.statuses}
            tenantId={tenantId}
            loadingProfile={editor.loadingProfile}
            loadFromTenantProfile={editor.loadFromTenantProfile}
          />
        )}
      </div>

      <FormActions className="!border-t-0 shrink-0 bg-white px-4 pb-4 pt-0">
        <SecondaryButton type="button" onClick={editor.cancel} data-testid="document-series-editor-cancel">
          Anuluj
        </SecondaryButton>
        <PrimaryButton
          type="button"
          disabled={editor.saving || editor.loading}
          onClick={() => void editor.save()}
          data-testid="document-series-editor-save"
        >
          {editor.saving ? "Zapisywanie…" : "Zapisz"}
        </PrimaryButton>
      </FormActions>
    </aside>
  );
}
