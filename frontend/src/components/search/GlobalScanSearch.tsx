import { useRef, useState, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";

type ScanResponse = {
  type: string | null;
  id: number | null;
  additional_data: Record<string, unknown>;
};

const PLACEHOLDER = "Skanuj kod lub wyszukaj...";

function useKbdShortcutLabel(): string {
  const [label, setLabel] = useState("Ctrl+K");
  useEffect(() => {
    try {
      const p = typeof navigator !== "undefined" ? navigator.platform : "";
      if (/Mac|iPhone|iPod|iPad/i.test(p)) setLabel("⌘K");
    } catch {
      /* ignore */
    }
  }, []);
  return label;
}

export type GlobalScanSearchVariant = "default" | "wmsTopbar" | "wmsCompact" | "panelStrip";

type GlobalScanSearchProps = {
  /** `wmsTopbar` / `wmsCompact`: icon + shortcut inside field (WMS uses compact for density). */
  variant?: GlobalScanSearchVariant;
  className?: string;
  /** Focus target for WMS shortcuts (`document.getElementById`). */
  inputId?: string;
};

export default function GlobalScanSearch({ variant = "default", className, inputId }: GlobalScanSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const kbdLabel = useKbdShortcutLabel();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const focusSearch = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = value.trim();
    if (!raw) return;

    setLoading(true);
    setError(null);

    try {
      const { data } = await api.post<ScanResponse>("/scan/", { barcode: raw });
      const { type, id, additional_data } = data;

      if (type === "cart" && id != null) {
        setValue("");
        navigate(`/carts/${id}`);
        return;
      }

      if (type === "product" && id != null) {
        setValue("");
        navigate(`/products/${id}`);
        return;
      }

      if (type === "order" && id != null) {
        setValue("");
        navigate(`/orders/list`, { state: { highlightOrderId: id } });
        return;
      }

      if (type === "basket" && additional_data?.cart_id != null) {
        setValue("");
        navigate(`/carts/${additional_data.cart_id}`);
        return;
      }

      if (type === "location") {
        setValue("");
        const code = (additional_data?.location_code as string) || raw;
        navigate(`/designer?location=${encodeURIComponent(code)}`);
        return;
      }

      setError("Nie znaleziono");
      setValue("");
    } catch (err) {
      console.error(err);
      setError("Błąd wyszukiwania. Sprawdź połączenie.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  if (variant === "wmsTopbar" || variant === "wmsCompact" || variant === "panelStrip") {
    const dense = variant === "wmsCompact" || variant === "panelStrip";
    const ultra = variant === "panelStrip";
    return (
      <form
        onSubmit={handleSubmit}
        className={["flex min-w-0 w-full flex-col items-stretch gap-1", className ?? ""].filter(Boolean).join(" ")}
      >
        <div
          className={
            dense
              ? "rounded-lg border border-slate-300/80 bg-white p-[2px] shadow-sm"
              : "rounded-full border border-slate-400/35 bg-gradient-to-b from-slate-100/90 to-slate-200/50 p-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_2px_6px_rgba(15,23,42,0.08)]"
          }
        >
          <div className="relative w-full min-w-0">
            <span
              className={
                dense
                  ? ultra
                    ? "pointer-events-none absolute left-0.5 top-0.5 bottom-0.5 flex w-7 items-center justify-center rounded-md bg-slate-100"
                    : "pointer-events-none absolute left-1 top-1 bottom-1 flex w-8 items-center justify-center rounded-md bg-slate-100"
                  : "pointer-events-none absolute left-1 top-1 bottom-1 flex w-9 items-center justify-center rounded-full bg-slate-900/[0.06] ring-1 ring-slate-900/[0.04]"
              }
            >
              <Search className={ultra ? "h-3.5 w-3.5 text-slate-600" : dense ? "h-4 w-4 text-slate-600" : "h-[18px] w-[18px] text-slate-600"} strokeWidth={2.35} aria-hidden />
            </span>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={handleKeyDown}
              placeholder={PLACEHOLDER}
              disabled={loading}
              className={
                dense
                  ? ultra
                    ? "h-8 w-full rounded-md border border-slate-200 bg-white py-1 pl-9 pr-14 text-[12px] font-semibold text-slate-900 shadow-inner placeholder:font-medium placeholder:text-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500/30 disabled:opacity-60"
                    : "h-9 w-full rounded-md border border-slate-200 bg-white py-1.5 pl-10 pr-16 text-[13px] font-semibold text-slate-900 shadow-inner placeholder:font-medium placeholder:text-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/25 disabled:opacity-60"
                  : "h-11 w-full rounded-full border border-slate-300/90 bg-white py-2 pl-12 pr-[4.75rem] text-[13px] font-semibold text-slate-900 shadow-[inset_0_1px_2px_rgba(15,23,42,0.05)] placeholder:font-medium placeholder:text-slate-500 transition focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/30 disabled:opacity-60"
              }
              aria-label={PLACEHOLDER}
            />
            {!loading ? (
              <kbd
                className={`pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border border-slate-800/10 bg-slate-900 font-sans font-bold uppercase tracking-wide text-white shadow-sm sm:inline-block ${ultra ? "px-1 py-0.5 text-[8px]" : dense ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]"}`}
                aria-hidden
              >
                {kbdLabel}
              </kbd>
            ) : (
              <span
                className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-slate-200 border-t-sky-600 animate-spin"
                aria-hidden
              />
            )}
          </div>
        </div>
        {error ? (
          <span className="text-center text-[11px] font-medium text-red-600 sm:text-left" role="alert">
            {error}
          </span>
        ) : null}
      </form>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={["flex max-w-md flex-1 items-center gap-2", className ?? ""].filter(Boolean).join(" ")}
    >
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDER}
          disabled={loading}
          className="w-full rounded-lg border border-slate-200 px-4 py-2 pr-10 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          aria-label={PLACEHOLDER}
        />
        {loading && (
          <span
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"
            aria-hidden
          />
        )}
      </div>
      {error && (
        <span className="whitespace-nowrap text-xs text-red-600" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
