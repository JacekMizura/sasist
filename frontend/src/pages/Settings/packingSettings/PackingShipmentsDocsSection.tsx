import type { Dispatch, SetStateAction } from "react";
import type { DocumentSeriesDto } from "../../../api/documentSeriesApi";
import type { ShippingMethodDto } from "../../../api/shippingMethodsApi";
import type { WmsPackingExtendedUiSettings } from "../../../types/wmsPackingExtendedUi";
import type { WmsPackingSettingsRead } from "../../../types/wmsPackingSettings";
import { PackingFieldLabel } from "../packingSettingCapability";
import { WmsSettingField } from "../settingsSearch";
import {
  BoolRow,
  CAP_NONE,
  CAP_PARTIAL,
  FieldGrid,
  Help,
  MethodChecklist,
  numberInputClass,
  SectionCard,
  SelectField,
  Subsection,
} from "./packingSettingsUi";

type Props = {
  extended: WmsPackingExtendedUiSettings;
  draft: WmsPackingSettingsRead;
  saleSeries: DocumentSeriesDto[];
  templates: Array<{ id: number; name: string }>;
  shippingMethods: ShippingMethodDto[];
  patchExtended: <K extends keyof WmsPackingExtendedUiSettings>(key: K, value: WmsPackingExtendedUiSettings[K]) => void;
  setDraft: Dispatch<SetStateAction<WmsPackingSettingsRead | null>>;
  resolveFallbackDraft: () => WmsPackingSettingsRead;
};

function toggleId(ids: string[], id: string): string[] {
  const set = new Set(ids);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return Array.from(set);
}

