import type { ReactNode } from "react";
import type { AutomationEffect, AutomationEffectKind } from "../../../../types/orderAutomation";
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

import { oaInp, oaWorkflowFieldLabelClass, oaWorkflowFieldRowClass } from "../orderAutomationUiTokens";

/** Lewa kolumna: zwięzła etykieta operacji (ERP), nie pełna nazwa z katalogu. */
export const EFFECT_BUSINESS_SIDEBAR: Record<
  AutomationEffectKind,
  { title: string; Icon: LucideIcon }
> = {
  change_status: { title: "Status", Icon: CircleDot },
  generate_document: { title: "Dokument", Icon: FileText },
  send_message: { title: "Wiadomość", Icon: Mail },
  print: { title: "Druk", Icon: Printer },
  assign_courier: { title: "Kurier", Icon: Truck },
  add_tag: { title: "Tag", Icon: Tag },
  wms_action: { title: "WMS", Icon: Package },
};

const erpRow = oaWorkflowFieldRowClass;
const erpLbl = oaWorkflowFieldLabelClass;
const erpInp = oaInp;

export type EffectEditorBaseProps = {
  effect: AutomationEffect;
  patchPayload: (partial: Record<string, string | number | boolean | null>) => void;
};

export type ChangeStatusEffectEditorProps = EffectEditorBaseProps & {
  statusOptions: { id: number; name: string }[];
};

export function renderChangeStatusEffectEditor({ effect, patchPayload, statusOptions }: ChangeStatusEffectEditorProps) {
  const v = String(effect.payload.order_ui_status_id ?? "");
  return (
    <div className={erpRow}>
      <span className={erpLbl}>Status docelowy</span>
      <select
        className={erpInp}
        value={v}
        onChange={(e) => patchPayload({ order_ui_status_id: e.target.value })}
      >
        <option value="">— wybierz —</option>
        {statusOptions.map((s) => (
          <option key={s.id} value={String(s.id)}>
            {s.name}
          </option>
        ))}
      </select>
    </div>
  );
}

const DOC_TYPES: { value: string; label: string }[] = [
  { value: "invoice", label: "Faktura" },
  { value: "receipt", label: "Paragon" },
  { value: "wz", label: "WZ" },
  { value: "label", label: "Etykieta" },
  { value: "other", label: "Inny" },
];

const DOC_SERIES: { value: string; label: string }[] = [
  { value: "fv_poland", label: "FV Polska" },
  { value: "fv_ue", label: "FV UE" },
  { value: "proforma", label: "Proforma" },
  { value: "corr", label: "Korekta" },
];

const PRINT_STATIONS: { value: string; label: string }[] = [
  { value: "main", label: "Główna" },
  { value: "warehouse", label: "Magazyn" },
  { value: "office", label: "Biuro" },
];

const COPIES_OPTS = ["1", "2", "3", "4", "5"];

export function renderGenerateDocumentEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  const docType = String(effect.payload.doc_type ?? "");
  const series = String(effect.payload.doc_series ?? "");
  const station = String(effect.payload.print_station ?? "");
  const copies = String(effect.payload.copies ?? "1");
  return (
    <div className="grid min-w-0 gap-y-0">
      <div className={erpRow}>
        <span className={erpLbl}>Typ dokumentu</span>
        <select className={erpInp} value={docType} onChange={(e) => patchPayload({ doc_type: e.target.value })}>
          <option value="">—</option>
          {DOC_TYPES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Seria</span>
        <select className={erpInp} value={series} onChange={(e) => patchPayload({ doc_series: e.target.value })}>
          <option value="">—</option>
          {DOC_SERIES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Stacja druku</span>
        <select
          className={erpInp}
          value={station}
          onChange={(e) => patchPayload({ print_station: e.target.value })}
        >
          <option value="">—</option>
          {PRINT_STATIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Kopie</span>
        <select className={erpInp} value={copies} onChange={(e) => patchPayload({ copies: e.target.value })}>
          {COPIES_OPTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const MESSAGE_TEMPLATES: { value: string; label: string }[] = [
  { value: "order_shipped", label: "Zamówienie wysłane" },
  { value: "payment_reminder", label: "Przypomnienie o płatności" },
  { value: "order_confirmation", label: "Potwierdzenie zamówienia" },
  { value: "pickup_ready", label: "Odbiór gotowy" },
];

const MESSAGE_CHANNELS: { value: string; label: string }[] = [
  { value: "email", label: "E-mail" },
  { value: "sms", label: "SMS" },
  { value: "panel", label: "Panel" },
];

const DELAY_OPTS: { value: string; label: string }[] = [
  { value: "0", label: "Natychmiast" },
  { value: "5", label: "5 min" },
  { value: "10", label: "10 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "60 min" },
];

export function renderSendMessageEffectEditor({ effect, patchPayload }: EffectEditorBaseProps) {
  const template = String(effect.payload.template ?? "");
  const channel = String(effect.payload.message_channel ?? "email");
  const delay = String(effect.payload.delay_min ?? "0");
  return (
    <div className="grid min-w-0 gap-y-0">
      <div className={erpRow}>
        <span className={erpLbl}>Szablon</span>
        <select className={erpInp} value={template} onChange={(e) => patchPayload({ template: e.target.value })}>
          <option value="">—</option>
          {MESSAGE_TEMPLATES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Kanał</span>
        <select
          className={erpInp}
          value={channel}
          onChange={(e) => patchPayload({ message_channel: e.target.value })}
        >
          {MESSAGE_CHANNELS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Opóźnienie</span>
        <select className={erpInp} value={delay} onChange={(e) => patchPayload({ delay_min: e.target.value })}>
          {DELAY_OPTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
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
        <select className={erpInp} value={printer} onChange={(e) => patchPayload({ printer: e.target.value })}>
          <option value="">—</option>
          {PRINTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Dokument</span>
        <select
          className={erpInp}
          value={doc}
          onChange={(e) => patchPayload({ print_document: e.target.value, template: e.target.value })}
        >
          <option value="">—</option>
          {PRINT_DOCUMENTS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className={erpRow}>
        <span className={erpLbl}>Kopie</span>
        <select className={erpInp} value={copies} onChange={(e) => patchPayload({ copies: e.target.value })}>
          {COPIES_OPTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
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
        <select
          className={erpInp}
          value={selectValue}
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
        </select>
      </div>
      {selectValue === "other" ? (
        <div className={erpRow}>
          <span className={erpLbl}>Nazwa</span>
          <input
            className={erpInp}
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
      <input
        className={erpInp}
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
      <input
        className={erpInp}
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
    statusOptions: { id: number; name: string }[];
  },
): ReactNode {
  switch (props.kind) {
    case "change_status":
      return renderChangeStatusEffectEditor({
        effect: props.effect,
        patchPayload: props.patchPayload,
        statusOptions: props.statusOptions,
      });
    case "generate_document":
      return renderGenerateDocumentEffectEditor(props);
    case "send_message":
      return renderSendMessageEffectEditor(props);
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
