/**
 * Etykieta detaliczna ~60×40 mm — podgląd / druk (język polski).
 * Wyświetlane są tylko niepuste sekcje; znak CE tylko gdy showCeMark.
 */

export type RetailLabelProps = {
  brandName: string;
  productNamePl: string;
  composition?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  importerName?: string;
  importerAddress?: string;
  ean?: string;
  batchNumber?: string;
  seriesNumber?: string;
  countryOfOrigin?: string;
  careInstructions?: string;
  sizeOrLength?: string;
  salePrice?: number | null;
  showPriceOnLabel?: boolean;
  showCeMark?: boolean;
  className?: string;
};

function block(text: string | undefined): string | null {
  const t = (text ?? "").trim();
  return t || null;
}

function CareIconWash() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm2 4h12l-1 10H7L6 10zm2.5 2 .5 6h6l.5-6h-7z"
      />
    </svg>
  );
}
function CareIconIron() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <path fill="currentColor" d="M5 8h14v2H5V8zm0 4h14v6H5v-6zm2 2v2h10v-2H7z" />
    </svg>
  );
}
function CareIconDry() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <path fill="currentColor" d="M8 12h8v2H8v-2z" />
    </svg>
  );
}

export function RetailLabel({
  brandName,
  productNamePl,
  composition,
  manufacturerName,
  manufacturerAddress,
  importerName,
  importerAddress,
  ean,
  batchNumber,
  seriesNumber,
  countryOfOrigin,
  careInstructions,
  sizeOrLength,
  salePrice,
  showPriceOnLabel,
  showCeMark,
  className = "",
}: RetailLabelProps) {
  const brand = block(brandName);
  const title = block(productNamePl);
  const comp = block(composition);
  const mName = block(manufacturerName);
  const mAddr = block(manufacturerAddress);
  const impN = block(importerName);
  const impA = block(importerAddress);
  const eanS = block(ean);
  const batch = block(batchNumber);
  const series = block(seriesNumber);
  const country = block(countryOfOrigin);
  const care = block(careInstructions);
  const size = block(sizeOrLength);
  const midHas = comp || mName || mAddr || impN || impA;
  const priceStr =
    showPriceOnLabel && salePrice != null && Number.isFinite(Number(salePrice))
      ? `${Number(salePrice).toFixed(2)} zł`
      : null;

  return (
    <div
      className={`relative box-border flex flex-col border-2 border-black bg-white text-black ${className}`}
      style={{ width: "60mm", minHeight: "40mm", padding: "1.2mm 1.5mm", fontSize: "2mm", lineHeight: 1.25 }}
      lang="pl"
    >
      {showCeMark ? (
        <div className="absolute right-1 top-1 flex h-5 w-7 items-center justify-center border border-black text-[6px] font-bold leading-none">
          CE
        </div>
      ) : null}

      <div className="relative shrink-0 border-b border-black/80 pb-0.5">
        {brand ? <div className="text-[2.2mm] font-semibold uppercase tracking-wide">{brand}</div> : null}
        {title ? <div className="text-[2.8mm] font-bold leading-tight">{title}</div> : null}
        {!brand && !title ? <div className="text-[2.2mm] text-neutral-500">— brak nazwy —</div> : null}
      </div>

      {midHas ? (
        <div className="min-h-0 flex-1 space-y-0.5 border-b border-black/40 py-0.5 text-[1.9mm]">
          {comp ? (
            <div>
              <span className="font-semibold">Skład: </span>
              {comp}
            </div>
          ) : null}
          {mName || mAddr ? (
            <div>
              <div className="font-semibold">Producent</div>
              {mName ? <div>{mName}</div> : null}
              {mAddr ? <div className="whitespace-pre-line">{mAddr}</div> : null}
            </div>
          ) : null}
          {impN || impA ? (
            <div>
              <div className="font-semibold">Importer</div>
              {impN ? <div>{impN}</div> : null}
              {impA ? <div className="whitespace-pre-line">{impA}</div> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {size ? (
        <div className="text-[1.8mm] text-neutral-800">
          <span className="font-semibold">Rozmiar / długość: </span>
          {size}
        </div>
      ) : null}

      <div className="mt-auto flex shrink-0 justify-between gap-1 border-t border-black/50 pt-0.5 text-[1.8mm]">
        <div className="min-w-0 flex-1 space-y-0.5">
          {country ? (
            <div>
              <span className="font-semibold">Kraj pochodzenia: </span>
              {country}
            </div>
          ) : null}
          {care ? (
            <div className="flex flex-wrap items-center gap-1">
              <span className="font-semibold">Pielęgnacja:</span>
              <span className="inline-flex gap-0.5 text-neutral-700" title={care}>
                <CareIconWash />
                <CareIconIron />
                <CareIconDry />
              </span>
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {eanS ? (
            <div className="font-mono text-[1.9mm] font-semibold" title="EAN">
              EAN {eanS}
            </div>
          ) : null}
          {batch ? <div className="text-[1.7mm]">Nr partii: {batch}</div> : null}
          {series ? <div className="text-[1.7mm]">Seria: {series}</div> : null}
          {priceStr ? (
            <div className="mt-0.5 border border-black px-1 py-0.5 text-[2.4mm] font-bold tabular-nums">{priceStr}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
