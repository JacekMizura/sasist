function dayLabel(days: number): string {
  return days === 1 ? "1 dzień" : `${days} dni`;
}

/**
 * Formats warehouse operational durations without overflowing raw hours.
 * Input is minutes because WMS queues, SLA timers, and activity ages mostly use minutes.
 */
export function formatOperationalDuration(minutes: number | null | undefined): string {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  if (safe < 60) return `${safe} min`;

  const totalHours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (totalHours < 24) {
    return mins ? `${totalHours}h ${mins} min` : `${totalHours}h`;
  }

  const totalDays = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (totalDays < 7) {
    return [dayLabel(totalDays), hours ? `${hours}h` : "", mins ? `${mins} min` : ""]
      .filter(Boolean)
      .join(" ");
  }

  const weeks = Math.floor(totalDays / 7);
  const days = totalDays % 7;
  return [`${weeks} tydz.`, days ? dayLabel(days) : "", hours ? `${hours}h` : ""]
    .filter(Boolean)
    .join(" ");
}

export function formatOperationalDurationFromSeconds(seconds: number | null | undefined): string {
  return formatOperationalDuration((Number(seconds) || 0) / 60);
}

export function formatOperationalDurationSince(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return "—";
  return formatOperationalDuration((now - time) / 60000);
}

export function formatOperationalAgo(iso: string | null | undefined, now = Date.now()): string {
  const value = formatOperationalDurationSince(iso, now);
  return value === "—" ? value : `${value} temu`;
}

export function formatOperationalDurationText(value: string | null | undefined): string {
  if (!value) return "";
  return String(value)
    .replace(/\b(\d+)\s*h(?:\s*(\d+)\s*(?:m|min))?\b/g, (_match, hoursRaw, minsRaw) => {
      const minutes = Number(hoursRaw) * 60 + (Number(minsRaw) || 0);
      return formatOperationalDuration(minutes);
    })
    .replace(/\b(\d+)\s*min\b/g, (_match, minsRaw) => formatOperationalDuration(Number(minsRaw)));
}
