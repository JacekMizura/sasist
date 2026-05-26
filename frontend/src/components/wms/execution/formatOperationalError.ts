/** Map API / network errors to short operator-facing Polish messages. */
export function formatOperationalError(e: unknown, fallback: string): string {
  if (!e) return fallback;

  if (typeof e === "string" && e.trim()) {
    return polishKnownMessage(e.trim());
  }

  if (e && typeof e === "object") {
    const ax = e as {
      response?: { status?: number; data?: { detail?: unknown } };
      message?: string;
    };
    const detail = ax.response?.data?.detail;
    if (typeof detail === "string" && detail.trim()) {
      return polishKnownMessage(detail.trim());
    }
    if (detail && typeof detail === "object") {
      const msg = (detail as { message?: string }).message;
      if (msg?.trim()) return polishKnownMessage(msg.trim());
    }
    const status = ax.response?.status;
    if (status === 409) return "Konflikt — odśwież zadanie lub przejmij sesję.";
    if (status === 404) return "Nie znaleziono — sprawdź skan lub magazyn.";
    if (status === 403) return "Brak uprawnień do tej operacji.";
    if (status === 423) return "Zasób zablokowany — spróbuj za chwilę.";
    if (status && status >= 500) return "Serwer niedostępny — spróbuj ponownie.";
    if (ax.message && !ax.message.includes("Network Error")) {
      return polishKnownMessage(ax.message);
    }
    if (ax.message?.includes("Network Error")) {
      return "Brak połączenia — akcja zostanie w kolejce po powrocie sieci.";
    }
  }

  return fallback;
}

function polishKnownMessage(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("internal server")) return "Operacja nie powiodła się — spróbuj ponownie.";
  if (lower.includes("carrier") && lower.includes("closed")) return "Nośnik jest zamknięty.";
  if (lower.includes("wrong") && lower.includes("task")) return "Produkt należy do innego zadania.";
  if (lower.includes("session") && lower.includes("lock")) return "Zadanie obsługuje inny operator.";
  if (lower.includes("active carrier") || lower.includes("scan active")) {
    return "Zeskanuj aktywny nośnik docelowy.";
  }
  if (lower.includes("not found") || lower.includes("nie znaleziono")) {
    return raw.includes("nośnik") || lower.includes("carrier")
      ? "Nie rozpoznano nośnika — sprawdź kod."
      : "Brak w systemie dla tego skanu.";
  }
  if (lower.includes("lock_version") || lower.includes("stale")) {
    return "Dane nieaktualne — odświeżam zadanie.";
  }
  return raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
}
