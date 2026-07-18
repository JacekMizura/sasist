import { useTranslation } from "../../../locales";
import { CartStatus } from "../../../types/cartStatus";

type StatusPillProps = {
  status: string | null | undefined;
};

function normalizeStatus(status: string) {
  return String(status).trim().toUpperCase().replace(/\s+/g, "_");
}

function classify(status: string): "available" | "inuse" | "other" {
  if (status === CartStatus.AVAILABLE) return "available";
  if (
    status === CartStatus.ASSIGNED ||
    status === CartStatus.PICKING ||
    status === CartStatus.READY_FOR_PACKING ||
    status === CartStatus.PACKING
  ) {
    return "inuse";
  }
  return "other";
}

function labelFor(status: string, t: ReturnType<typeof useTranslation>): string {
  switch (status) {
    case CartStatus.AVAILABLE:
      return t.statusAvailable;
    case CartStatus.ASSIGNED:
      return t.statusAssigned;
    case CartStatus.PICKING:
      return t.statusPicking;
    case CartStatus.READY_FOR_PACKING:
      return t.statusReadyForPacking;
    case CartStatus.PACKING:
      return t.statusPacking;
    default:
      return status || t.statusUnknown;
  }
}

/** Pasek statusu wózka — wyłącznie lifecycle CartStatus. */
export default function StatusPill({ status }: StatusPillProps) {
  const t = useTranslation();
  const s = normalizeStatus(status ?? "");
  const kind = classify(s);

  const cls =
    kind === "available"
      ? "bg-green-100 text-green-700"
      : kind === "inuse"
        ? "bg-blue-100 text-blue-700"
        : "bg-slate-100 text-slate-600";

  return (
    <span className={`px-3 py-1 rounded-full text-[9px] font-black ${cls}`}>{labelFor(s, t)}</span>
  );
}
