import { useState } from "react";
import { AlertTriangle, Box, ChevronDown, ChevronRight, Package, Sparkles } from "lucide-react";
import type { PackagingSuggestionApi, WmsPackingOrderCardApi, WmsPackingRecommendedCartonApi } from "../../api/wmsPackingApi";

function pctConfidence(n: number): string {
  return `${Math.round(Math.min(1, Math.max(0, n)) * 100)}%`;
}

function engineToLabel(src: string): string {
  switch (src) {
    case "SMART_MATCHING":
      return "Smart Matching";
    case "THREE_D_MATCHING":
      return "3D Matching";
    case "COMBINED":
      return "Hybryda";
    default:
      return src;
  }
}

function sourcePillLabel(
  top: PackagingSuggestionApi | undefined,
  selected: WmsPackingRecommendedCartonApi | null | undefined,
): string {
  if (!selected && !top) return "—";
  if (top?.overridden_by_user) return "Ręczne";
  if (top?.source_engine === "COMBINED") return "Hybryda";
  if (top?.auto_assigned && top.source_engine) return engineToLabel(top.source_engine);
  if (selected && top && selected.id === top.suggested_package_id && !top.overridden_by_user) {
    return engineToLabel(top.source_engine);
  }
  if (selected && (!top || selected.id !== top.suggested_package_id)) return "Ręczne";
  if (top) return engineToLabel(top.source_engine);
  return "Ręczne";
}

const pill =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none tracking-tight";

function MetaPills({
  engineLabel,
  confidencePct,
  fillPct,
  sourceLabel,
}: {
  engineLabel: string;
  confidencePct: string;
  fillPct: string | null;
  sourceLabel: string;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <span className={`${pill} border-violet-200 bg-violet-50 text-violet-950`}>{engineLabel}</span>
      <span className={`${pill} border-slate-200 bg-white text-slate-800`}>Pewność: {confidencePct}</span>
      {fillPct != null ? (
        <span className={`${pill} border-slate-200 bg-slate-50 text-slate-800`}>Wypełnienie: {fillPct}</span>
      ) : null}
      <span className={`${pill} border-amber-200/90 bg-amber-50/90 text-amber-950`}>Tryb: {sourceLabel}</span>
    </div>
  );
}

function CartonVisualBlock({
  name,
  dimensions,
  imageUrl,
  accent = "amber",
  large = false,
}: {
  name: string;
  dimensions: string;
  imageUrl?: string | null;
  accent?: "amber" | "emerald" | "slate" | "violet";
  large?: boolean;
}) {
  const frame =
    accent === "emerald"
      ? "border-emerald-300/70 bg-gradient-to-br from-emerald-50/90 to-white"
      : accent === "slate"
        ? "border-slate-300/70 bg-gradient-to-br from-slate-50 to-white"
        : accent === "violet"
          ? "border-violet-300/80 bg-gradient-to-br from-violet-50/90 to-white"
          : "border-amber-300/70 bg-gradient-to-br from-amber-50/80 to-white";
  const imgClass = large ? "h-[4.5rem] w-[4.5rem]" : "h-[3.25rem] w-[3.25rem]";
  return (
    <div className={`flex gap-3 rounded-xl border-2 ${frame} p-3 shadow-sm`}>
      <div
        className={`flex ${imgClass} shrink-0 items-center justify-center overflow-hidden rounded-lg border border-black/5 bg-white/90 shadow-inner`}
        aria-hidden={imageUrl ? undefined : true}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain p-0.5" />
        ) : (
          <Box className={`${large ? "h-10 w-10" : "h-8 w-8"} text-amber-900/55`} strokeWidth={1.75} aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={`font-mono font-bold tabular-nums tracking-tight text-slate-900 ${large ? "text-sm" : "text-xs"}`}
        >
          {dimensions || "—"}
        </p>
        <p className={`mt-0.5 truncate font-semibold leading-snug text-slate-900 ${large ? "text-base" : "text-sm"}`}>
          {name}
        </p>
      </div>
    </div>
  );
}

