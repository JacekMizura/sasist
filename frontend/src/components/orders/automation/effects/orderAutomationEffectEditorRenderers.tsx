import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AutomationEffect, AutomationEffectKind } from "../../../../types/orderAutomation";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../../../types/orderUiStatus";
import {
  CircleDot,
  FileText,
  Mail,
  Package,
  Printer,
  Tag,
  Truck,
  type LucideIcon,
} from "lucide-react";

import { MessageTemplatePicker } from "../../../messaging/MessageTemplatePicker";
import { InternalUserPicker } from "../../../messaging/InternalUserPicker";
import { DAMAGE_TENANT_ID } from "../../../../pages/damage/damageShared";
import { useWarehouse } from "../../../../context/WarehouseContext";
import { PanelStatusHierarchyPicker } from "../../../panel/PanelStatusHierarchyPicker";
import { Input, Select, inputClassName } from "../../../../design-system";
import { listDocumentSeries, type DocumentSeriesDto } from "../../../../api/documentSeriesApi";
import {
  buildGenerateDocumentSeriesOptions,
  generateDocumentSubtypeHelp,
  resolveGenerateDocumentSeriesId,
} from "../../../../utils/orderAutomationGenerateDocumentSeries";
import { oaWorkflowFieldLabelClass, oaWorkflowFieldRowClass } from "../orderAutomationUiTokens";

/** Lewa kolumna: zwięzła etykieta operacji (ERP), nie pełna nazwa z katalogu. */
export const EFFECT_BUSINESS_SIDEBAR: Record<
  AutomationEffectKind,
  { title: string; Icon: LucideIcon }
> = {
  change_status: { title: "Status", Icon: CircleDot },
  generate_document: { title: "Utwórz dokument", Icon: FileText },
  send_email: { title: "E-mail", Icon: Mail },
  send_message: { title: "Wiadomość", Icon: Mail },
  warehouse_commit: { title: "Zwrot WMS", Icon: Package },
  generate_sale_correction: { title: "Korekta FV", Icon: FileText },
  print: { title: "Druk", Icon: Printer },
  assign_courier: { title: "Kurier", Icon: Truck },
  add_tag: { title: "Tag", Icon: Tag },
  wms_action: { title: "WMS", Icon: Package },
};

const erpRow = oaWorkflowFieldRowClass;
const erpLbl = oaWorkflowFieldLabelClass;
const erpFieldDensity = "compact" as const;
const erpInpClass = inputClassName(erpFieldDensity);

export type EffectEditorBaseProps = {
  effect: AutomationEffect;
  patchPayload: (partial: Record<string, string | number | boolean | null>) => void;
};

export type ChangeStatusEffectEditorProps = EffectEditorBaseProps & {
  panelSummary: OrderUiStatusPanelSummary | null;
  panelSubgroups: OrderUiPanelSubgroupRead[];
};

export function renderChangeStatusEffectEditor({ effect, patchPayload, panelSummary, panelSubgroups }: ChangeStatusEffectEditorProps) {
  const raw = effect.payload.order_ui_status_id;
  const selectedId = raw === "" || raw == null ? null : Number(raw);
  const selectedStatusId = selectedId != null && Number.isFinite(selectedId) && selectedId > 0 ? selectedId : null;

  return (
    <div className={erpRow}>
      <span className={erpLbl}>Status docelowy</span>
      <div className="min-w-0 rounded-lg border border-slate-200 bg-white">
        <PanelStatusHierarchyPicker
          panelSummary={panelSummary}
          panelSubgroups={panelSubgroups}
          selectedStatusId={selectedStatusId}
          showClearOption
          clearLabel="— wybierz —"
          listMaxHeightClass="max-h-[min(40vh,16rem)]"
          onPick={(statusId) =>
            patchPayload({ order_ui_status_id: statusId != null ? String(statusId) : "" })
          }
        />
      </div>
    </div>
  );
}

const PRINT_STATIONS: { value: string; label: string }[] = [
  { value: "main", label: "Główna" },
  { value: "warehouse", label: "Magazyn" },
  { value: "office", label: "Biuro" },
];

