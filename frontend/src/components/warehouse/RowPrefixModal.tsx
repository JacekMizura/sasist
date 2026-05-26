import { useState, useEffect } from "react";
import { generateRackNames, normalizeRowPrefixLetters, nextRowPrefixLetters } from "./warehouseUtils";

export type RowCountDirection = "LTR" | "RTL";

export type RowPrefixRowConfig = {
  rowPrefix: string;
  rack_direction: RowCountDirection;
  bin_direction: RowCountDirection;
  /** `preset:<id>` or `custom:<uuid>`; omit or empty for no template. */
  templateKey?: string;
  /** When true and a template is selected, create racks immediately; when false with template, store templateId on row only. */
  autoFill?: boolean;
};

export type RowPrefixModalResult = {
  paired: boolean;
  row1: RowPrefixRowConfig;
  row2?: RowPrefixRowConfig;
};

export type RowTemplateOption = {
  key: string;
  label: string;
  summary?: string;
};

export type RowPrefixModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: RowPrefixModalResult) => void;
  defaultPrefix?: string;
  /** When false (e.g. catalog stamp), direction UI is hidden and confirm uses LTR for both. */
  showDirection?: boolean;
  defaultRackDirection?: RowCountDirection;
  defaultBinDirection?: RowCountDirection;
  /** If set, OK runs this first; on non-null return, modal stays open and shows the error. */
  validateBeforeConfirm?: (result: RowPrefixModalResult) => string | null;
  /** Show paired-aisle row UI (two row_containers in one draw). */
  allowPaired?: boolean;
  /** Racks per row for preview when not using per-template counts (empty row or single row). */
  previewRackCount?: number;
  /** User templates only; empty array shows “no templates” state. */
  templateOptions?: RowTemplateOption[];
  /** Initial selection for both rows (from catalog item used to start the draw). */
  defaultTemplateKey?: string;
  /** Default for “Wypełnij automatycznie” (e.g. true when drawing from catalog template, false for empty row). */
  defaultAutoFill?: boolean;
  /** When true, rząd 1 may confirm with auto-fill and no dropdown pick (preset / drag item not in user template list). */
  allowAutoFillWithoutTemplateSelection?: boolean;
  /** Preview rack count for a template key (paired + template draw). */
  getTemplatePreviewRackCount?: (templateKey: string) => number;
};

const dirSelectClass =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 mb-3 bg-white";

function formatNamePreview(prefix: string, count: number, label: string): string | null {
  if (count <= 0) return null;
  const p = normalizeRowPrefixLetters(prefix);
  const cap = Math.min(count, 8);
  const names = generateRackNames(p, cap);
  const more = count > cap ? `, … (+${count - cap})` : "";
  return `${label} ${p}: ${names.join(", ")}${more}`;
}

