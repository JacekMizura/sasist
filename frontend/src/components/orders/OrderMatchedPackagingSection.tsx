import { useState } from "react";
import { AlertTriangle, Box, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
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
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className={`${pill} border-violet-200 bg-violet-50 text-violet-950`}>{engineLabel}</span>
      <span className={`${pill} border-slate-200 bg-white text-slate-800`}>Pewność: {confidencePct}</span>
      {fillPct != null ? (
        <span className={`${pill} border-slate-200 bg-slate-50 text-slate-800`}>Wypełnienie: {fillPct}</span>
      ) : null}
      <span className={`${pill} border-amber-200/90 bg-amber-50/90 text-amber-950`}>Tryb: {sourceLabel}</span>
    </div>
  );
}

/** Gołe zdjęcie kartonu — contain, bez ramki / tła / cienia. */
function CartonImage({ url, size = "md" }: { url?: string | null; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-11 w-11" : "h-14 w-14";
  if (url?.trim()) {
    return (
      <img
        src={url.trim()}
        alt=""
        className={`${dim} shrink-0 object-contain`}
        loading="lazy"
      />
    );
  }
  return (
    <div className={`${dim} flex shrink-0 items-center justify-center`} aria-hidden>
      <Box className={size === "sm" ? "h-5 w-5 text-slate-400" : "h-6 w-6 text-slate-400"} strokeWidth={1.75} />
    </div>
  );
}

function RecommendedCard({ suggestion }: { suggestion: PackagingSuggestionApi }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const fill =
    suggestion.fill_percentage != null && Number.isFinite(Number(suggestion.fill_percentage))
      ? `${Math.round(Number(suggestion.fill_percentage))}%`
      : null;
  const reason = suggestion.reason?.trim() ?? "";
  const modeLabel =
    suggestion.source_engine === "COMBINED" ? "Hybryda" : engineToLabel(suggestion.source_engine);

  return (
    <div className="rounded-lg border border-violet-200/90 border-t-[3px] border-t-violet-500 bg-white px-3 py-2.5">
      <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-900">
        <Sparkles className="h-3 w-3 shrink-0 text-violet-600" strokeWidth={2} aria-hidden />
        Rekomendowany
      </div>

      <div className="flex items-start gap-3">
        <CartonImage url={suggestion.image_url} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tabular-nums text-slate-600">
            {suggestion.package_dimensions || "—"}
          </p>
          <p className="truncate text-base font-bold leading-snug text-slate-900">{suggestion.package_name}</p>
          <MetaPills
            engineLabel={engineToLabel(suggestion.source_engine)}
            confidencePct={pctConfidence(suggestion.confidence_score)}
            fillPct={fill}
            sourceLabel={modeLabel}
          />
        </div>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-md bg-slate-50 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Pewność</p>
          <p className="text-[12px] font-bold tabular-nums text-slate-800">{pctConfidence(suggestion.confidence_score)}</p>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Wykorzystanie</p>
          <p className="text-[12px] font-bold tabular-nums text-slate-800">{fill ?? "—"}</p>
        </div>
      </div>

      {reason ? (
        <div className="mt-2 border-t border-violet-100/80 pt-1.5">
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((v) => !v)}
          >
            {detailsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            Szczegóły
          </button>
          {detailsOpen ? (
            <p className="mt-1.5 text-[11px] leading-snug text-slate-600">{reason}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AltPackagingCard({ suggestion, ordinal }: { suggestion: PackagingSuggestionApi; ordinal: number }) {
  const fill =
    suggestion.fill_percentage != null && Number.isFinite(Number(suggestion.fill_percentage))
      ? `${Math.round(Number(suggestion.fill_percentage))}%`
      : null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Opakowanie {ordinal}</p>
      <div className="flex items-start gap-3">
        <CartonImage url={suggestion.image_url} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tabular-nums text-slate-600">{suggestion.package_dimensions || "—"}</p>
          <p className="truncate text-base font-bold leading-snug text-slate-900">{suggestion.package_name}</p>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <div className="rounded-md bg-slate-50 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Pewność</p>
          <p className="text-[12px] font-bold tabular-nums text-slate-800">{pctConfidence(suggestion.confidence_score)}</p>
        </div>
        <div className="rounded-md bg-slate-50 px-2 py-1.5">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Wykorzystanie</p>
          <p className="text-[12px] font-bold tabular-nums text-slate-800">{fill ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}

function SelectedCartonCompact({ carton }: { carton: WmsPackingRecommendedCartonApi }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2.5">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Wybrane przy pakowaniu</p>
      <div className="flex items-start gap-3">
        <CartonImage url={carton.image_url} />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tabular-nums text-slate-600">{carton.dimensions || "—"}</p>
          <p className="truncate text-base font-bold leading-snug text-slate-900">{carton.name}</p>
        </div>
      </div>
    </div>
  );
}

function CompactAltRow({ suggestion }: { suggestion: PackagingSuggestionApi }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5 text-sm">
      <CartonImage url={suggestion.image_url} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{suggestion.package_name}</p>
        <p className="font-mono text-[11px] text-slate-600">{suggestion.package_dimensions}</p>
      </div>
    </li>
  );
}

function OverrideCallout({
  top,
  selected,
}: {
  top: PackagingSuggestionApi | undefined;
  selected: WmsPackingRecommendedCartonApi | null;
}) {
  const overridden = Boolean(top?.overridden_by_user);
  const differsFromSuggestion = Boolean(
    top && selected && String(selected.id) !== String(top.suggested_package_id),
  );
  if (!overridden && !differsFromSuggestion) return null;
  return (
    <div
      className="flex gap-2 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-1.5 text-[12px] text-amber-950"
      role="status"
    >
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" strokeWidth={2} aria-hidden />
      <p className="leading-snug">
        {overridden
          ? "Wybrano inny karton niż rekomendowany."
          : "Wybrany karton różni się od aktualnej rekomendacji."}
      </p>
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
 * Sekcja poziomu zamówienia — kompaktowa karta rekomendacji + wybór operacyjny.
 * Nagłówek sekcji renderuje rodzic (`OrderDetailSectionCard`) — tu bez duplikatu tytułu.
 */
export function OrderMatchedPackagingSection({
  card,
  /** Tylko zakładka Podsumowanie: rekomendacja i wybór operacyjny obok siebie. */
  pairRecommendationColumns = false,
  /** Zakładka Produkty i magazyn: pozioma siatka kart (rekomendacja + alternatywy). */
  productsGallery = false,
}: {
  card: WmsPackingOrderCardApi | null;
  pairRecommendationColumns?: boolean;
  productsGallery?: boolean;
}) {
  const [altsOpen, setAltsOpen] = useState(false);
  const primary = card ? resolvePrimary(card) : undefined;
  const alts = card ? resolveAlternatives(card) : [];
  const selected = card?.selected_carton ?? null;
  const hasAny = Boolean(selected || primary);

  if (!card || !hasAny) {
    return <p className="text-sm text-slate-500">Brak propozycji opakowania.</p>;
  }

  const showAltToggle = alts.length > 0;

  if (productsGallery) {
    const galleryCards = [primary, ...alts].filter(Boolean) as PackagingSuggestionApi[];
    return (
      <div className="space-y-3" aria-label="Dopasowane opakowanie">
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {galleryCards.map((s, i) =>
            i === 0 ? (
              <RecommendedCard key={s.suggested_package_id} suggestion={s} />
            ) : (
              <AltPackagingCard key={s.suggested_package_id} suggestion={s} ordinal={i + 1} />
            ),
          )}
        </div>
        {selected ? <SelectedCartonCompact carton={selected} /> : null}
        <OverrideCallout top={primary} selected={selected} />
      </div>
    );
  }

  const recommendedColumn = (
    <div className="min-w-0 space-y-2">
      {primary ? (
        <RecommendedCard suggestion={primary} />
      ) : (
        <p className="text-sm text-slate-500">Brak dopasowanego opakowania.</p>
      )}

      {showAltToggle ? (
        <div>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 py-1 text-left text-xs font-semibold text-slate-700 hover:text-slate-900"
            aria-expanded={altsOpen}
            onClick={() => setAltsOpen((v) => !v)}
          >
            {altsOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            Alternatywy ({alts.length})
          </button>
          {altsOpen ? (
            <ul className="mt-1 divide-y divide-slate-100">
              {alts.map((s) => (
                <CompactAltRow key={s.suggested_package_id} suggestion={s} />
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <OverrideCallout top={primary} selected={selected} />
    </div>
  );

  const selectedColumn = selected ? (
    <SelectedCartonCompact carton={selected} />
  ) : (
    <div className="flex min-h-[5.5rem] items-center justify-center rounded-lg border border-dashed border-slate-200 px-3 py-4">
      <p className="text-sm text-slate-400">Nie wybrano jeszcze kartonu.</p>
    </div>
  );

  return (
    <div className="space-y-2" aria-label="Dopasowane opakowanie">
      {pairRecommendationColumns ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-stretch">
          {recommendedColumn}
          <div className="min-w-0">{selectedColumn}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {recommendedColumn}
          {selectedColumn}
        </div>
      )}
    </div>
  );
}
