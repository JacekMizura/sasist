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

function CheckRow({
  checked,
  onChange,
  label,
  disabled,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span>
        {label}
        {hint ? <span className="mt-0.5 block text-xs font-normal text-slate-500">{hint}</span> : null}
      </span>
    </label>
  );
}

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
    <div id="wms-validation" className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-5 scroll-mt-24">
      <div>
        <h4 className="text-sm font-black text-slate-900">Wymagania globalne</h4>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Dane produktu</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <CheckRow
            checked={requireDimensions}
            onChange={(v) => onChange({ requireDimensions: v })}
            label="Wymagaj wymiarów produktu"
            disabled={disabled}
          />
          <CheckRow
            checked={requireWeight}
            onChange={(v) => onChange({ requireWeight: v })}
            label="Wymagaj wagi produktu"
            disabled={disabled}
          />
          <CheckRow
            checked={requireBatch}
            onChange={(v) => onChange({ requireBatch: v })}
            label="Wymagaj numeru partii"
            disabled={disabled}
          />
          <CheckRow
            checked={requireExpiry}
            onChange={(v) => onChange({ requireExpiry: v })}
            label="Wymagaj daty ważności"
            disabled={disabled}
          />
          <CheckRow
            checked={requireSerial}
            onChange={(v) => onChange({ requireSerial: v })}
            label="Wymagaj numeru seryjnego"
            disabled={disabled}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Opakowanie zbiorcze</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <CheckRow
            checked={requireMasterCarton}
            onChange={(v) => onChange({ requireMasterCarton: v })}
            label="Produkt posiada opakowanie zbiorcze"
            disabled={disabled}
          />
          <CheckRow
            checked={requireMasterCartonEan}
            onChange={(v) => onChange({ requireMasterCartonEan: v })}
            label="Wymagaj EAN opakowania zbiorczego"
            disabled={disabled}
          />
          <CheckRow
            checked={requireMasterCartonQty}
            onChange={(v) => onChange({ requireMasterCartonQty: v })}
            label="Wymagaj ilości w opakowaniu zbiorczym"
            disabled={disabled}
          />
          <CheckRow
            checked={requireMasterCartonDims}
            onChange={(v) => onChange({ requireMasterCartonDims: v })}
            label="Wymagaj wymiarów opakowania zbiorczego"
            disabled={disabled}
          />
          <CheckRow
            checked={requireMasterCartonWeight}
            onChange={(v) => onChange({ requireMasterCartonWeight: v })}
            label="Wymagaj wagi opakowania zbiorczego"
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  );
}
