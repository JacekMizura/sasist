/** Polish relative time (e.g. „2 godziny temu”) for list rows. */
export function formatRelativeAgo(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const sec = Math.round((d.getTime() - Date.now()) / 1000);
    const rtf = new Intl.RelativeTimeFormat("pl", { numeric: "auto" });
    const abs = Math.abs(sec);
    if (abs < 60) return rtf.format(sec, "second");
    if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
    if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
    if (abs < 604800) return rtf.format(Math.round(sec / 86400), "day");
    if (abs < 2629800) return rtf.format(Math.round(sec / 604800), "week");
    if (abs < 31557600) return rtf.format(Math.round(sec / 2629800), "month");
    return rtf.format(Math.round(sec / 31557600), "year");
  } catch {
    return null;
  }
}
