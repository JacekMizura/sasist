import type { WarehouseStructurePdfPayload } from "../../../pdf/utils/structureReportPayload";
import type { StructurePdfMapPayload } from "../../../pdf/utils/buildStructurePdfViewModel";
import { formatWarehouseLocationTypeLabel } from "../../../utils/warehouseLocationTypeLabels";

function fmtSpacedInt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function fmtSpacedFixed(n: number, d: number): string {
  if (!Number.isFinite(n)) return "—";
  const [a, b] = n.toFixed(d).split(".");
  const spaced = a.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return b != null ? `${spaced}.${b}` : spaced;
}

function pct(part: number, total: number): number {
  if (total <= 0 || !Number.isFinite(part)) return 0;
  return (part / total) * 100;
}

function densityLabel(locationsPerM2: number): string {
  if (!Number.isFinite(locationsPerM2) || locationsPerM2 <= 0) return "Magazyn o nieokreślonej gęstości";
  if (locationsPerM2 < 0.4) return "Magazyn niskiej gęstości";
  if (locationsPerM2 < 0.9) return "Magazyn średniej gęstości";
  return "Magazyn wysokiej gęstości";
}

function dominantStorageInsight(typ: WarehouseStructurePdfPayload["data"]["pojemnosc"]["wedlugTypuMagazynowania"], total: number): {
  label: string;
  pct: number;
  key: "PRIMARY" | "RESERVE" | "DAMAGED" | "SHOP";
} {
  const byKey = [
    { key: "PRIMARY" as const, label: "podstawowe", value: typ.PRIMARY.liczba },
    { key: "RESERVE" as const, label: "zapasowe", value: typ.RESERVE.liczba },
    { key: "DAMAGED" as const, label: "uszkodzone", value: typ.DAMAGED.liczba },
    { key: "SHOP" as const, label: "sklepowe", value: typ.SHOP.liczba },
  ];
  const top = byKey.reduce((a, b) => (b.value > a.value ? b : a), byKey[0]);
  return { label: top.label, pct: Math.round(pct(top.value, total)), key: top.key };
}

const STORAGE_SEGMENTS: {
  bucket: "PRIMARY" | "RESERVE" | "DAMAGED" | "SHOP";
  label: string;
  barClass: string;
}[] = [
  { bucket: "PRIMARY", label: formatWarehouseLocationTypeLabel("PRIMARY"), barClass: "bg-teal-600" },
  { bucket: "RESERVE", label: formatWarehouseLocationTypeLabel("RESERVE"), barClass: "bg-teal-400" },
  { bucket: "DAMAGED", label: formatWarehouseLocationTypeLabel("DAMAGED"), barClass: "bg-amber-500" },
  { bucket: "SHOP", label: formatWarehouseLocationTypeLabel("SHOP"), barClass: "bg-indigo-500" },
];

