import { useMemo, useState } from "react";
import type { PackagingSuggestionApi, WmsPackingOrderDetailApi, WmsPackingRecommendedCartonApi } from "../../../api/wmsPackingApi";

type Props = {
  detail: WmsPackingOrderDetailApi;
  busy?: boolean;
  onUseCarton: (cartonId: string, opts?: { confirmOverride?: boolean }) => void | Promise<void>;
};

function confLabel(c?: string | null): string {
  const u = String(c || "").toUpperCase();
  if (u === "EXACT") return "DOKŁADNE";
  if (u === "ESTIMATED") return "SZACUNKOWE";
  return "NIEZNANE";
}

function PackingFitRecommendationPanel({ detail, busy, onUseCarton }: Props) {
  const [showAlts, setShowAlts] = useState(false);
  const [overrideFor, setOverrideFor] = useState<{ id: string; warning: string } | null>(null);

  const primary = detail.primary_packaging_suggestion ?? detail.packaging_suggestions?.[0] ?? null;
  const alts = useMemo(() => {
    const all = [
      ...(detail.packaging_suggestions ?? []),
      ...(detail.packaging_alternatives ?? []),
    ];
    const seen = new Set<string>();
    const out: PackagingSuggestionApi[] = [];
    for (const s of all) {
      const id = String(s.suggested_package_id || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(s);
    }
    return out;
  }, [detail.packaging_suggestions, detail.packaging_alternatives]);

  const plan = detail.packaging_fit_plan;
  const multi = (plan?.carton_count ?? 0) > 1 || Boolean(plan?.multi_carton_required);

  const bestCarton: WmsPackingRecommendedCartonApi | null =
    detail.recommended_cartons?.find((c) => c.is_best) ??
    (primary
      ? {
          id: primary.suggested_package_id,
          name: primary.package_name,
          dimensions: primary.package_dimensions || primary.usable_dimensions || "",
          image_url: primary.image_url,
          is_best: true,
          usable_dimensions: primary.usable_dimensions,
          fill_percentage: primary.fill_percentage,
          total_weight_kg: primary.total_weight_kg,
          max_payload_kg: primary.max_payload_kg,
          fit_status: primary.fit_status,
          fit_confidence: primary.fit_confidence,
          reject_reason_label: primary.reject_reason_label,
        }
      : null);

  const warnings: string[] = [];
  if (primary?.reason?.includes("Brak kompletnych wymiarów")) {
    warnings.push("Brak kompletnych wymiarów produktu — dobór opakowania jest szacunkowy.");
  }
  if (primary?.reason?.includes("wymiarów użytkowych") || plan?.warnings?.some((w) => w.includes("USABLE"))) {
    warnings.push("Brak wymiarów użytkowych opakowania — dopasowanie szacunkowe (wymiary zewnętrzne).");
  }

  const requestUse = (id: string, s?: PackagingSuggestionApi | null) => {
    if (s?.fit_status === "REJECTED" || s?.reject_reason_label) {
      setOverrideFor({
        id,
        warning: s.reject_reason_label || "Według wymiarów produkty mogą nie mieścić się w tym opakowaniu.",
      });
      return;
    }
    void onUseCarton(id);
  };

  if (!bestCarton && !multi && !primary) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">
        Brak rekomendacji opakowania (sprawdź wymiary produktów / kartony).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {warnings.map((w) => (
        <div key={w} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950">
          {w}
        </div>
      ))}

      {multi && plan ? (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
            Wymagane {plan.carton_count} paczki
          </p>
          <p className="mt-1 text-[11px] text-slate-600">
            Plan rekomendacji (odczyt). Zamówienie zapisuje nadal jedno wybrane opakowanie — multi-persist to osobny
            GAP.
          </p>
          <ul className="mt-3 space-y-3">
            {plan.plan.map((p, i) => (
              <li key={`${p.carton_id}-${i}`} className="rounded-lg border border-white bg-white px-3 py-2 shadow-sm">
                <p className="text-sm font-black text-slate-900">
                  Paczka {i + 1} — {p.carton_name || p.carton_id}
                </p>
                <ul className="mt-1 text-xs text-slate-600">
                  {p.items.map((it) => (
                    <li key={`${it.product_id}-${it.quantity}`}>
                      {it.label || `Produkt #${it.product_id}`} ×{it.quantity}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bestCarton ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rekomendowane opakowanie</p>
          <p className="mt-1 text-lg font-black text-slate-900">{bestCarton.name || "—"}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
            <div>
              <dt className="font-bold text-slate-400">Wymiary użytkowe</dt>
              <dd className="font-semibold tabular-nums">
                {bestCarton.usable_dimensions || bestCarton.dimensions || "—"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-400">Wypełnienie</dt>
              <dd className="font-semibold">
                {bestCarton.fill_percentage != null ? `${Math.round(bestCarton.fill_percentage)}%` : "—"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-400">Waga</dt>
              <dd className="font-semibold tabular-nums">
                {bestCarton.total_weight_kg != null
                  ? `${bestCarton.total_weight_kg.toFixed(1)}${
                      bestCarton.max_payload_kg != null ? ` / ${bestCarton.max_payload_kg} kg` : " kg"
                    }`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="font-bold text-slate-400">Confidence</dt>
              <dd className="font-semibold">{confLabel(bestCarton.fit_confidence || primary?.fit_confidence)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => requestUse(bestCarton.id, primary)}
              className="rounded-xl bg-[#5a4fcf] px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-white disabled:opacity-50"
            >
              Użyj kartonu {bestCarton.name || ""}
            </button>
            <button
              type="button"
              onClick={() => setShowAlts((v) => !v)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-700"
            >
              {showAlts ? "Ukryj inne" : "Pokaż inne"}
            </button>
          </div>
        </div>
      ) : null}

      {showAlts ? (
        <ul className="space-y-2">
          {alts.map((s) => {
            const rejected = s.fit_status === "REJECTED";
            return (
              <li
                key={s.suggested_package_id}
                className={`rounded-xl border px-3 py-3 ${
                  rejected ? "border-red-200 bg-red-50/50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      {s.package_name}
                      {s.is_recommended ? (
                        <span className="ml-2 text-[10px] font-black uppercase text-indigo-600">Rekomendowany</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-600">
                      {rejected
                        ? `NIE PASUJE — ${s.reject_reason_label || "odrzut fizyczny"}`
                        : `PASUJE · ${s.fill_percentage != null ? `${Math.round(s.fill_percentage)}%` : "—"}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => requestUse(s.suggested_package_id, s)}
                    className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-slate-700 disabled:opacity-50"
                  >
                    Wybierz
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {overrideFor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOverrideFor(null)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl">
            <h4 className="text-lg font-black text-slate-900">Wybrane opakowanie może być za małe</h4>
            <p className="mt-2 text-sm text-slate-700">{overrideFor.warning}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-wider"
                onClick={() => setOverrideFor(null)}
              >
                Wróć
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                onClick={() => {
                  const id = overrideFor.id;
                  setOverrideFor(null);
                  void onUseCarton(id, { confirmOverride: true });
                }}
              >
                Użyj mimo to
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PackingFitRecommendationPanel;