function PrimaryEngineCard({ suggestion }: { suggestion: PackagingSuggestionApi }) {
  const fill =
    suggestion.fill_percentage != null && Number.isFinite(Number(suggestion.fill_percentage))
      ? `${Math.round(Number(suggestion.fill_percentage))}%`
      : null;
  return (
    <div className="rounded-2xl border-2 border-violet-200/90 bg-gradient-to-br from-violet-50/50 via-white to-white p-4 shadow-md ring-1 ring-violet-100/80">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-5 w-5 shrink-0 text-violet-600" strokeWidth={2} aria-hidden />
        <p className="text-[11px] font-bold uppercase tracking-wide text-violet-900">Rekomendowany</p>
      </div>
      <CartonVisualBlock
        name={suggestion.package_name}
        dimensions={suggestion.package_dimensions}
        imageUrl={suggestion.image_url}
        accent="violet"
        large
      />
      <MetaPills
        engineLabel={engineToLabel(suggestion.source_engine)}
        confidencePct={pctConfidence(suggestion.confidence_score)}
        fillPct={fill}
        sourceLabel={suggestion.source_engine === "COMBINED" ? "Hybryda" : engineToLabel(suggestion.source_engine)}
      />
      {suggestion.reason?.trim() ? (
        <p className="mt-3 border-t border-violet-100 pt-3 text-[12px] leading-relaxed text-slate-600">
          <span className="font-semibold text-slate-800">Dlaczego: </span>
          {suggestion.reason.trim()}
        </p>
      ) : null}
    </div>
  );
}