function StorageBar({
  typ,
  total,
}: {
  typ: WarehouseStructurePdfPayload["data"]["pojemnosc"]["wedlugTypuMagazynowania"];
  total: number;
}) {
  if (total <= 0) {
    return (
      <div className="h-6 w-full rounded-full bg-gray-100" aria-hidden />
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-gray-100 ring-1 ring-gray-200/80">
        {STORAGE_SEGMENTS.map(({ bucket, label, barClass }) => {
          const p = pct(typ[bucket].liczba, total);
          if (p <= 0) return null;
          return (
            <div
              key={bucket}
              className={`${barClass} min-w-0 transition-[width]`}
              style={{ width: `${p}%` }}
              title={`${label}: ${Math.round(p)}%`}
            />
          );
        })}
      </div>
      <div className="grid gap-1.5 text-[11px] text-gray-500 sm:grid-cols-2">
        {STORAGE_SEGMENTS.map(({ bucket, label }) => (
          <span key={bucket} className="tabular-nums">
            {label}{" "}
            <span className="font-medium text-gray-800">
              {Math.round(pct(typ[bucket].liczba, total))}%
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

function StructureMapSvg({ map }: { map: StructurePdfMapPayload }) {
  const cols = Math.max(1, map.gridCols);
  const rows = Math.max(1, map.gridRows);
  return (
    <svg
      className="mx-auto h-48 max-w-full rounded-xl border border-gray-200/90 bg-slate-50"
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio="xMidYMid meet"
    >
      {map.racks.map((r, i) => (
        <rect
          key={i}
          x={r.x}
          y={r.y}
          width={r.width}
          height={r.height}
          fill={r.fillColor}
          stroke="#334155"
          strokeWidth={0.08}
        />
      ))}
    </svg>
  );
}

function MapLegend({ map }: { map: StructurePdfMapPayload }) {
  if (!map.legenda?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
      {map.legenda.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm ring-1 ring-gray-200"
            style={{ backgroundColor: item.kolor }}
          />
          <span className="text-gray-800">{item.nazwaSzablonu}</span>
        </div>
      ))}
    </div>
  );
}

/** Kolumny A… z liczby slotów w przykładzie lub średniej na poziom. */
function templateColumnCount(
  tpl: WarehouseStructurePdfPayload["data"]["szablony"][0],
  ex: WarehouseStructurePdfPayload["data"]["szablony"][0]["przykladowaAdresacja"]
): number {
  const levels = Math.max(1, tpl.liczbaPoziomow);
  const fromExample = Math.max(0, ...((ex?.poziomy ?? []).map((r) => r.etykiety.length)));
  const fromAvg = Math.ceil(tpl.sredniaLokalizacjiNaRegal / levels);
  return Math.max(1, fromExample, fromAvg);
}

function TemplateStructurePreview({
  tpl,
  ex,
}: {
  tpl: WarehouseStructurePdfPayload["data"]["szablony"][0];
  ex: WarehouseStructurePdfPayload["data"]["szablony"][0]["przykladowaAdresacja"];
}) {
  const levels = Math.max(1, tpl.liczbaPoziomow);
  const cols = Math.min(12, templateColumnCount(tpl, ex));
  const letters = Array.from({ length: cols }, (_, i) => String.fromCharCode(65 + i));
  const rowsData = ex?.poziomy ?? [];

  return (
    <div className="mt-4">
      <div className="overflow-x-auto rounded-lg border border-gray-200/90 bg-gray-50/60 p-3">
        <div className="inline-block min-w-full">
          <div className="mb-2 flex">
            <div className="w-8 shrink-0" />
            <div className="flex flex-1 justify-between gap-1">
              {letters.map((L) => (
                <div key={L} className="flex-1 text-center text-[10px] font-semibold text-gray-400">
                  {L}
                </div>
              ))}
            </div>
          </div>
          {Array.from({ length: levels }, (_, ri) => (
            <div key={ri} className="mb-1.5 flex items-stretch gap-1 last:mb-0">
              <div className="flex w-8 shrink-0 items-center justify-end pr-1 text-[10px] font-medium text-gray-400">
                {levels - ri}
              </div>
              <div className="grid flex-1 grid-cols-3 gap-1 sm:grid-cols-6 md:grid-cols-12">
                {Array.from({ length: cols }, (_, ci) => {
                  const levelRow = rowsData[ri];
                  const slotLabel = levelRow?.etykiety?.[ci] ?? letters[ci];
                  return (
                    <div
                      key={ci}
                      className="flex h-8 min-w-[2.2rem] items-center justify-center rounded-md border border-gray-300 bg-white text-[10px] font-medium text-gray-700"
                    >
                      [{slotLabel}]
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isDataVerified(j: WarehouseStructurePdfPayload["data"]["jakoscDanych"]): boolean {
  return j.pominieteSkrytkiBezUuid === 0 && j.zduplikowaneUuid === 0 && j.regalyBezSzablonu === 0;
}

export type WarehouseStructureReportViewProps = {
  payload: WarehouseStructurePdfPayload;
};

/**
 * Widok dashboardu raportu struktury (UI / podgląd). Dane wyłącznie z buildera — bez przeliczeń biznesowych.
 */
export function WarehouseStructureReportView({ payload }: WarehouseStructureReportViewProps) {
  const { data, map, exportDate } = payload;
  const b = data.budynek;
  const p = data.pojemnosc;
  const typ = p.wedlugTypuMagazynowania;
  const total = p.iloscLokalizacji;
  const verified = isDataVerified(data.jakoscDanych);
  const totalRacks = data.szablony.reduce((s, t) => s + t.liczbaRegalow, 0);
  const totalLevels = data.szablony.reduce((s, t) => s + t.liczbaRegalow * t.liczbaPoziomow, 0);
  const templatesCount = data.szablony.length;
  const locationsPerM2 = b.powierzchnia_m2 && b.powierzchnia_m2 > 0 ? p.iloscLokalizacji / b.powierzchnia_m2 : NaN;
  const dominant = dominantStorageInsight(typ, total);
  const topTemplate = data.szablony.reduce<WarehouseStructurePdfPayload["data"]["szablony"][0] | null>(
    (best, item) => (best == null || item.liczbaRegalow > best.liczbaRegalow ? item : best),
    null
  );
  const topTemplatePct = totalRacks > 0 && topTemplate ? Math.round((topTemplate.liczbaRegalow / totalRacks) * 100) : 0;
  const snapshotParts = [
    densityLabel(locationsPerM2),
    total > 0 ? `Dominują lokalizacje ${dominant.label}` : "Brak zdefiniowanych lokalizacji",
    typ.SHOP.liczba > 0 ? `Strefy sklepowe: ${Math.round(pct(typ.SHOP.liczba, total))}%` : "Brak stref sklepowych",
  ];

  return (
    <div className="w-full bg-white px-4 py-8 text-gray-900 sm:px-6 print:px-4 print:py-4">
      <style>{`
        @media print {
          html, body, #root {
            background: #ffffff !important;
          }
          .report-card {
            box-shadow: none !important;
            background: #ffffff !important;
          }
          .report-print-tight {
            font-size: 11px !important;
            line-height: 1.25 !important;
          }
          .report-print-title {
            font-size: 18px !important;
            line-height: 1.2 !important;
          }
          .report-print-subtitle {
            font-size: 13px !important;
            line-height: 1.2 !important;
          }
          .report-print-section {
            gap: 12px !important;
          }
          .page-break {
            page-break-before: always;
            break-before: page;
          }
          .break-inside-avoid {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
      <div className="grid gap-6">
      <header className="space-y-2 border-b border-gray-200/90 pb-6 report-print-tight">
        <h1 className="text-xl font-semibold tracking-tight text-gray-900 report-print-title">Projekt magazynu</h1>
        <p className="text-[15px] font-medium text-gray-900 report-print-subtitle">{data.informacjeMagazynu.nazwa}</p>
        <p className="text-sm text-gray-500">
          {data.informacjeMagazynu.nazwaLayoutu}
          <span className="text-gray-300"> · </span>
          {exportDate}
        </p>
        <p
          className={`text-sm font-medium ${verified ? "text-emerald-700" : "text-amber-700"}`}
        >
          {verified ? "● Dane: Zweryfikowane" : "● Dane: Do weryfikacji"}
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 report-print-section sm:grid-cols-2">
        <div className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-5 text-center shadow-sm">
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
            {fmtSpacedInt(p.iloscLokalizacji)} szt.
          </div>
          <div className="mt-2 text-xs text-gray-500">Lokalizacje</div>
        </div>
        <div className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-5 text-center shadow-sm">
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
            {fmtSpacedInt(p.lacznaObjetosc_dm3)} dm³
          </div>
          <div className="mt-2 text-xs text-gray-500">Łączna objętość</div>
        </div>
        <div className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-5 text-center shadow-sm">
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
            {b.powierzchnia_m2 != null ? `${fmtSpacedFixed(b.powierzchnia_m2, 2)} m²` : "—"}
          </div>
          <div className="mt-2 text-xs text-gray-500">Powierzchnia</div>
        </div>
        <div className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-5 text-center shadow-sm">
          <div className="text-2xl font-semibold tabular-nums tracking-tight text-gray-900">
            {b.objetosc_m3 != null ? `${fmtSpacedFixed(b.objetosc_m3, 2)} m³` : "—"}
          </div>
          <div className="mt-2 text-xs text-gray-500">Kubatura</div>
        </div>
      </section>

      <section className="page-break break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white px-5 py-3 shadow-sm">
        <p className="text-sm text-gray-700">{snapshotParts.join(" • ")}</p>
      </section>

      <section className="grid grid-cols-1 gap-4 report-print-section sm:grid-cols-3">
        <div className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-4 shadow-sm">
          <div className="text-lg font-semibold tabular-nums text-gray-900">
            {Number.isFinite(locationsPerM2) ? `${fmtSpacedFixed(locationsPerM2, 2)} lokalizacji / m²` : "—"}
          </div>
          <div className="mt-1 text-xs text-gray-500">Gęstość lokalizacji</div>
        </div>
        <div className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-4 shadow-sm sm:col-span-2">
          <div className="grid grid-cols-1 gap-2 text-sm text-gray-700 sm:grid-cols-3">
            <p>
              Regały: <span className="font-semibold tabular-nums text-gray-900">{fmtSpacedInt(totalRacks)}</span>
            </p>
            <p>
              Poziomy łącznie: <span className="font-semibold tabular-nums text-gray-900">{fmtSpacedInt(totalLevels)}</span>
            </p>
            <p>
              Szablony: <span className="font-semibold tabular-nums text-gray-900">{fmtSpacedInt(templatesCount)}</span>
            </p>
          </div>
        </div>
      </section>

      <section className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-700">Typy magazynowania</h2>
        <StorageBar typ={typ} total={total} />
        <p className="mt-3 text-sm text-gray-700">
          Dominują lokalizacje {dominant.label} ({dominant.pct}%).
        </p>
      </section>

      <section className="page-break break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-5 shadow-sm">
        <StructureMapSvg map={map} />
        <MapLegend map={map} />
      </section>

      <section className="page-break grid gap-4 report-print-section">
        {topTemplate ? (
          <div className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white px-5 py-3 shadow-sm">
            <p className="text-sm text-gray-700">
              Najczęstszy szablon:{" "}
              <span className="font-semibold text-gray-900">{topTemplate.nazwa}</span>{" "}
              ({topTemplatePct}% regałów).
            </p>
          </div>
        ) : null}
        {data.szablony.map((tpl) => {
          const locPerRack = tpl.sredniaLokalizacjiNaRegal;
          const locLabel = Number.isInteger(locPerRack) ? String(locPerRack) : locPerRack.toFixed(1);
          const ex = tpl.przykladowaAdresacja;
          return (
            <div
              key={tpl.idSzablonu}
              className="break-inside-avoid report-card rounded-xl border border-gray-200/90 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-gray-900">{tpl.nazwa}</h2>
                <span className="text-xs text-gray-400">
                  {tpl.wymiary_cm.szerokosc}×{tpl.wymiary_cm.glebokosc}×{tpl.wymiary_cm.wysokosc} cm
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                  <div className="text-xl font-semibold tabular-nums text-gray-900">
                    {fmtSpacedInt(tpl.liczbaRegalow)}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">Regały</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                  <div className="text-xl font-semibold tabular-nums text-gray-900">
                    {fmtSpacedInt(tpl.liczbaPoziomow)}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">Poziomy</div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center">
                  <div className="text-xl font-semibold tabular-nums text-gray-900">{locLabel}</div>
                  <div className="mt-0.5 text-xs text-gray-500">Lok. / regał</div>
                </div>
              </div>
              <TemplateStructurePreview tpl={tpl} ex={ex} />
            </div>
          );
        })}
      </section>
      </div>
    </div>
  );
}
