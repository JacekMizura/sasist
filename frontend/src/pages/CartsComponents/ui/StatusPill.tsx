import { useTranslation } from "../../../locales";

type StatusPillProps = {
  status: string | null | undefined;
};

function normalizeStatus(status: string) {
  return String(status).trim().toUpperCase();
}

function classify(status: string) {
  // Backend currently may send Polish enum values uppercased (e.g. PUSTY, W TRAKCIE ZBIERANIA).
  if (["AVAILABLE", "FREE", "PUSTY"].includes(status)) return "available";
  if (["IN_USE", "BUSY", "OCCUPIED", "IN_PROGRESS", "W TRAKCIE ZBIERANIA"].includes(status)) return "inuse";
  if (["FULL", "PEŁNY", "PELNY"].includes(status)) return "full";
  return "other";
}

/** Pasek statusu wózka: DOSTĘPNY / W UŻYCIU / PEŁNY (kolory zielony / niebieski / czerwony). */
export default function StatusPill({ status }: StatusPillProps) {
  const t = useTranslation();
  const s = normalizeStatus(status ?? "");
  const kind = classify(s);

  const cls =
    kind === "available"
      ? "bg-green-100 text-green-700"
      : kind === "inuse"
        ? "bg-blue-100 text-blue-700"
        : kind === "full"
          ? "bg-red-100 text-red-700"
          : "bg-slate-100 text-slate-600";

  const label =
    kind === "available"
      ? t.statusAvailable
      : kind === "inuse"
        ? t.statusInUse
        : kind === "full"
          ? t.statusFull
          : s || t.statusUnknown;

  return <span className={`px-3 py-1 rounded-full text-[9px] font-black ${cls}`}>{label}</span>;
}