const COPIES_OPTS = ["1", "2", "3", "4", "5"];

export function GenerateDocumentEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  const { warehouse, warehouses, showWarehouseSelector } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const [series, setSeries] = useState<DocumentSeriesDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (warehouseId == null || warehouseId < 1) {
      setSeries([]);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    void listDocumentSeries(DAMAGE_TENANT_ID, warehouseId)
      .then((rows) => {
        if (!cancelled) setSeries(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) {
          setSeries([]);
          setLoadError("Nie udało się wczytać serii dokumentów.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [warehouseId]);

  const warehouseNameById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const w of warehouses) {
      map[Number(w.id)] = String(w.name || `Magazyn #${w.id}`);
    }
    return map;
  }, [warehouses]);

  const options = useMemo(
    () =>
      buildGenerateDocumentSeriesOptions(series, {
        warehouseId,
        warehouseNameById,
        showWarehouse: Boolean(showWarehouseSelector && warehouses.length > 1),
      }),
    [series, warehouseId, warehouseNameById, showWarehouseSelector, warehouses.length],
  );

  const selectedId = resolveGenerateDocumentSeriesId(effect.payload);
  const selectedOption = options.find((o) => o.seriesId === selectedId) ?? null;
  const help = generateDocumentSubtypeHelp(selectedOption?.subtype);

  useEffect(() => {
    if (loading || warehouseId == null) return;
    if (!selectedId) return;
    if (options.some((o) => o.seriesId === selectedId)) return;
    if (options.length === 0) return;
    patchPayload({ series_id: "", doc_series: "" });
  }, [loading, warehouseId, selectedId, options, patchPayload]);

  return (
    <div className="grid min-w-0 gap-y-0">
      <div className={erpRow}>
        <span className={erpLbl}>
          Seria dokumentu <span className="text-red-600">*</span>
        </span>
        {warehouseId == null ? (
          <p className="m-0 text-xs text-slate-600">Wybierz aktywny magazyn, aby zobaczyć dostępne serie.</p>
        ) : loading ? (
          <p className="m-0 text-xs text-slate-500">Ładowanie serii…</p>
        ) : loadError ? (
          <p className="m-0 text-xs text-red-600">{loadError}</p>
        ) : options.length === 0 ? (
          <p className="m-0 text-xs text-slate-600">
            Brak aktywnych serii WZ lub RZ dla tego magazynu. Dodaj je w Dokumenty → Serie dokumentów.
          </p>
        ) : (
          <Select
            density={erpFieldDensity}
            value={selectedOption ? selectedId : ""}
            onChange={(e) => {
              const v = e.target.value;
              patchPayload({ series_id: v, doc_series: v || null });
            }}
            aria-label="Seria dokumentu"
          >
            <option value="">— wybierz serię —</option>
            {options.map((o) => (
              <option key={o.seriesId} value={o.seriesId}>
                {o.optionLabel}
              </option>
            ))}
          </Select>
        )}
      </div>
      {help ? (
        <p className="m-0 mt-1 max-w-prose text-[11px] leading-snug text-slate-600">{help}</p>
      ) : null}
    </div>
  );
}

export function renderGenerateDocumentEffectEditor(props: EffectEditorBaseProps) {
  return <GenerateDocumentEffectEditor {...props} />;
}

export function SendEmailEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  const { warehouse } = useWarehouse();
  const raw = effect.payload.template_id ?? effect.payload.template;
  const selected =
    raw === "" || raw == null ? ("" as const) : Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : ("" as const);
  const recipientType = String(effect.payload.recipient_type || "CUSTOMER").toUpperCase() === "INTERNAL" ? "INTERNAL" : "CUSTOMER";
  const userIdRaw = effect.payload.user_id;
  const userId =
    userIdRaw === "" || userIdRaw == null
      ? ("" as const)
      : Number.isFinite(Number(userIdRaw)) && Number(userIdRaw) > 0
        ? Number(userIdRaw)
        : ("" as const);
  return (
    <div className="grid min-w-0 gap-y-0">
      <div className={erpRow}>
        <span className={erpLbl}>Odbiorca</span>
        <Select density={erpFieldDensity} value={recipientType}
          onChange={(e) =>
            patchPayload({
              recipient_type: e.target.value,
              ...(e.target.value === "CUSTOMER" ? { user_id: "" } : {}),
            })
          }
        >
          <option value="CUSTOMER">Klient</option>
          <option value="INTERNAL">Użytkownik wewnętrzny</option>
        </Select>
      </div>
      {recipientType === "INTERNAL" ? (
        <div className={erpRow}>
          <span className={erpLbl}>Użytkownik</span>
          <InternalUserPicker
            value={userId}
            inputClassName={erpInpClass}
            onChange={(id) => patchPayload({ user_id: id === "" ? "" : id, recipient_type: "INTERNAL" })}
          />
        </div>
      ) : null}
      <div className={erpRow}>
        <span className={erpLbl}>Szablon</span>
        <div className="min-w-0 flex-1">
          <MessageTemplatePicker
            tenantId={DAMAGE_TENANT_ID}
            warehouseId={warehouse?.id ?? null}
            entityType="ORDER"
            value={selected}
            inputClassName={erpInpClass}
            onChange={(id) =>
              patchPayload({
                template_id: id === "" ? "" : id,
                recipient_type: recipientType,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function renderSendEmailEffectEditor(props: EffectEditorBaseProps) {
  return <SendEmailEffectEditor {...props} />;
}

export function WarehouseCommitEffectEditor(_props: EffectEditorBaseProps) {
  return (
    <p className="px-1 py-2 text-xs text-slate-600">
      Wywołuje legalny commit magazynowy zwrotu (Z-PZ / przyjęcie). Działa tylko dla reguł RETURN, gdy linie RMZ są
      gotowe. Nie wykonuje zwrotu płatności.
    </p>
  );
}

export function renderWarehouseCommitEffectEditor(props: EffectEditorBaseProps) {
  return <WarehouseCommitEffectEditor {...props} />;
}

export function GenerateSaleCorrectionEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  const includeShipping = Boolean(effect.payload.include_shipping_cost);
  return (
    <div className="space-y-2 px-1 py-2">
      <p className="text-xs text-slate-600">
        Wystawia korektę faktury na podstawie finalnie przyjętych pozycji zwrotu. Wymaga wcześniejszego przyjęcia w
        magazynie.
      </p>
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
          checked={includeShipping}
          onChange={(e) => patchPayload({ include_shipping_cost: e.target.checked })}
        />
        <span className="text-sm text-slate-800">Uwzględnij koszt dostawy</span>
      </label>
    </div>
  );
}

export function renderGenerateSaleCorrectionEffectEditor(props: EffectEditorBaseProps) {
  return <GenerateSaleCorrectionEffectEditor {...props} />;
}

const PRINTERS: { value: string; label: string }[] = [
  { value: "zebra_1", label: "Zebra #1" },
  { value: "zebra_2", label: "Zebra #2" },
  { value: "office_hp", label: "Biuro HP" },
  { value: "reception", label: "Recepcja" },
];

const PRINT_DOCUMENTS: { value: string; label: string }[] = [
  { value: "shipping_label", label: "Etykieta wysyłki" },
  { value: "order_summary", label: "Podsumowanie zamówienia" },
  { value: "invoice_copy", label: "Kopia faktury" },
  { value: "wz", label: "WZ" },
];

export function renderPrintEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  const printer = String(effect.payload.printer ?? "");
  const doc =
    String(effect.payload.print_document ?? "") ||
    String(effect.payload.template ?? "");
  const copies = String(effect.payload.copies ?? "1");
  return (
    <div className="grid min-w-0 gap-y-0">
      <div className={erpRow}>
        <span className={erpLbl}>Drukarka</span>
        <Select density={erpFieldDensity} value={printer} onChange={(e) => patchPayload({ printer: e.target.value })}>
          <option value="">—</option>
          {PRINTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Dokument</span>
        <Select density={erpFieldDensity} value={doc}
          onChange={(e) => patchPayload({ print_document: e.target.value, template: e.target.value })}
        >
          <option value="">—</option>
          {PRINT_DOCUMENTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Kopie</span>
        <Select density={erpFieldDensity} value={copies} onChange={(e) => patchPayload({ copies: e.target.value })}>
          {COPIES_OPTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}

const COURIERS: { value: string; label: string }[] = [
  { value: "dpd", label: "DPD" },
  { value: "inpost", label: "InPost" },
  { value: "orlen", label: "ORLEN Paczka" },
  { value: "dhl", label: "DHL" },
  { value: "poczta", label: "Poczta Polska" },
  { value: "other", label: "Inny (wpisz)" },
];

export function renderAssignCourierEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  const courier = String(effect.payload.courier ?? "");
  const presetStored = String(effect.payload.courier_preset ?? "");
  const matchByValue = COURIERS.find(
    (o) =>
      o.value !== "other" &&
      (o.value === courier ||
        o.value === courier.toLowerCase() ||
        o.label === courier ||
        o.label.toLowerCase() === courier.toLowerCase()),
  );
  const selectValue =
    presetStored ||
    (matchByValue ? matchByValue.value : courier ? "other" : "");

  return (
    <div className="grid min-w-0 gap-y-0">
      <div className={erpRow}>
        <span className={erpLbl}>Przewoźnik</span>
        <Select density={erpFieldDensity} value={selectValue}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "other") patchPayload({ courier_preset: "other" });
            else {
              const o = COURIERS.find((x) => x.value === v);
              patchPayload({ courier_preset: v, courier: o?.label ?? v });
            }
          }}
        >
          <option value="">—</option>
          {COURIERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {selectValue === "other" ? (
        <div className={erpRow}>
          <span className={erpLbl}>Nazwa</span>
          <Input
            density={erpFieldDensity}
            placeholder="np. kurier lokalny"
            value={courier}
            onChange={(e) => patchPayload({ courier: e.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}

export function renderAddTagEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  return (
    <div className={erpRow}>
      <span className={erpLbl}>Treść tagu</span>
      <Input
        density={erpFieldDensity}
        placeholder="np. pilne, faktura"
        value={String(effect.payload.tag ?? "")}
        onChange={(e) => patchPayload({ tag: e.target.value })}
      />
    </div>
  );
}

export function renderWmsActionEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  return (
    <div className={erpRow}>
      <span className={erpLbl}>Klucz akcji</span>
      <Input
        density={erpFieldDensity}
        placeholder="np. release_line, pick_confirm"
        value={String(effect.payload.action_key ?? "")}
        onChange={(e) => patchPayload({ action_key: e.target.value })}
      />
    </div>
  );
}

/** Router wyłącznie do wywołania właściwego edytora — bez generycznego formularza pól. */
export function renderAutomationEffectConfigEditor(
  props: EffectEditorBaseProps & {
    kind: AutomationEffectKind;
    panelSummary: OrderUiStatusPanelSummary | null;
    panelSubgroups: OrderUiPanelSubgroupRead[];
  },
): ReactNode {
  switch (props.kind) {
    case "change_status":
      return renderChangeStatusEffectEditor({
        effect: props.effect,
        patchPayload: props.patchPayload,
        panelSummary: props.panelSummary,
        panelSubgroups: props.panelSubgroups,
      });
    case "generate_document":
      return <GenerateDocumentEffectEditor effect={props.effect} patchPayload={props.patchPayload} />;
    case "send_email":
      return renderSendEmailEffectEditor(props);
    case "send_message":
      return renderSendEmailEffectEditor(props);
    case "warehouse_commit":
      return renderWarehouseCommitEffectEditor(props);
    case "generate_sale_correction":
      return renderGenerateSaleCorrectionEffectEditor(props);
    case "print":
      return renderPrintEffectEditor(props);
    case "assign_courier":
      return renderAssignCourierEffectEditor(props);
    case "add_tag":
      return renderAddTagEffectEditor(props);
    case "wms_action":
      return renderWmsActionEffectEditor(props);
    default:
      return null;
  }
}
