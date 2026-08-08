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
  requireMasterCarton: boolean;
  requireMasterCartonEan: boolean;
  requireMasterCartonQty: boolean;
  requireMasterCartonDims: boolean;
  requireMasterCartonWeight: boolean;
  onChange: (patch: Partial<Record<string, boolean>>) => void;
  disabled?: boolean;
};

/**
 * Product settings: which master-data fields operators should complete during WMS receiving (soft validation).
 */
export function ProductReceivingRequirementsSection({
  requireDimensions,
  requireWeight,
  requireBatch,
  requireExpiry,
  requireSerial,
  requireMasterCarton,
  requireMasterCartonEan,
  requireMasterCartonQty,
  requireMasterCartonDims,
  requireMasterCartonWeight,
  onChange,
  disabled,
}: Props) {
  return (
    <div id="wms-validation" className="scroll-mt-24 space-y-5">
      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Dane produktu</p>
        <div className={wmsSettingsRowsStackClass}>
          <WmsBoolSettingRow
            label="Wymagaj wymiarów produktu"
            checked={requireDimensions}
            disabled={disabled}
            onChange={(v) => onChange({ requireDimensions: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj wagi produktu"
            checked={requireWeight}
            disabled={disabled}
            onChange={(v) => onChange({ requireWeight: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj numeru partii"
            checked={requireBatch}
            disabled={disabled}
            onChange={(v) => onChange({ requireBatch: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj daty ważności"
            checked={requireExpiry}
            disabled={disabled}
            onChange={(v) => onChange({ requireExpiry: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj numeru seryjnego"
            checked={requireSerial}
            disabled={disabled}
            onChange={(v) => onChange({ requireSerial: v })}
          />
        </div>
      </div>

      <div>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Opakowanie zbiorcze</p>
        <div className={wmsSettingsRowsStackClass}>
          <WmsBoolSettingRow
            label="Produkt posiada opakowanie zbiorcze"
            checked={requireMasterCarton}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCarton: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj EAN opakowania zbiorczego"
            checked={requireMasterCartonEan}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCartonEan: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj ilości w opakowaniu zbiorczym"
            checked={requireMasterCartonQty}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCartonQty: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj wymiarów opakowania zbiorczego"
            checked={requireMasterCartonDims}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCartonDims: v })}
          />
          <WmsBoolSettingRow
            label="Wymagaj wagi opakowania zbiorczego"
            checked={requireMasterCartonWeight}
            disabled={disabled}
            onChange={(v) => onChange({ requireMasterCartonWeight: v })}
          />
        </div>
      </div>
    </div>
  );
}
