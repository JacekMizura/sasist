import { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/axios";

type ScanResponse = {
  type: string | null;
  id: number | null;
  additional_data: Record<string, unknown>;
};

const PLACEHOLDER = "Skanuj kod lub wyszukaj...";

export default function GlobalScanSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
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

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 flex-1 max-w-md">
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
          className="w-full rounded-lg border border-slate-200 px-4 py-2 pr-10 text-sm text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
          aria-label={PLACEHOLDER}
        />
        {loading && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-slate-300 border-t-blue-600 rounded-full animate-spin"
            aria-hidden
          />
        )}
      </div>
      {error && (
        <span className="text-xs text-red-600 whitespace-nowrap" role="alert">
          {error}
        </span>
      )}
    </form>
  );
}
