import { useEffect, useMemo, useState } from "react";
import {
  previewDocumentSeriesNumbering,
  subtypesForDocumentSeriesType,
  type DocumentSeriesSubtype,
  type DocumentSeriesWritePayload,
} from "../../../api/documentSeriesApi";
import {
  applyNumberingPreset,
  DOCUMENT_SERIES_PRINT_TEMPLATE_PRESETS,
  documentSeriesSubtypeLabelPl,
  documentSeriesTypeLabelPl,
  numberingPresetFromDraft,
  numberingPresetLabelPl,
  type NumberingPresetUi,
} from "../documentSeriesUiLabels";
import {
  applyWarehouseSubtypeDefaults,
  warehouseCapabilitiesFor,
} from "../warehouseSeriesCapabilities";
import { DocumentTemplateSelect } from "@/pages/Settings/document-templates/components/DocumentTemplateSelect";
import {
  Checkbox,
  FormField,
  FormSection,
  FORM_FIELD_DENSITY,
  formStackClass,
  Input,
  Select,
  Textarea,
  typography,
} from "@/design-system";

type Props = {
  draft: DocumentSeriesWritePayload;
  setDraft: React.Dispatch<React.SetStateAction<DocumentSeriesWritePayload>>;
  warehouseLabel: string;
  tenantId: number;
};