/** Grupa 5: Przesyłki i dokumenty (jedna grupa). */
export function PackingShipmentsDocsSection({
  extended,
  draft,
  saleSeries,
  templates,
  shippingMethods,
  patchExtended,
  setDraft,
  resolveFallbackDraft,
}: Props) {
  const methods = shippingMethods
    .filter((m) => m.is_active !== false)
    .map((m) => ({ id: m.id, name: (m.name || m.code || m.id).trim() || m.id }));

  return (
    <SectionCard
      id="wms-pack-shipments-docs"
      title="Przesyłki i dokumenty"
      summary="Przesyłki, dokumenty sprzedaży, drukowanie i etykiety."
    >
      <Subsection title="Dokument sprzedaży">
        <FieldGrid>
          <SelectField
            settingId="packing.sales_document_type"
            label="Dokument sprzedaży"
            capability={CAP_NONE}
            value={extended.salesDocumentType}
            onChange={(v) =>
              patchExtended("salesDocumentType", v as WmsPackingExtendedUiSettings["salesDocumentType"])
            }
          >
            <option value="invoice">Faktura</option>
            <option value="receipt">Paragon</option>
            <option value="none">Brak</option>
          </SelectField>
        </FieldGrid>
        <div className="mt-3 space-y-2">
          <BoolRow
            settingId="packing.skip_a4_receipt_fiscal"
            label="System zintegrowany z drukarką fiskalną - pomijaj drukowanie paragonów w formacie A4"
            checked={extended.skipA4ReceiptWhenFiscalPrinter}
            onChange={(v) => patchExtended("skipA4ReceiptWhenFiscalPrinter", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.print_copy_sales_doc"
            label="Drukowanie kopii dokumentu sprzedaży"
            checked={extended.printCopyOfSalesDoc}
            onChange={(v) => patchExtended("printCopyOfSalesDoc", v)}
            capability={CAP_NONE}
          />
        </div>
      </Subsection>

      <Subsection title="Dokumenty sprzedaży (nowe)">
        <Help>
          Podczas generowania faktury lub paragonu, jeśli nie zostanie wybrana seria z modułu [NOWE] dokumenty, system
          użyje odpowiedniej serii numeracji faktur i paragonów ze starego modułu.
        </Help>
        <FieldGrid>
          <SelectField
            settingId="packing.invoice_series"
            label="Wybierz serię dokumentów dla Faktury"
            infoKey="packing.invoice_series"
            value={draft.document_settings.invoice_series_id ?? ""}
            onChange={(v) => {
              setDraft((d) => {
                const base = d ?? resolveFallbackDraft();
                return {
                  ...base,
                  document_settings: {
                    ...base.document_settings,
                    invoice_series_id: v.trim() || null,
                  },
                };
              });
            }}
          >
            <option value="">— brak —</option>
            {saleSeries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.code || s.id}
              </option>
            ))}
          </SelectField>
          <SelectField
            settingId="packing.receipt_series"
            label="Wybierz serię dokumentów dla Paragonu"
            infoKey="packing.receipt_series"
            value={draft.document_settings.receipt_series_id ?? ""}
            onChange={(v) => {
              setDraft((d) => {
                const base = d ?? resolveFallbackDraft();
                return {
                  ...base,
                  document_settings: {
                    ...base.document_settings,
                    receipt_series_id: v.trim() || null,
                  },
                };
              });
            }}
          >
            <option value="">— brak —</option>
            {saleSeries.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name || s.code || s.id}
              </option>
            ))}
          </SelectField>
        </FieldGrid>
      </Subsection>

      <Subsection title="Przesyłki / listy przewozowe">
        <div className="space-y-2">
          <BoolRow
            settingId="packing.choose_waybill_print_count"
            label="Wybór liczby listów przewozowych do druku"
            checked={extended.chooseWaybillPrintCount}
            onChange={(v) => patchExtended("chooseWaybillPrintCount", v)}
            capability={CAP_NONE}
            infoKey="packing.choose_waybill_print_count"
          />
          <BoolRow
            settingId="packing.force_scan_shipment_template"
            label="Wymuś zeskanowanie aktywatora szablonów nadania"
            checked={extended.forceScanShipmentTemplate}
            onChange={(v) => patchExtended("forceScanShipmentTemplate", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.force_scan_shipment_template_selected"
            label="Wymuś zeskanowanie aktywatora szablonów nadania tylko dla wybranych metod dostaw"
            checked={extended.forceScanShipmentTemplateSelectedMethodsOnly}
            onChange={(v) => patchExtended("forceScanShipmentTemplateSelectedMethodsOnly", v)}
            capability={CAP_NONE}
          />
        </div>
        {extended.forceScanShipmentTemplateSelectedMethodsOnly ? (
          <div className="mt-2">
            <MethodChecklist
              methods={methods}
              selectedIds={extended.forceScanShipmentTemplateMethodIds}
              onToggle={(id) =>
                patchExtended(
                  "forceScanShipmentTemplateMethodIds",
                  toggleId(extended.forceScanShipmentTemplateMethodIds, id),
                )
              }
            />
          </div>
        ) : null}
        <div className="mt-3 space-y-2">
          <BoolRow
            settingId="packing.require_confirm_before_shipment"
            label="Wymagaj potwierdzenia przed wygenerowaniem listu przewozowego"
            checked={extended.requireConfirmBeforeShipment}
            onChange={(v) => patchExtended("requireConfirmBeforeShipment", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.enable_multi_parcel"
            label="Włącz wielopaczkowość"
            checked={extended.enableMultiParcel}
            onChange={(v) => patchExtended("enableMultiParcel", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.only_packaging_warehouse_stock"
            label="Wyświetlaj tylko opakowania z magazynu opakowań"
            checked={extended.onlyPackagingWarehouseStock}
            onChange={(v) => patchExtended("onlyPackagingWarehouseStock", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.restrict_templates_to_order_account"
            label="Ogranicz wyświetlanie aktywatora szablonów nadania wyłącznie do tych przypisanych do konta, z którego pochodzi zamówienie"
            checked={extended.restrictTemplatesToOrderAccount}
            onChange={(v) => patchExtended("restrictTemplatesToOrderAccount", v)}
            capability={CAP_NONE}
          />
        </div>
      </Subsection>

      <Subsection title="Paczki">
        <div className="space-y-2">
          <BoolRow
            settingId="packing.auto_fetch_parcel_count_disabled"
            label="Wyłącz automatyczne pobieranie liczby paczek do zamówienia"
            checked={extended.autoFetchParcelCountDisabled}
            onChange={(v) => patchExtended("autoFetchParcelCountDisabled", v)}
            capability={CAP_NONE}
          />
          <BoolRow
            settingId="packing.limit_shipment_labels_to_qty"
            label="Ogranicz ilość generowanych listów przewozowych do ilości z zamówienia"
            checked={extended.limitShipmentLabelsToQty}
            onChange={(v) => patchExtended("limitShipmentLabelsToQty", v)}
            capability={CAP_NONE}
          />
        </div>
      </Subsection>

      <Subsection title="Blokowanie dodatkowych paczek">
        <div className="space-y-2">
          <BoolRow
            settingId="packing.block_extra_parcels_enabled"
            label="Blokuj generowanie dodatkowych paczek dla"
            checked={extended.blockExtraParcelsEnabled}
            onChange={(v) => patchExtended("blockExtraParcelsEnabled", v)}
            capability={CAP_NONE}
            infoKey="packing.block_extra_parcels_for"
          />
        </div>
        {extended.blockExtraParcelsEnabled ? (
          <div className="mt-2">
            <MethodChecklist
              methods={methods}
              selectedIds={extended.blockExtraParcelsMethodIds}
              onToggle={(id) =>
                patchExtended("blockExtraParcelsMethodIds", toggleId(extended.blockExtraParcelsMethodIds, id))
              }
            />
          </div>
        ) : null}
        <div className="mt-3">
          <WmsSettingField
            settingId="packing.parcel_limit_without_manager"
            className="block text-sm font-medium text-slate-700"
          >
            <PackingFieldLabel capability={CAP_NONE}>
              Limit paczek bez potwierdzenia kierownika (umowa własna)
            </PackingFieldLabel>
            <input
              type="number"
              min={0}
              max={99}
              className={numberInputClass}
              value={extended.parcelLimitWithoutManagerConfirm}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) {
                  patchExtended("parcelLimitWithoutManagerConfirm", Math.min(99, Math.max(0, Math.floor(n))));
                }
              }}
            />
          </WmsSettingField>
        </div>
      </Subsection>

      <Subsection title="Szablony zastępcze">
        <BoolRow
          settingId="packing.fallback_legacy_templates"
          label="[BETA] W przypadku braku dostępnych szablonów w nowych integracjach kurierskich korzystaj ze starych integracji"
          checked={extended.fallbackLegacyTemplates}
          onChange={(v) => patchExtended("fallbackLegacyTemplates", v)}
          capability={CAP_NONE}
        />
      </Subsection>

      <Subsection title="Etykieta zastępcza">
        <FieldGrid>
          <SelectField
            settingId="packing.fallback_label_template"
            label="Szablon etykiety zastępczej"
            capability={CAP_PARTIAL}
            capabilityNote="szablon jest sprawdzany; pełny druk etykiety jeszcze nie."
            value={draft.fallback_label.template_id != null ? String(draft.fallback_label.template_id) : ""}
            onChange={(v) => {
              setDraft((d) => {
                const base = d ?? resolveFallbackDraft();
                return {
                  ...base,
                  fallback_label: {
                    ...base.fallback_label,
                    template_id: v === "" ? null : Number(v),
                  },
                };
              });
            }}
          >
            <option value="">— brak —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectField>
          <WmsSettingField settingId="packing.fallback_label_delay" className="block text-sm font-medium text-slate-700">
            <PackingFieldLabel>Opóźnienie etykiety zastępczej</PackingFieldLabel>
            <input
              type="number"
              min={0}
              max={120}
              className={numberInputClass}
              value={draft.fallback_label.delay_seconds}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isFinite(n)) return;
                setDraft((d) => {
                  const base = d ?? resolveFallbackDraft();
                  return {
                    ...base,
                    fallback_label: {
                      ...base.fallback_label,
                      delay_seconds: Math.min(120, Math.max(0, Math.floor(n))),
                    },
                  };
                });
              }}
            />
            <Help>Czas oczekiwania (sekundy) przed drukiem etykiety zastępczej.</Help>
          </WmsSettingField>
        </FieldGrid>
      </Subsection>
    </SectionCard>
  );
}
