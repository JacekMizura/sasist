import { useState } from "react";
import { AlertTriangle, Box, ChevronDown, ChevronRight, Package } from "lucide-react";
import type { PackagingSuggestionApi, WmsPackingOrderCardApi, WmsPackingRecommendedCartonApi } from "../../api/wmsPackingApi";

function CartonRow({
  name,
  dimensions,
  imageUrl,
  reason,
  accent = "slate",
}: {
  name: string;
  dimensions: string;
  imageUrl?: string | null;
  reason?: string | null;
  accent?: "slate" | "violet" | "emerald";
}) {
  const frame =
    accent === "violet"
      ? "border-violet-200 bg-violet-50/40"
      : accent === "emerald"
        ? "border-emerald-200 bg-emerald-50/40"
        : "border-slate-200 bg-white";
  return (
    <div className={`flex gap-3 rounded-lg border ${frame} p-2.5`}>
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="max-h-full max-w-full object-contain p-0.5" />
        ) : (
          <Box className="h-5 w-5 text-slate-400" strokeWidth={1.75} aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
        <p className="font-mono text-[11px] text-slate-600">{dimensions || "—"}</p>
        {reason?.trim() ? (
          <p className="mt-1 text-[11px] leading-snug text-slate-600">{reason.trim()}</p>
        ) : null}
      </div>
    </div>
  );
}

function CompactAltRow({ suggestion }: { suggestion: PackagingSuggestionApi }) {
  return (
    <li className="flex gap-2.5 rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-2 text-sm">
      <div className="h-9 w-9 shrink-0 overflow-hidden rounded border border-slate-200 bg-white">
        {suggestion.image_url?.trim() ? (
          <img src={suggestion.image_url.trim()} alt="" className="h-full w-full object-contain p-0.5" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Box className="h-4 w-4 text-slate-400" strokeWidth={1.75} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{suggestion.package_name}</p>
        <p className="font-mono text-[11px] text-slate-600">{suggestion.package_dimensions}</p>
      </div>
    </li>
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
      className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-2.5 py-2 text-[12px] text-amber-950"
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
 * Sekcja poziomu zamówienia — rekomendacja kartonu + opcjonalne alternatywy.
 * `operatorQuiet`: zwarta prezentacja bez silników / pewności / zagnieżdżonych ramek (Podsumowanie).
 */
export function OrderMatchedPackagingSection({
  card,
  pairRecommendationColumns = false,
  operatorQuiet = false,
}: {
  card: WmsPackingOrderCardApi | null;
  /** Tylko zakładka Podsumowanie: rekomendacja i wybór operacyjny obok siebie na szerokich ekranach. */
  pairRecommendationColumns?: boolean;
  /** Bez debugowych chipów silnika; bez podwójnej ramki sekcji. */
  operatorQuiet?: boolean;
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

  const body = (
    <div className={operatorQuiet ? "space-y-2.5" : "space-y-3"}>
      {pairRecommendationColumns && !operatorQuiet ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="min-w-0 space-y-2.5">
            {primary ? (
              <CartonRow
                name={primary.package_name}
                dimensions={primary.package_dimensions}
                imageUrl={primary.image_url}
                reason={primary.reason}
                accent="violet"
              />
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
                  <ul className="mt-1.5 space-y-1.5">
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
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Wybrany przy pakowaniu</p>
                <CartonRow
                  name={selected.name}
                  dimensions={selected.dimensions}
                  imageUrl={selected.image_url}
                  accent="emerald"
                />
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nie wybrano jeszcze kartonu.</p>
            )}
          </div>
        </div>
      ) : (
        <>
          {primary ? (
            <div>
              {!operatorQuiet ? (
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">Rekomendowany</p>
              ) : null}
              <CartonRow
                name={primary.package_name}
                dimensions={primary.package_dimensions}
                imageUrl={primary.image_url}
                reason={primary.reason}
                accent={operatorQuiet ? "slate" : "violet"}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">Brak dopasowanego opakowania.</p>
          )}

          {selected ? (
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                <Package className="h-3 w-3" strokeWidth={2} aria-hidden />
                Wybrany przy pakowaniu
              </p>
              <CartonRow
                name={selected.name}
                dimensions={selected.dimensions}
                imageUrl={selected.image_url}
                accent="emerald"
              />
            </div>
          ) : null}

          <OverrideCallout top={primary} selected={selected} />

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
                <ul className="mt-1.5 space-y-1.5">
                  {alts.map((s) => (
                    <CompactAltRow key={s.suggested_package_id} suggestion={s} />
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  if (operatorQuiet) {
    return <div aria-label="Dopasowane opakowanie">{body}</div>;
  }

  return (
    <section className="space-y-2" aria-label="Dopasowane opakowanie">
      {body}
    </section>
  );
}
