import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import type { PackagingSuggestionApi, WmsPackingRecommendedCartonApi } from "../../../api/wmsPackingApi";
import { useWmsScanner } from "../../../context/WmsScannerContext";
import { normalizeScanEan } from "../../../utils/wmsScanNormalize";
import { AppOverlayPortal } from "../../overlay";

function cartonScanCode(c: WmsPackingRecommendedCartonApi): string {
  const barcode = (c.barcode ?? "").trim();
  if (barcode) return barcode;
  const ean = (c.ean ?? "").trim();
  if (ean) return ean;
  return String(c.id || "").trim();
}

function CartonBarcode({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const el = svgRef.current;
    const code = value.trim();
    if (!el || !code) return;
    try {
      JsBarcode(el, code, {
        format: "CODE128",
        width: 1.1,
        height: 28,
        margin: 0,
        displayValue: false,
        background: "#ffffff",
        lineColor: "#0f172a",
      });
    } catch {
      /* invalid value for CODE128 — leave empty */
    }
  }, [value]);
  if (!value.trim()) return null;
  return (
    <svg
      ref={svgRef}
      className="mx-auto h-7 w-full max-w-[9.5rem] text-slate-900"
      role="img"
      aria-label={`Kod ${value}`}
    />
  );
}

function CartonThumb({ url }: { url?: string | null }) {
  if (url?.trim()) {
    return (
      <img
        src={url.trim()}
        alt=""
        className="h-[4.75rem] w-full bg-white object-contain sm:h-[5.25rem]"
      />
    );
  }
  return (
    <div
      className="flex h-[4.75rem] w-full items-center justify-center bg-white text-2xl text-slate-300 sm:h-[5.25rem]"
      aria-hidden
    >
      ▢
    </div>
  );
}

function matchCartonByScan(
  cartons: WmsPackingRecommendedCartonApi[],
  raw: string,
): WmsPackingRecommendedCartonApi | null {
  const scan = normalizeScanEan(raw);
  if (!scan) return null;
  const norm = scan.toLowerCase();
  for (const c of cartons) {
    const candidates = [cartonScanCode(c), c.id, c.ean ?? "", c.barcode ?? ""]
      .map((x) => normalizeScanEan(String(x)).toLowerCase())
      .filter(Boolean);
    if (candidates.includes(norm)) return c;
  }
  return null;
}

export type PackingCartonGateModalProps = {
  open: boolean;
  /** Logo metody wysyłki (OMS / zamówienie) — zachowane w API props; UI mockupu: tekst szablonu. */
  shippingMethodLogoUrl?: string | null;
  /** Nazwa szablonu / kuriera (jak na ekranie Sellasist). */
  shippingTemplateLabel: string;
  compatible: WmsPackingRecommendedCartonApi[];
  packagingSuggestions?: PackagingSuggestionApi[];
  selectedCartonId?: string | null;
  /** Wybrane opakowania (wielopak) — identyfikatory kartonów. */
  selectedPackagingIds?: string[];
  busy: boolean;
  canContinueWithoutCarton: boolean;
  onSelectCarton: (cartonId: string) => void;
  /** Domknięcie wyboru → ekran finalizacji (bez POST …/finish). */
  onProceedToFinalization: () => void;
  onContinueWithoutCarton: () => void;
  onAddOwnPackaging?: () => void;
  /** Gdy false — jedno opakowanie (zastępuje wybór); bez „dodaj paczkę”. */
  enableMultiParcel?: boolean;
};

/**
 * Po domknięciu ilości: kompaktowy wybór opakowań; POST …/finish dopiero na kolejnym ekranie.
 */