export function RowPrefixModal({
  open,
  onClose,
  onConfirm,
  defaultPrefix = "A",
  showDirection = true,
  defaultRackDirection = "LTR",
  defaultBinDirection = "LTR",
  validateBeforeConfirm,
  allowPaired = false,
  previewRackCount = 0,
  templateOptions,
  defaultTemplateKey,
  defaultAutoFill = false,
  allowAutoFillWithoutTemplateSelection = false,
  getTemplatePreviewRackCount,
}: RowPrefixModalProps) {
  const [paired, setPaired] = useState(false);
  const [prefix, setPrefix] = useState(defaultPrefix);
  const [rackDirection, setRackDirection] = useState<RowCountDirection>(defaultRackDirection);
  const [binDirection, setBinDirection] = useState<RowCountDirection>(defaultBinDirection);
  const [prefix2, setPrefix2] = useState(() => nextRowPrefixLetters(defaultPrefix));
  const [rackDirection2, setRackDirection2] = useState<RowCountDirection>(defaultRackDirection);
  const [binDirection2, setBinDirection2] = useState<RowCountDirection>(defaultBinDirection === "LTR" ? "RTL" : "LTR");
  const [templateKey1, setTemplateKey1] = useState("");
  const [templateKey2, setTemplateKey2] = useState("");
  const [autoFill1, setAutoFill1] = useState(false);
  const [autoFill2, setAutoFill2] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const inRowTemplateContext = templateOptions !== undefined;
  const hasTemplateChoices = (templateOptions?.length ?? 0) > 0;
  const showTemplateUi = Boolean(showDirection && inRowTemplateContext);
  const autoFillAllowed = hasTemplateChoices;
  const confirmDisabled =
    (autoFillAllowed &&
      autoFill1 &&
      !templateKey1 &&
      hasTemplateChoices &&
      !allowAutoFillWithoutTemplateSelection) ||
    (Boolean(allowPaired && paired) && autoFillAllowed && autoFill2 && !templateKey2 && hasTemplateChoices);

  useEffect(() => {
    if (open) {
      setPaired(false);
      setPrefix(defaultPrefix);
      setRackDirection(defaultRackDirection);
      setBinDirection(defaultBinDirection);
      setPrefix2(nextRowPrefixLetters(defaultPrefix));
      setRackDirection2(defaultRackDirection);
      setBinDirection2(defaultBinDirection === "LTR" ? "RTL" : "LTR");
      setFieldError(null);
      const opts = templateOptions ?? [];
      const def =
        defaultTemplateKey && opts.some((o) => o.key === defaultTemplateKey)
          ? defaultTemplateKey
          : "";
      setTemplateKey1(def);
      setTemplateKey2(def);
      const af = Boolean(defaultAutoFill && opts.length > 0);
      setAutoFill1(af);
      setAutoFill2(af);
    }
  }, [open, defaultPrefix, defaultRackDirection, defaultBinDirection, defaultTemplateKey, defaultAutoFill, templateOptions]);

  const applyPairedDefaultsFromRow1 = (p: string, rack: RowCountDirection, bin: RowCountDirection) => {
    setPrefix2(nextRowPrefixLetters(p));
    setRackDirection2(rack);
    setBinDirection2(bin === "LTR" ? "RTL" : "LTR");
  };

  const previewCount1 =
    showTemplateUi && hasTemplateChoices && autoFill1 && getTemplatePreviewRackCount && templateKey1
      ? getTemplatePreviewRackCount(templateKey1)
      : previewRackCount;
  const previewCount2 =
    showTemplateUi && hasTemplateChoices && autoFill2 && getTemplatePreviewRackCount && templateKey2
      ? getTemplatePreviewRackCount(templateKey2)
      : previewRackCount;

  const handleConfirm = () => {
    const row1Base: RowPrefixRowConfig = {
      rowPrefix: normalizeRowPrefixLetters(prefix),
      rack_direction: showDirection ? rackDirection : "LTR",
      bin_direction: showDirection ? binDirection : "LTR",
    };
    const row1: RowPrefixRowConfig = {
      ...row1Base,
      autoFill: autoFillAllowed ? autoFill1 : false,
      ...(templateKey1 ? { templateKey: templateKey1 } : {}),
    };

    const result: RowPrefixModalResult =
      allowPaired && showDirection && paired
        ? {
            paired: true,
            row1,
            row2: {
              rowPrefix: normalizeRowPrefixLetters(prefix2),
              rack_direction: rackDirection2,
              bin_direction: binDirection2,
              autoFill: autoFillAllowed ? autoFill2 : false,
              ...(templateKey2 ? { templateKey: templateKey2 } : {}),
            },
          }
        : { paired: false, row1 };

    if (confirmDisabled) return;

    if (validateBeforeConfirm) {
      const err = validateBeforeConfirm(result);
      if (err) {
        setFieldError(err);
        return;
      }
    }
    setFieldError(null);
    onConfirm(result);
    onClose();
  };

  const preview1 =
    showDirection && previewCount1 > 0 ? formatNamePreview(prefix, previewCount1, "Rząd 1") : null;
  const preview2 =
    allowPaired && paired && showDirection && previewCount2 > 0
      ? formatNamePreview(prefix2, previewCount2, "Rząd 2")
      : null;

  if (!open) return null;

  const templateSelect = (
    value: string,
    onChange: (k: string) => void,
    id: string,
    autoFill: boolean,
    onAutoFillChange: (v: boolean) => void,
    autoFillId: string
  ) => (
    <>
      <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor={id}>
        Szablon regału
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setFieldError(null);
        }}
        disabled={!hasTemplateChoices}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 mb-2 bg-white disabled:opacity-60"
      >
        <option value="">— Brak —</option>
        {(templateOptions ?? []).map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
            {o.summary ? ` (${o.summary})` : ""}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-2 mb-2 text-sm text-slate-700 cursor-pointer select-none">
        <input
          type="checkbox"
          id={autoFillId}
          checked={autoFill}
          disabled={!autoFillAllowed}
          onChange={(e) => {
            onAutoFillChange(e.target.checked);
            setFieldError(null);
          }}
          className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-400 disabled:opacity-50"
        />
        Wypełnij automatycznie
      </label>
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="row-prefix-modal-title"
    >
      <div
        className={`rounded-xl border border-slate-200 bg-white p-4 shadow-lg w-full ${allowPaired ? "max-w-md" : "max-w-sm"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="row-prefix-modal-title" className="text-base font-semibold text-slate-800 mb-3">
          Wybierz indeks rzędu
        </h2>

        {allowPaired && showDirection && (
          <label className="flex items-center gap-2 mb-3 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={paired}
              onChange={(e) => {
                const on = e.target.checked;
                setPaired(on);
                if (on) {
                  applyPairedDefaultsFromRow1(prefix, rackDirection, binDirection);
                  setTemplateKey2(templateKey1);
                  setAutoFill2(autoFill1);
                }
                setFieldError(null);
              }}
              className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-400"
            />
            Utwórz podwójny rząd (alejka)
          </label>
        )}

        <div className={paired && allowPaired ? "border border-slate-100 rounded-lg p-3 mb-3 bg-slate-50/80" : ""}>
          <p className="text-xs font-medium text-slate-500 mb-2">{paired && allowPaired ? "Rząd 1 (pierwszy)" : "Prefix rzędu"}</p>
          <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="row-prefix-input">
            Prefix rzędu
          </label>
          <input
            id="row-prefix-input"
            type="text"
            value={prefix}
            onChange={(e) => {
              const v = e.target.value.replace(/[^A-Za-z]/g, "");
              setPrefix(v);
              if (paired && allowPaired) applyPairedDefaultsFromRow1(v, rackDirection, binDirection);
              setFieldError(null);
            }}
            placeholder="A"
            maxLength={4}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 mb-1 ${
              fieldError ? "border-red-400 ring-1 ring-red-200" : "border-slate-200"
            }`}
            aria-invalid={fieldError != null}
            aria-describedby={fieldError ? "row-prefix-error" : undefined}
            autoFocus
          />
          {showDirection && (
            <>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="row-rack-direction-select">
                Kierunek numeracji regałów
              </label>
              <select
                id="row-rack-direction-select"
                value={rackDirection}
                onChange={(e) => {
                  const v = e.target.value as RowCountDirection;
                  setRackDirection(v);
                  if (paired && allowPaired) setRackDirection2(v);
                  setFieldError(null);
                }}
                className={dirSelectClass}
              >
                <option value="LTR">Lewo → prawo</option>
                <option value="RTL">Prawo → lewo</option>
              </select>
              <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="row-bin-direction-select">
                Kierunek numeracji lokalizacji
              </label>
              <select
                id="row-bin-direction-select"
                value={binDirection}
                onChange={(e) => {
                  const v = e.target.value as RowCountDirection;
                  setBinDirection(v);
                  if (paired && allowPaired) setBinDirection2(v === "LTR" ? "RTL" : "LTR");
                  setFieldError(null);
                }}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 mb-2 bg-white"
              >
                <option value="LTR">Lewo → prawo</option>
                <option value="RTL">Prawo → lewo</option>
              </select>
            </>
          )}
          {showTemplateUi && !hasTemplateChoices && (
            <p
              className="text-xs text-amber-900 bg-amber-50 border border-amber-100 rounded-lg p-2 mb-2"
              role="status"
            >
              Brak szablonów — utwórz nowy
            </p>
          )}
          {showTemplateUi &&
            templateSelect(
              templateKey1,
              setTemplateKey1,
              "row-template-select-1",
              autoFill1,
              setAutoFill1,
              "row-autofill-1"
            )}
        </div>

        {allowPaired && paired && showDirection && (
          <div className="border border-slate-100 rounded-lg p-3 mb-3 bg-slate-50/80">
            <p className="text-xs font-medium text-slate-500 mb-2">Rząd 2 (naprzeciwko)</p>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="row-prefix-input-2">
              Prefix rzędu
            </label>
            <input
              id="row-prefix-input-2"
              type="text"
              value={prefix2}
              onChange={(e) => {
                setPrefix2(e.target.value.replace(/[^A-Za-z]/g, ""));
                setFieldError(null);
              }}
              placeholder="B"
              maxLength={4}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 mb-2"
            />
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="row-rack-direction-select-2">
              Kierunek numeracji regałów
            </label>
            <select
              id="row-rack-direction-select-2"
              value={rackDirection2}
              onChange={(e) => setRackDirection2(e.target.value as RowCountDirection)}
              className={dirSelectClass}
            >
              <option value="LTR">Lewo → prawo</option>
              <option value="RTL">Prawo → lewo</option>
            </select>
            <label className="block text-xs font-medium text-slate-600 mb-1" htmlFor="row-bin-direction-select-2">
              Kierunek numeracji lokalizacji
            </label>
            <select
              id="row-bin-direction-select-2"
              value={binDirection2}
              onChange={(e) => setBinDirection2(e.target.value as RowCountDirection)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-cyan-400 focus:border-cyan-400 mb-2 bg-white"
            >
              <option value="LTR">Lewo → prawo</option>
              <option value="RTL">Prawo → lewo</option>
            </select>
            {showTemplateUi &&
              templateSelect(
                templateKey2,
                setTemplateKey2,
                "row-template-select-2",
                autoFill2,
                setAutoFill2,
                "row-autofill-2"
              )}
          </div>
        )}

        {(preview1 || preview2) && (
          <div className="text-xs text-slate-600 mb-3 space-y-1 font-mono bg-slate-50 border border-slate-100 rounded-lg p-2">
            {preview1 && <p>{preview1}</p>}
            {preview2 && <p>{preview2}</p>}
          </div>
        )}

        {fieldError ? (
          <p id="row-prefix-error" className="text-xs text-red-600 mb-3" role="alert">
            {fieldError}
          </p>
        ) : (
          <div className="mb-2" aria-hidden />
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={confirmDisabled}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 disabled:pointer-events-none"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
