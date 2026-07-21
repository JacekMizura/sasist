import { useMemo } from "react";
import type { StockDocumentItemRead } from "../../../api/stockDocumentsApi";
import { WmsCardKebabMenu, type WmsCardKebabMenuItem } from "../WmsCardKebabMenu";
import { wmsReceiptLineImageUrl } from "../../../utils/wmsReceiptLineMedia";
import type { ReceivingLineAuditSummary } from "../../../utils/receivingLineAudit";
import { operatorAvatarInitials } from "../../../utils/receivingLineAudit";
import { formatRelativeUpdatePl } from "../../../pages/wms/wmsListFormatters";
import {
  formatReceivingBatchLabel,
  formatReceivingExpiryLabel,
  formatReceivingSerialLabel,
  isGhostReceivingLine,
  isWmsExtraReceivingLine,
} from "../../../pages/wms/wmsReceivingLineGroups";
import { buildReceivingAcceptedSummary } from "../../../utils/receivingAcceptedBreakdown";

function fmtQty(n: number) {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

export type ReceivingLineCardProps = {
  index: number;
  it: StockDocumentItemRead;
  /** Same receiving group (receivingLineGroupKey) — isolated breakdown per card. */
  siblings: StockDocumentItemRead[];
  count: number;
  cartonSize: number;
  canEdit: boolean;
  busy: boolean;
  scanFlash?: boolean;
  ringDefect?: boolean;
  audit?: ReceivingLineAuditSummary | null;
  onOpenExecution: () => void;
  onOpenProductPreview: () => void;
  onPrintLabel: () => void;
  onMarkDamage: () => void;
  onEditReceivingAdmin: () => void;
  onMoveToCarrier: () => void;
  onRemoveFromDocument: () => void;
  onShowHistory: () => void;
};

function WadaBadge({ units }: { units: number }) {
  return (
    <span
      data-wms-card-no-nav=""
      className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-800"
    >
      Wada {fmtQty(units)}
    </span>
  );
}

export function ReceivingLineCard({
  index,
  it,
  siblings,
  count,
  cartonSize,
  canEdit,
  busy,
  scanFlash,
  ringDefect,
  audit,
  onOpenExecution,
  onOpenProductPreview,
  onPrintLabel,
  onMarkDamage,
  onEditReceivingAdmin,
  onMoveToCarrier,
  onRemoveFromDocument,
  onShowHistory,
}: ReceivingLineCardProps) {
  const img = wmsReceiptLineImageUrl(it);
  const ean = (it.product_ean || "").trim() || "—";
  const batchLabel = formatReceivingBatchLabel(it);
  const expiryLabel = formatReceivingExpiryLabel(it);
  const serialLabel = formatReceivingSerialLabel(it);
  const canRemoveGhost = isGhostReceivingLine(it);
  const accepted = useMemo(
    () => buildReceivingAcceptedSummary(siblings, cartonSize),
    [siblings, cartonSize],
  );
  const hasDamaged = accepted.totalDamaged > 0;
  const showDefectRing = ringDefect || hasDamaged;
  const displayCount = accepted.totalAllReceived > 0 ? accepted.totalAllReceived : count;

  const menuItems = useMemo((): WmsCardKebabMenuItem[] => {
    return [
      { id: "print", label: "Drukuj etykietę", onClick: onPrintLabel },
      { id: "preview", label: "Podgląd produktu", onClick: onOpenProductPreview },
      { id: "damage", label: "Oznacz wadę / uszkodzenie", onClick: onMarkDamage },
      {
        id: "edit",
        label: "Edytuj dane przyjęcia",
        onClick: onEditReceivingAdmin,
        disabled: !canEdit,
      },
      { id: "carrier", label: "Przenieś na nośnik", onClick: onMoveToCarrier, disabled: !canEdit },
      {
        id: "remove",
        label: "Usuń z dokumentu",
        onClick: onRemoveFromDocument,
        danger: true,
        disabled: !canEdit || !canRemoveGhost,
      },
      { id: "history", label: "Historia przyjęcia", onClick: onShowHistory },
    ];
  }, [
    canEdit,
    canRemoveGhost,
    onEditReceivingAdmin,
    onMarkDamage,
    onMoveToCarrier,
    onOpenProductPreview,
    onPrintLabel,
    onRemoveFromDocument,
    onShowHistory,
  ]);

  const interactive = canEdit && !busy;

  return (
    <article
      role="button"
      tabIndex={interactive && !busy ? 0 : undefined}
      onKeyDown={(e) => {
        if (!interactive || busy) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenExecution();
        }
      }}
      onClick={(e) => {
        if (!interactive || busy) return;
        if ((e.target as HTMLElement).closest("[data-wms-product-card-menu], [data-wms-card-no-nav]")) return;
        onOpenExecution();
      }}
      className={`relative flex min-h-[160px] h-full flex-col rounded-xl border bg-white transition-[box-shadow,border-color] ${
        interactive ? "cursor-pointer hover:border-slate-300 hover:shadow-md" : ""
      } ${
        scanFlash
          ? "border-indigo-400 bg-indigo-50/10 shadow-md ring-2 ring-indigo-500/20"
          : showDefectRing
            ? "border-rose-300 ring-2 ring-rose-200/50"
            : count > 0
              ? "border-slate-200 shadow-sm"
              : "border-slate-200 shadow-sm"
      }`}
    >
      {/* 1. TOP: Numer + Menu */}
      <div className="absolute top-2.5 left-2.5 text-[11px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded z-10">
        {index}
      </div>
      <div className="absolute top-2 right-2 text-slate-400 z-10" data-wms-product-card-menu="">
        <WmsCardKebabMenu items={menuItems} disabled={busy} />
      </div>

      {/* 2. MIDDLE: zdjęcie, tytuł, EAN, sposób przyjęcia */}
      <div className="p-4 pt-9 flex-grow flex flex-col">
        {/* Kontener: Zdjęcie + Tytuł */}
        <div className="flex gap-3 mb-4 items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden bg-transparent">
            {img ? (
              <img src={img} alt="" className="max-h-full max-w-full object-contain p-1 mix-blend-multiply" />
            ) : (
              <span className="text-[10px] text-slate-300">Brak</span>
            )}
          </div>
          
          <div className="min-w-0 flex-1 pt-1">
            <h4 className="line-clamp-2 text-[13px] font-semibold leading-snug text-slate-800 pr-2 mb-1.5">
              {it.product_name || `Produkt #${it.product_id}`}
            </h4>
            
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              <span className="text-[11px] text-slate-500 font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 truncate">
                EAN: {ean}
              </span>
              {isWmsExtraReceivingLine(it) ? (
                <span
                  data-wms-card-no-nav=""
                  className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-800"
                >
                  Extra
                </span>
              ) : null}
              {hasDamaged ? <WadaBadge units={accepted.totalDamaged} /> : null}
            </div>

            {/* LOT / Data */}
            <div className="flex flex-col gap-0.5">
              {batchLabel ? (
                <p className="truncate text-[10px] text-slate-500">
                  <span className="font-bold uppercase text-slate-400">P:</span> {batchLabel}
                </p>
              ) : null}
              {expiryLabel ? (
                <p className="truncate text-[10px] text-slate-500">
                  <span className="font-bold uppercase text-slate-400">W:</span> {expiryLabel}
                </p>
              ) : null}
              {serialLabel ? (
                <p className="truncate font-mono text-[10px] text-slate-600">S: {serialLabel}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Sposób przyjęcia — tylko gdy więcej niż same sztuki (kartony / nośniki / wada) */}
        <div className="mt-auto mb-2" data-wms-card-no-nav="">
          {accepted.displayRows.length > 0 &&
          !(accepted.displayRows.length === 1 && accepted.displayRows[0]?.key === "loose") ? (
            <>
              <div className="text-[10px] font-medium text-slate-400 mb-1.5 uppercase tracking-wider">
                Sposób przyjęcia
              </div>
              <ul className="space-y-1">
                {accepted.displayRows.map((row) => {
                  const parts = row.display.includes(" — ")
                    ? row.display.split(" — ")
                    : row.display.split(" - ");
                  if (parts.length === 2) {
                    return (
                      <li key={row.key} className="flex items-center text-xs">
                         <span className="text-slate-600 truncate mr-2 flex-shrink">{parts[0]}</span>
                         <div className="flex-grow border-b border-dashed border-slate-200 h-px mr-2 hidden sm:block"></div>
                         <span className="font-semibold text-slate-700 whitespace-nowrap">{parts[1]}</span>
                      </li>
                    );
                  }
                  return (
                    <li key={row.key} className="text-xs font-medium text-slate-700">
                      {row.display}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            displayCount > 0 ? null : <div className="text-[11px] text-slate-400 italic">Brak przyjęć</div>
          )}
        </div>
      </div>

      {/* 3. BOTTOM (Stopka): ZAWSZE NA SAMYM DOLE (mt-auto w kontenerze wyżej gwarantuje przyklejenie) */}
      <div 
        className={`px-4 py-3 flex justify-between items-end border-t rounded-b-xl shrink-0
          ${scanFlash ? 'border-indigo-100 bg-indigo-50/50' : 'border-slate-100 bg-slate-50/30'}
        `}
      >
        {/* Lewa strona stopki (Kto skanował) */}
        <div className="flex flex-col justify-end pb-0.5 min-w-0" data-wms-card-no-nav="">
          {audit?.lastOperatorName ? (
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-medium text-slate-600">
                {operatorAvatarInitials(audit)}
              </span>
              <p className="truncate text-[10px] text-slate-500">
                <span className="font-medium text-slate-600">{audit.lastOperatorName}</span>
                {audit.lastAt ? (
                  <span className="text-slate-400"> · {formatRelativeUpdatePl(audit.lastAt)}</span>
                ) : null}
              </p>
            </div>
          ) : (
            <div className="h-5"></div> // Wypełniacz zapobiegający skakaniu, gdy brak autora
          )}
        </div>

        {/* Prawa strona stopki (Ilość Przyjęto) */}
        <div className="text-right shrink-0 ml-3">
          <p className="text-[10px] font-medium uppercase text-slate-400 mb-0.5 leading-none">Przyjęto</p>
          <p
            className={`text-3xl font-bold tabular-nums leading-none tracking-tight ${
              displayCount > 0 ? (scanFlash ? "text-indigo-600" : "text-indigo-700") : "text-slate-800"
            }`}
          >
            {fmtQty(displayCount)}
          </p>
        </div>
      </div>

    </article>
  );
}