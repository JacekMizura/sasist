import { useRef } from "react";
import type { PackagingSuggestionApi, WmsPackingRecommendedCartonApi } from "../../../api/wmsPackingApi";
import { ShippingMethodLogo } from "../../shipping/ShippingMethodLogo";

function Thumb({ url, compact }: { url?: string | null; compact: boolean }) {
  const box = compact
    ? "h-16 w-full max-w-[100px] rounded-md text-2xl"
    : "mx-auto h-24 w-full max-w-[120px] rounded-md text-3xl";
  if (url?.trim()) {
    return <img src={url.trim()} alt="" className={`${box} border border-slate-200 bg-white object-contain`} />;
  }
  return (
    <div className={`flex ${box} shrink-0 items-center justify-center border border-slate-200 bg-white`} aria-hidden>
      📦
    </div>
  );
}

function suggestionMeta(
  suggestions: PackagingSuggestionApi[] | undefined,
  cartonId: string,
): { fillPct: string | null; confPct: string | null } {
  const s = suggestions?.find((x) => x.suggested_package_id === cartonId);
  if (!s) return { fillPct: null, confPct: null };
  const fillPct =
    s.fill_percentage != null && Number.isFinite(s.fill_percentage)
      ? `${Math.round(s.fill_percentage)}%`
      : null;
  const confPct =
    s.confidence_score != null && Number.isFinite(s.confidence_score)
      ? `${Math.round(Math.min(1, Math.max(0, s.confidence_score)) * 100)}%`
      : null;
  return { fillPct, confPct };
}

export type PackingCartonGateModalProps = {
  open: boolean;
  /** Logo metody wysyłki (OMS / zamówienie). */
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
  /** Opcjonalnie — np. komunikat dla superadmina przy dodawaniu materiału. */
  onAddOwnPackaging?: () => void;
  onSelectCarton: (cartonId: string) => void;
  /** Domknięcie wyboru → ekran finalizacji (bez POST …/finish). */
  onProceedToFinalization: () => void;
  onContinueWithoutCarton: () => void;
  onAddOwnPackaging?: () => void;
};

/**
 * Po domknięciu ilości: kompaktowy wybór opakowań; POST …/finish dopiero na kolejnym ekranie.
 */
export function PackingCartonGateModal({
  open,
  shippingMethodLogoUrl,
  shippingTemplateLabel,
  compatible,
  packagingSuggestions,
  selectedCartonId,
  selectedPackagingIds = [],
  busy,
  canContinueWithoutCarton,
  onSelectCarton,
  onProceedToFinalization,
  onContinueWithoutCarton,
  onAddOwnPackaging,
}: PackingCartonGateModalProps) {
  const gridRef = useRef<HTMLUListElement>(null);
  if (!open) return null;

  const sel = (selectedCartonId ?? "").trim();
  const pkgCount = selectedPackagingIds.length;
  const hasSelection = pkgCount > 0 || sel !== "";

  const scrollToGrid = () => {
    gridRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const nameById = (id: string) => compatible.find((c) => c.id === id)?.name?.trim() || id;

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-[#eef2f6]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="packing-post-carton-title"
    >
      <header className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 sm:gap-4">
          <ShippingMethodLogo
            logoUrl={shippingMethodLogoUrl}
            methodName={shippingTemplateLabel}
            size="md"
            className="shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Szablon wysyłki</p>
            <p className="truncate text-base font-bold leading-snug text-slate-900">{shippingTemplateLabel}</p>
          </div>
        </div>
        <h2 id="packing-post-carton-title" className="mx-auto mt-3 max-w-6xl text-lg font-black tracking-tight text-slate-900">
          Wybierz opakowanie
        </h2>
        {pkgCount > 0 ? (
          <div className="mx-auto mt-2 flex max-w-6xl flex-wrap gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Wybrane ({pkgCount}):</span>
            {selectedPackagingIds.map((id) => (
              <span
                key={id}
                className="rounded-xl bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-800 ring-1 ring-slate-200/80"
                title={nameById(id)}
              >
                {nameById(id)}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
        <div className="mx-auto max-w-6xl">
          {compatible.length === 0 ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-950">
              Brak materiałów przypisanych do tej metody wysyłki. Skonfiguruj powiązania w magazynie albo — jeśli masz
              uprawnienie — użyj opcji poniżej.
            </p>
          ) : (
            <ul
              ref={gridRef}
              className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 p-0 sm:gap-2.5"
            >
              {compatible.map((c) => {
                const meta = suggestionMeta(packagingSuggestions, c.id);
                const isSel = sel !== "" && c.id === sel;
                const inMulti = selectedPackagingIds.includes(c.id);
                const recommended = Boolean(c.is_best);
                return (
                  <li key={c.id} className="min-w-0">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => onSelectCarton(c.id)}
                      className={[
                        "flex h-full min-h-[220px] w-full flex-col rounded-lg border bg-white p-2.5 text-left shadow-sm transition-all",
                        "hover:-translate-y-px hover:shadow disabled:cursor-not-allowed disabled:opacity-50",
                        isSel || inMulti
                          ? "border-blue-600 bg-blue-50/90 ring-1 ring-blue-500/25"
                          : "border-slate-200 hover:border-slate-300",
                      ].join(" ")}
                    >
                      <div className="relative flex flex-1 flex-col items-stretch gap-1.5">
                        {recommended ? (
                          <span className="absolute right-0 top-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-900">
                            Rekom.
                          </span>
                        ) : null}
                        <Thumb url={c.image_url} compact />
                        <p
                          className="line-clamp-2 text-xs font-bold leading-tight text-slate-900"
                          title={c.name?.trim() || undefined}
                        >
                          {c.name?.trim() || "—"}
                        </p>
                        <p className="text-[11px] font-semibold tabular-nums text-slate-600">{c.dimensions || "—"}</p>
                        {(meta.fillPct || meta.confPct) && (
                          <div className="mt-auto flex flex-wrap gap-1 text-[9px] font-semibold text-slate-500">
                            {meta.fillPct ? <span>Wyp. {meta.fillPct}</span> : null}
                            {meta.confPct ? <span className="text-slate-400">•</span> : null}
                            {meta.confPct ? <span>Dopas. {meta.confPct}</span> : null}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mx-auto mt-5 flex max-w-6xl flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
            <button
              type="button"
              disabled={busy || !hasSelection}
              onClick={onProceedToFinalization}
              className="order-first w-full rounded-lg border-2 border-slate-900 bg-slate-900 px-4 py-3 text-center text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 sm:order-none sm:min-w-[200px] sm:flex-1"
            >
              Przejdź do finalizacji
            </button>

            {compatible.length > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onAddOwnPackaging?.();
                  scrollToGrid();
                }}
                className="w-full rounded-lg border-2 border-dashed border-slate-300 bg-white py-2.5 text-center text-xs font-bold text-slate-700 shadow-sm transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 sm:flex-1"
              >
                + Dodaj opakowanie
              </button>
            ) : null}

            {canContinueWithoutCarton ? (
              <button
                type="button"
                disabled={busy}
                onClick={onContinueWithoutCarton}
                className="w-full rounded-2xl border border-dashed border-slate-200 bg-white py-3 text-center text-xs font-bold text-slate-700 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50/50 disabled:opacity-50 sm:flex-1"
              >
                Kontynuuj bez opakowania
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