export function PackingCartonGateModal({
  open,
  shippingTemplateLabel,
  compatible,
  selectedCartonId,
  selectedPackagingIds = [],
  busy,
  canContinueWithoutCarton,
  onSelectCarton,
  onProceedToFinalization,
  onContinueWithoutCarton,
  onAddOwnPackaging,
  enableMultiParcel = false,
}: PackingCartonGateModalProps) {
  const gridRef = useRef<HTMLUListElement>(null);
  const { registerScanHandler, setScannerInputPlaceholder, refocusScannerInput, showScannerToast } =
    useWmsScanner();

  const sel = (selectedCartonId ?? "").trim();
  const pkgCount = selectedPackagingIds.length;
  const hasSelection = pkgCount > 0 || sel !== "";
  const title = enableMultiParcel ? "Zarządzaj paczkami" : "Wybierz opakowanie";
  const proceedLabel = enableMultiParcel ? "Zakończ konfigurację paczek" : "Przejdź do finalizacji";

  useEffect(() => {
    if (!open) {
      registerScanHandler(null);
      return;
    }
    setScannerInputPlaceholder("Kod opakowania");
    registerScanHandler((raw) => {
      if (busy) return;
      const hit = matchCartonByScan(compatible, raw);
      if (!hit) {
        showScannerToast("Nie rozpoznano opakowania.");
        refocusScannerInput();
        return;
      }
      onSelectCarton(hit.id);
      refocusScannerInput();
    });
    refocusScannerInput();
    return () => {
      registerScanHandler(null);
    };
  }, [
    open,
    busy,
    compatible,
    onSelectCarton,
    registerScanHandler,
    setScannerInputPlaceholder,
    refocusScannerInput,
    showScannerToast,
  ]);

  if (!open) return null;

  const scrollToGrid = () => {
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const nameById = (id: string) => compatible.find((c) => c.id === id)?.name?.trim() || id;
  const selectedNames =
    pkgCount > 0
      ? selectedPackagingIds.map(nameById)
      : sel
        ? [nameById(sel)]
        : [];
  const selectedCount = selectedNames.length;

  return (
    <AppOverlayPortal>
      <div
        className="fixed inset-0 z-[300] flex flex-col bg-white"
        role="dialog"
        aria-modal="true"
        aria-labelledby="packing-post-carton-title"
      >
        <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-2.5 sm:px-5">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
            <div className="min-w-0 sm:justify-self-start">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Szablon wysyłki
              </p>
              <p className="truncate text-lg font-black leading-tight text-slate-900 sm:text-xl">
                {shippingTemplateLabel || "—"}
              </p>
            </div>
            <h2
              id="packing-post-carton-title"
              className="text-center text-lg font-black tracking-tight text-slate-900 sm:text-xl"
            >
              {title}
            </h2>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:justify-self-end sm:justify-end">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Wybrane ({selectedCount}):
              </span>
              {selectedNames.length === 0 ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
                  —
                </span>
              ) : (
                selectedNames.map((n) => (
                  <span
                    key={n}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800"
                    title={n}
                  >
                    {n}
                  </span>
                ))
              )}
            </div>
          </div>
          {enableMultiParcel ? (
            <p className="mx-auto mt-1.5 max-w-6xl text-center text-xs text-slate-500">
              Dodaj kolejne paczki i przypisz opakowanie. Po zakończeniu uruchomią się akcje automatyczne.
            </p>
          ) : null}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white px-3 py-3 sm:px-5 sm:py-4">
          <div className="mx-auto max-w-6xl">
            {compatible.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950">
                Brak materiałów przypisanych do tej metody wysyłki. Skonfiguruj powiązania w magazynie albo — jeśli
                masz uprawnienie — użyj opcji poniżej.
              </p>
            ) : (
              <ul
                ref={gridRef}
                className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-2.5"
              >
                {compatible.map((c) => {
                  const isSel = sel !== "" && c.id === sel;
                  const inMulti = selectedPackagingIds.includes(c.id);
                  const selected = isSel || inMulti;
                  const recommended = Boolean(c.is_best);
                  const code = cartonScanCode(c);
                  return (
                    <li key={c.id} className="min-w-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onSelectCarton(c.id)}
                        className={[
                          "relative flex h-full w-full flex-col overflow-hidden rounded-lg border bg-white px-2 pb-2 pt-1.5 text-center transition-all",
                          "hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50",
                          selected
                            ? "border-blue-500 shadow-[0_0_0_2px_rgba(59,130,246,0.25)]"
                            : "border-slate-200",
                        ].join(" ")}
                      >
                        {recommended ? (
                          <span className="absolute right-1.5 top-1.5 z-10 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-900">
                            REKOM.
                          </span>
                        ) : null}
                        <CartonThumb url={c.image_url} />
                        <p
                          className="mt-1.5 line-clamp-2 min-h-[2rem] text-sm font-bold leading-snug text-slate-900"
                          title={c.name?.trim() || undefined}
                        >
                          {c.name?.trim() || "—"}
                        </p>
                        <p className="mt-0.5 text-xs font-medium tabular-nums text-slate-500">
                          {c.dimensions || "—"}
                        </p>
                        <div className="mt-auto flex min-h-[2rem] items-end justify-center pt-1.5">
                          <CartonBarcode value={code} />
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-white px-3 py-3 sm:px-5">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-stretch">
            <button
              type="button"
              disabled={busy || !hasSelection}
              onClick={onProceedToFinalization}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-1"
            >
              {proceedLabel}
            </button>

            {enableMultiParcel && compatible.length > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onAddOwnPackaging?.();
                  scrollToGrid();
                }}
                className="w-full rounded-lg border border-dashed border-slate-300 bg-white py-3 text-center text-sm font-bold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 sm:flex-1"
              >
                + Dodaj kolejną paczkę
              </button>
            ) : null}

            {canContinueWithoutCarton ? (
              <button
                type="button"
                disabled={busy}
                onClick={onContinueWithoutCarton}
                className="w-full rounded-lg border border-slate-300 bg-white py-3 text-center text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50 sm:flex-1"
              >
                Kontynuuj bez opakowania
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </AppOverlayPortal>
  );
}
