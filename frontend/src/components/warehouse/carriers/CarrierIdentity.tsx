import type { WarehouseCarrierRead } from "../../../api/wmsCarrierApi";
import { carrierPrefixMeta } from "./carrierConstants";

type Props = {
  carrier: Pick<WarehouseCarrierRead, "code" | "barcode" | "name" | "notes" | "is_mixed">;
  size?: "sm" | "md" | "lg";
  showSecondaryCode?: boolean;
  className?: string;
};

/** Kod techniczny + nazwa biznesowa + opis — bez duplikacji code/barcode. */
export function CarrierIdentity({
  carrier,
  size = "md",
  showSecondaryCode = false,
  className = "",
}: Props) {
  const primary = (carrier.barcode || carrier.code || "").trim() || "—";
  const secondary =
    showSecondaryCode && carrier.code && carrier.barcode && carrier.code !== carrier.barcode
      ? carrier.code.trim()
      : null;
  const displayName = (carrier.name || "").trim();
  const description = (carrier.notes || "").trim();
  const prefix = primary.split("-")[0]?.toUpperCase() ?? "";
  const meta = carrierPrefixMeta(prefix);

  const codeClass =
    size === "lg" ? "text-lg font-black" : size === "sm" ? "text-[13px] font-bold" : "text-[15px] font-bold";

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        {meta ? (
          <span
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[11px] font-black"
            style={{ borderColor: meta.border, backgroundColor: meta.bg, color: meta.fg }}
            title={meta.label}
          >
            {meta.icon}
          </span>
        ) : null}
        <span className={`font-mono tabular-nums text-slate-900 ${codeClass}`}>{primary}</span>
        {carrier.is_mixed ? (
          <span className="rounded border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-bold uppercase text-violet-800">
            MIX
          </span>
        ) : null}
      </div>
      {displayName ? (
        <p className={`mt-0.5 truncate font-semibold text-slate-800 ${size === "sm" ? "text-[13px]" : "text-[14px]"}`}>
          {displayName}
        </p>
      ) : null}
      {description ? (
        <p className={`mt-0.5 line-clamp-2 text-slate-500 ${size === "sm" ? "text-[12px]" : "text-[13px]"}`}>
          {description}
        </p>
      ) : null}
      {secondary ? (
        <p className="mt-0.5 font-mono text-[11px] text-slate-400">ID: {secondary}</p>
      ) : null}
    </div>
  );
}
