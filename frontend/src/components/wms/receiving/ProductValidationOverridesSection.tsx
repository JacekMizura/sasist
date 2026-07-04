import { Link } from "react-router-dom";

export type ProductValidationGlobalSettings = {
  require_dimensions: boolean;
  require_weight: boolean;
  require_batch: boolean;
  require_expiry: boolean;
  require_serial: boolean;
  require_master_carton: boolean;
  require_master_carton_ean: boolean;
  require_master_carton_qty: boolean;
  require_master_carton_dims: boolean;
  require_master_carton_weight: boolean;
};

export type ProductValidationSkips = {
  validation_skip_dimensions: boolean;
  validation_skip_weight: boolean;
  validation_skip_batch: boolean;
  validation_skip_expiry: boolean;
  validation_skip_serial: boolean;
  validation_skip_master_carton: boolean;
  validation_skip_master_carton_ean: boolean;
  validation_skip_master_carton_qty: boolean;
  validation_skip_master_carton_dims: boolean;
  validation_skip_master_carton_weight: boolean;
};

type Props = {
  global: ProductValidationGlobalSettings | null;
  skips: ProductValidationSkips;
  onChange: (patch: Partial<ProductValidationSkips>) => void;
  disabled?: boolean;
};

function SkipRow({
  checked,
  onChange,
  label,
  disabled,
  globalEnabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  globalEnabled: boolean;
}) {
  if (!globalEnabled) return null;
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
      />
      <span>{label}</span>
    </label>
  );
}

/** Per-product overrides: wyłączenie globalnych wymagań WMS dla tego produktu. */
export function ProductValidationOverridesSection({ global, skips, onChange, disabled }: Props) {
  const g = global;

  return (
    <div id="wms-validation" className="scroll-mt-24 space-y-4 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
      <div>
        <h4 className="text-sm font-black text-slate-900">Wyłączenia walidacji (ten produkt)</h4>
        <p className="mt-1 text-xs text-slate-600">
          Wymagania globalne konfigurujesz w{" "}
          <Link to="/settings/wms" className="font-semibold text-indigo-800 underline hover:text-indigo-950">
            Ustawienia → WMS → Przyjęcia → Walidacja produktów
          </Link>
          . Tutaj możesz wyłączyć wybrane reguły tylko dla tego SKU.
        </p>
      </div>

      {!g ? (
        <p className="text-sm text-slate-500">Wczytywanie ustawień globalnych…</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <SkipRow
            globalEnabled={g.require_dimensions}
            checked={skips.validation_skip_dimensions}
            onChange={(v) => onChange({ validation_skip_dimensions: v })}
            label="Nie wymagaj wymiarów produktu dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_weight}
            checked={skips.validation_skip_weight}
            onChange={(v) => onChange({ validation_skip_weight: v })}
            label="Nie wymagaj wagi produktu dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_batch}
            checked={skips.validation_skip_batch}
            onChange={(v) => onChange({ validation_skip_batch: v })}
            label="Nie wymagaj numeru partii dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_expiry}
            checked={skips.validation_skip_expiry}
            onChange={(v) => onChange({ validation_skip_expiry: v })}
            label="Nie wymagaj daty ważności dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_serial}
            checked={skips.validation_skip_serial}
            onChange={(v) => onChange({ validation_skip_serial: v })}
            label="Nie wymagaj numeru seryjnego dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_master_carton}
            checked={skips.validation_skip_master_carton}
            onChange={(v) => onChange({ validation_skip_master_carton: v })}
            label="Nie wymagaj opakowania zbiorczego dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_master_carton_ean}
            checked={skips.validation_skip_master_carton_ean}
            onChange={(v) => onChange({ validation_skip_master_carton_ean: v })}
            label="Nie wymagaj EAN opakowania zbiorczego dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_master_carton_qty}
            checked={skips.validation_skip_master_carton_qty}
            onChange={(v) => onChange({ validation_skip_master_carton_qty: v })}
            label="Nie wymagaj ilości w opakowaniu dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_master_carton_dims}
            checked={skips.validation_skip_master_carton_dims}
            onChange={(v) => onChange({ validation_skip_master_carton_dims: v })}
            label="Nie wymagaj wymiarów opakowania dla tego produktu"
            disabled={disabled}
          />
          <SkipRow
            globalEnabled={g.require_master_carton_weight}
            checked={skips.validation_skip_master_carton_weight}
            onChange={(v) => onChange({ validation_skip_master_carton_weight: v })}
            label="Nie wymagaj wagi opakowania dla tego produktu"
            disabled={disabled}
          />
        </div>
      )}

      {g &&
      !g.require_dimensions &&
      !g.require_weight &&
      !g.require_batch &&
      !g.require_expiry &&
      !g.require_serial &&
      !g.require_master_carton &&
      !g.require_master_carton_ean &&
      !g.require_master_carton_qty &&
      !g.require_master_carton_dims &&
      !g.require_master_carton_weight ? (
        <p className="text-sm text-slate-500">Brak aktywnych globalnych wymagań — wyłączenia nie są potrzebne.</p>
      ) : null}
    </div>
  );
}