function CompactAltRow({ suggestion }: { suggestion: PackagingSuggestionApi }) {
  const fill =
    suggestion.fill_percentage != null && Number.isFinite(Number(suggestion.fill_percentage))
      ? `${Math.round(Number(suggestion.fill_percentage))}%`
      : null;
  return (
    <li className="flex gap-3 rounded-lg border border-slate-200/90 bg-slate-50/50 px-3 py-2 text-sm">
      <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md border border-slate-200 bg-white">
        {suggestion.image_url?.trim() ? (
          <img src={suggestion.image_url.trim()} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Box className="h-5 w-5 text-slate-400" strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{suggestion.package_name}</p>
        <p className="font-mono text-[11px] text-slate-600">{suggestion.package_dimensions}</p>
        <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-600">
          <span>{engineToLabel(suggestion.source_engine)}</span>
          <span>·</span>
          <span>{pctConfidence(suggestion.confidence_score)}</span>
          {fill ? (
            <>
              <span>·</span>
              <span>fill {fill}</span>
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SelectedCartonCard({ carton }: { carton: WmsPackingRecommendedCartonApi }) {
  return (
    <div className="rounded-xl border-2 border-emerald-400/55 bg-gradient-to-br from-emerald-50/40 via-white to-white p-4 shadow-md ring-1 ring-emerald-100/60">
      <div className="mb-2 flex items-center gap-2">
        <Package className="h-4 w-4 shrink-0 text-emerald-800" strokeWidth={2} aria-hidden />
        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/90">Karton wybrany przy pakowaniu</p>
      </div>
      <CartonVisualBlock name={carton.name} dimensions={carton.dimensions} imageUrl={carton.image_url} accent="emerald" />
      {carton.is_best ? (
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">Oznaczony jako optymalny w sesji</p>
      ) : null}
    </div>
  );
}

function OverrideCallout({ top, selected }: { top: PackagingSuggestionApi | undefined; selected: WmsPackingRecommendedCartonApi | null }) {
  const overridden = Boolean(top?.overridden_by_user);
  const differsFromSuggestion = Boolean(
    top && selected && String(selected.id) !== String(top.suggested_package_id),
  );
  if (!overridden && !differsFromSuggestion) return null;
  return (
    <div
      className="flex gap-2 rounded-xl border-2 border-amber-300/80 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 shadow-sm"
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" strokeWidth={2} aria-hidden />
      <div>
        <p className="font-semibold text-amber-950">Nadpisanie</p>
        <p className="mt-0.5 text-[12px] leading-snug text-amber-900/90">
          {overridden
            ? "Operator lub proces ręcznie zmienił karton względem automatycznej rekomendacji."
            : "Wybrany karton różni się od aktualnej propozycji silnika (np. wcześniejszy wybór lub zmiana w sesji)."}
        </p>
      </div>
    </div>
  );
}

function resolvePrimary(card: WmsPackingOrderCardApi): PackagingSuggestionApi | undefined {
  const p = card.primary_packaging_suggestion ?? card.packaging_suggestions?.[0];
  return p ?? undefined;
}

function resolveAlternatives(card: WmsPackingOrderCardApi): PackagingSuggestionApi[] {
  const raw = card.packaging_alternatives;
  if (raw && raw.length > 0) return raw;
  const all = card.packaging_suggestions ?? [];
  return all.slice(1);
}

/**
 * Sekcja poziomu zamówienia — jedna główna rekomendacja + zwinięte alternatywy.
 */
export function OrderMatchedPackagingSection({
  card,
  /** Tylko zakładka Podsumowanie: rekomendacja i wybór operacyjny obok siebie na szerokich ekranach. */
  pairRecommendationColumns = false,
}: {
  card: WmsPackingOrderCardApi | null;
  pairRecommendationColumns?: boolean;
}) {
  const [altsOpen, setAltsOpen] = useState(false);
  const primary = card ? resolvePrimary(card) : undefined;
  const alts = card ? resolveAlternatives(card) : [];
  const selected = card?.selected_carton ?? null;
  const hasAny = Boolean(selected || primary);
  if (!card || !hasAny) {
    return (
      <section
        className="mt-4 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm"
        aria-label="Dopasowane opakowanie"
      >
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2.5">
          <Box className="h-4 w-4 text-slate-600" strokeWidth={2} aria-hidden />
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-700">Dopasowane opakowanie</h3>
        </div>
        <p className="px-4 py-3 text-sm text-slate-500">
          Brak propozycji opakowania.
        </p>
      </section>
    );
  }

  const assignmentSource = sourcePillLabel(primary, selected);
  const showAltToggle = alts.length > 0;

  return (
    <section className="mt-4 space-y-3" aria-label="Dopasowane opakowanie">
      <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-violet-50/30 px-4 py-2.5">
          <Box className="h-4 w-4 text-violet-700" strokeWidth={2} aria-hidden />
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-800">Dopasowane opakowanie</h3>
        </div>

        <div className="space-y-4 p-4">
          {pairRecommendationColumns ? (
            <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
              <div className="min-w-0 space-y-4">
                {primary ? <PrimaryEngineCard suggestion={primary} /> : (
                  <p className="text-sm text-slate-500">Brak dopasowanego opakowania.</p>
                )}

                {showAltToggle ? (
                  <div className="border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
                      aria-expanded={altsOpen}
                      onClick={() => setAltsOpen((v) => !v)}
                    >
                      {altsOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                      Pokaż alternatywy
                      <span className="ml-auto text-xs font-normal text-slate-500">({alts.length})</span>
                    </button>
                    {altsOpen ? (
                      <ul className="mt-2 space-y-2">
                        {alts.map((s) => (
                          <CompactAltRow key={s.suggested_package_id} suggestion={s} />
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}

                <OverrideCallout top={primary} selected={selected} />
              </div>
              <div className="min-w-0">
                {selected ? (
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Wybór operacyjny</p>
                    <SelectedCartonCard carton={selected} />
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-sm text-slate-600">
                    Nie wybrano jeszcze kartonu.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {primary ? <PrimaryEngineCard suggestion={primary} /> : (
                <p className="text-sm text-slate-500">Brak dopasowanego opakowania..</p>
              )}

              {showAltToggle ? (
                <div className="border-t border-slate-100 pt-2">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-1 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    aria-expanded={altsOpen}
                    onClick={() => setAltsOpen((v) => !v)}
                  >
                    {altsOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    Pokaż alternatywy
                    <span className="ml-auto text-xs font-normal text-slate-500">({alts.length})</span>
                  </button>
                  {altsOpen ? (
                    <ul className="mt-2 space-y-2">
                      {alts.map((s) => (
                        <CompactAltRow key={s.suggested_package_id} suggestion={s} />
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}

              <OverrideCallout top={primary} selected={selected} />

              {selected ? (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Wybór operacyjny</p>
                  <SelectedCartonCard carton={selected} />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-3 py-3 text-sm text-slate-600">
                  Nie wybrano jeszcze kartonu w sesji pakowania.
                </div>
              )}
            </>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
            <span className={`${pill} border-slate-300/80 bg-slate-100 text-slate-900`}>Tryb przypisania: {assignmentSource}</span>
            {primary?.auto_assigned ? (
              <span className={`${pill} border-blue-200 bg-blue-50 text-blue-950`}>Automatyczne przypisanie</span>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