export function WarehouseDocumentSeriesForm({ draft, setDraft, warehouseLabel, tenantId }: Props) {
  const cap = useMemo(() => warehouseCapabilitiesFor(draft.subtype), [draft.subtype]);
  const numberingPreset = useMemo(
    () => numberingPresetFromDraft(draft),
    [draft.numbering_format, draft.reset_each_period, draft.monthly_reset, draft.yearly_reset],
  );
  const [numberingPreview, setNumberingPreview] = useState("…");

  const setField = <K extends keyof DocumentSeriesWritePayload>(key: K, value: DocumentSeriesWritePayload[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const onSubtypeChange = (subtype: DocumentSeriesSubtype) => {
    setDraft((d) => applyWarehouseSubtypeDefaults(d, subtype) as DocumentSeriesWritePayload);
  };

  const onNumberingPresetChange = (p: NumberingPresetUi) => {
    setDraft((d) => ({ ...d, ...applyNumberingPreset(p) }));
  };

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void previewDocumentSeriesNumbering({
        prefix: draft.prefix,
        suffix: draft.suffix,
        numbering_format: draft.numbering_format,
        numbering_start: draft.numbering_start,
        padding_length: draft.padding_length,
        code: draft.code,
        reset_each_period: draft.reset_each_period,
        yearly_reset: draft.yearly_reset,
        monthly_reset: draft.monthly_reset,
      })
        .then((preview) => {
          if (!cancelled) setNumberingPreview(preview);
        })
        .catch(() => {
          if (!cancelled) setNumberingPreview("—");
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    draft.prefix,
    draft.suffix,
    draft.numbering_format,
    draft.numbering_start,
    draft.padding_length,
    draft.code,
    draft.reset_each_period,
    draft.yearly_reset,
    draft.monthly_reset,
  ]);

  const printModeCustom = draft.print_template_id == null;
  const allowedSubtypes = subtypesForDocumentSeriesType("WAREHOUSE");
  const templateKind = cap?.document_template_kind ?? null;

  return (
    <div className={`max-w-3xl ${formStackClass}`}>
      <FormSection title="Ustawienia serii">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Nazwa serii *" className="sm:col-span-2">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.name}
              onChange={(e) => setField("name", e.target.value)}
            />
          </FormField>
          <FormField label="Prefiks">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.prefix}
              onChange={(e) => setField("prefix", e.target.value)}
            />
          </FormField>
          <FormField label="Sufiks">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.suffix}
              onChange={(e) => setField("suffix", e.target.value)}
            />
          </FormField>
          <FormField label="Kolor" className="sm:col-span-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="color"
                aria-label="Kolor"
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="!w-14 cursor-pointer p-0.5"
                value={/^#[0-9A-Fa-f]{6}$/.test(draft.color) ? draft.color : "#64748b"}
                onChange={(e) => setField("color", e.target.value)}
              />
              <Input
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="max-w-[10rem]"
                value={draft.color}
                onChange={(e) => setField("color", e.target.value)}
                placeholder="#RRGGBB"
              />
            </div>
          </FormField>
          <FormField label="Typ">
            <Input density={FORM_FIELD_DENSITY} focusTone="brand" value={documentSeriesTypeLabelPl("WAREHOUSE")} disabled />
          </FormField>
          <FormField label="Podtyp *">
            <Select
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
              value={draft.subtype}
              onChange={(e) => onSubtypeChange(e.target.value as DocumentSeriesSubtype)}
            >
              {allowedSubtypes.map((s) => (
                <option key={s} value={s}>
                  {cap?.subtype === s ? cap.label_pl : documentSeriesSubtypeLabelPl(s)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Magazyn" className="sm:col-span-2">
            <Input density={FORM_FIELD_DENSITY} focusTone="brand" value={warehouseLabel} disabled />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Numeracja">
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label="Format numeracji">
            <Select
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              className="bg-white"
              value={numberingPreset}
              onChange={(e) => onNumberingPresetChange(e.target.value as NumberingPresetUi)}
            >
              <option value="continuous">{numberingPresetLabelPl("continuous")}</option>
              <option value="monthly">{numberingPresetLabelPl("monthly")}</option>
              <option value="yearly">{numberingPresetLabelPl("yearly")}</option>
            </Select>
          </FormField>
          <FormField label="Początkowy numer">
            <Input
              type="number"
              min={1}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.numbering_start}
              onChange={(e) => setField("numbering_start", Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </FormField>
          <FormField label="Kolejny numer">
            <Input
              type="number"
              min={1}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.numbering_start}
              disabled
              helperText="Aktualny licznik serii — zmienia się automatycznie przy wystawianiu dokumentów."
            />
          </FormField>
          <FormField label="Minimalna długość numeru">
            <Input
              type="number"
              min={0}
              max={12}
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.padding_length}
              onChange={(e) =>
                setField("padding_length", Math.min(12, Math.max(0, parseInt(e.target.value, 10) || 0)))
              }
            />
          </FormField>
          <FormField label="Kod magazynu (opcjonalnie)">
            <Input
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              value={draft.code}
              onChange={(e) => setField("code", e.target.value)}
              placeholder="np. MAG1"
            />
          </FormField>
          <label className={`flex items-center gap-2 ${typography.body}`}>
            <Checkbox checked={draft.is_default} onChange={(e) => setField("is_default", e.target.checked)} />
            Domyślna seria dla podtypu
          </label>
          <label className={`flex items-center gap-2 ${typography.body}`}>
            <Checkbox checked={draft.is_active} onChange={(e) => setField("is_active", e.target.checked)} />
            Aktywna
          </label>
          <FormField label="Podgląd numeru" className="sm:col-span-2">
            <span className="block rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 font-mono text-sm text-slate-800">
              {numberingPreview}
            </span>
          </FormField>
          <details className="sm:col-span-2">
            <summary className={`cursor-pointer ${typography.label}`}>Zaawansowany — własny format</summary>
            <FormField label="Szablon numeru" className="mt-2">
              <Input
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                value={draft.numbering_format}
                onChange={(e) => setField("numbering_format", e.target.value)}
              />
            </FormField>
          </details>
        </div>
      </FormSection>

      <FormSection title="Dokument">
        <div className="grid gap-3">
          {cap?.show_print_template_preset ? (
            <>
              <FormField label="Szablon wydruku dokumentu">
                <Select
                  density={FORM_FIELD_DENSITY}
                  focusTone="brand"
                  className="bg-white"
                  value={draft.print_template_id ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setDraft((d) => ({ ...d, print_template_id: null }));
                      return;
                    }
                    setDraft((d) => ({ ...d, print_template_id: Number(v), print_template: "" }));
                  }}
                >
                  <option value="">Szablon własny</option>
                  {DOCUMENT_SERIES_PRINT_TEMPLATE_PRESETS.filter((p) => p.id === 3).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Własna ścieżka szablonu">
                <Input
                  density={FORM_FIELD_DENSITY}
                  focusTone="brand"
                  disabled={!printModeCustom}
                  value={draft.print_template}
                  onChange={(e) => setField("print_template", e.target.value)}
                />
              </FormField>
            </>
          ) : null}
          {cap?.show_document_template && templateKind ? (
            <DocumentTemplateSelect
              tenantId={tenantId}
              kindCode={templateKind}
              variantCode={draft.document_template_variant_code ?? "standard"}
              value={draft.document_template_version_id ?? null}
              onChange={(versionId) => setDraft((d) => ({ ...d, document_template_version_id: versionId }))}
            />
          ) : null}
          {cap?.show_delete_mode ? (
            <FormField label="Tryb usuwania dokumentu">
              <Select
                density={FORM_FIELD_DENSITY}
                focusTone="brand"
                className="bg-white"
                value={draft.delete_mode}
                onChange={(e) => setField("delete_mode", e.target.value as DocumentSeriesWritePayload["delete_mode"])}
              >
                <option value="ASK">Pytaj przed usunięciem</option>
                <option value="ALWAYS_DELETE">Zawsze usuwaj</option>
              </Select>
            </FormField>
          ) : null}
          <FormField label="Uwagi">
            <Textarea
              density={FORM_FIELD_DENSITY}
              focusTone="brand"
              rows={3}
              value={draft.notes ?? ""}
              onChange={(e) => setField("notes", e.target.value || null)}
            />
          </FormField>
        </div>
      </FormSection>

      {cap?.show_collective_return_receipt ? (
        <FormSection title="Ustawienia specyficzne">
          <label className={`flex items-start gap-2 ${typography.body}`}>
            <Checkbox
              className="mt-0.5"
              checked={draft.collective_return_receipt ?? false}
              onChange={(e) => setField("collective_return_receipt", e.target.checked)}
            />
            <span>
              <span className="font-medium">Zbiorczy dokument dla zwrotów</span>
              <span className={`mt-0.5 block ${typography.caption}`}>
                Wyłączone = jeden zwrot → jeden Z-PZ (zalecane).
              </span>
            </span>
          </label>
        </FormSection>
      ) : null}
    </div>
  );
}
