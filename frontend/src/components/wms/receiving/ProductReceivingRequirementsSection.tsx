import {
  WmsBoolSettingRow,
  wmsSettingsRowsStackClass,
} from "../../../pages/Settings/wmsSettingsUi";

type Props = {
  requireDimensions: boolean;
  requireWeight: boolean;
  requireBatch: boolean;
  requireExpiry: boolean;
  requireSerial: boolean;
  requireMasterCartonEan: boolean;
  requireMasterCartonQty: boolean;
  requireMasterCartonDims: boolean;
  requireMasterCartonWeight: boolean;
  onChange: (patch: Partial<Record<string, boolean>>) => void;
  disabled?: boolean;
};

/**
 * WMS Przyjęcia → Ogólne: master-data completeness + hard traceability + carton master-data.
 */
export function ProductReceivingRequirementsSection({
  requireDimensions,
  requireWeight,
  requireBatch,
  requireExpiry,
  requireSerial,
  requireMasterCartonEan,
  requireMasterCartonQty,
  requireMasterCartonDims,
  requireMasterCartonWeight,
  onChange,
  disabled,
}: Props) {
  return (
    <div id="wms-validation" className="scroll-mt-24 space-y-6">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Kompletność danych produktu
        </p>
        <p className="mb-2 text-xs text-slate-500">
          Określa, jakie dane produktu są uznawane za wymagane podczas kontroli kompletności. Brak danych
          może zostać uzupełniony podczas pracy z przyjęciem (modal dopuszcza „Pomiń teraz”).
        </p>
        <div className={wmsSettingsRowsStackClass}>
          <WmsBoolSettingRow
            label="Wymagaj wymiarów produktu"
            hint="Wymagane są długość, szerokość i wysokość — każda wartość > 0."
            checked={requireDimensions}
            disabled={disabled}
            onChange={(v) => onChange({ requireDimensions: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj wagi produktu"
            hint="Wymagane jest pole wagi produktu z wartością > 0."
            checked={requireWeight}
            disabled={disabled}
            onChange={(v) => onChange({ requireWeight: v })}
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Identyfikowalność</p>
        <p className="mb-2 text-xs text-slate-500">
          Wymagania egzekwowane podczas fizycznego przyjęcia towaru.
        </p>
        <div className={wmsSettingsRowsStackClass}>
          <WmsBoolSettingRow
            label="Wymagaj numeru partii"
            hint="Operator musi wskazać numer partii dla przyjmowanej ilości."
            checked={requireBatch}
            disabled={disabled}
            onChange={(v) => onChange({ requireBatch: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj daty ważności"
            hint="Operator musi wskazać datę ważności dla przyjmowanej partii."
            checked={requireExpiry}
            disabled={disabled}
            onChange={(v) => onChange({ requireExpiry: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj numeru seryjnego"
            hint="Każda przyjmowana sztuka wymaga unikalnego numeru seryjnego."
            checked={requireSerial}
            disabled={disabled}
            onChange={(v) => onChange({ requireSerial: v })}
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Dane opakowania zbiorczego
        </p>
        <p className="mb-2 text-xs text-slate-500">
          Określa, które dane kartonu zbiorczego są wymagane w master-data produktu. Nie włączają skanowania
          kartonu — rozpoznanie EAN kartonu działa osobno, gdy produkt ma uzupełnione dane.
        </p>
        <div className={wmsSettingsRowsStackClass}>
          <WmsBoolSettingRow
            label="Wymagaj EAN opakowania zbiorczego"
            hint="Kod używany do rozpoznania opakowania zbiorczego podczas skanowania."
            checked={requireMasterCartonEan}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCartonEan: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj ilości w opakowaniu zbiorczym"
            hint="Liczba sztuk produktu znajdujących się w jednym opakowaniu zbiorczym."
            checked={requireMasterCartonQty}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCartonQty: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj wymiarów opakowania zbiorczego"
            hint="Długość, szerokość i wysokość opakowania zbiorczego (każda > 0)."
            checked={requireMasterCartonDims}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCartonDims: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj wagi opakowania zbiorczego"
            hint="Waga pełnego opakowania zbiorczego (> 0)."
            checked={requireMasterCartonWeight}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCartonWeight: v })}
          />
        </div>
      </div>
    </div>
  );
}
