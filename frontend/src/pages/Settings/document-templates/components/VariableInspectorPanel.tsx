import toast from "react-hot-toast";

import type { VariableFieldDto } from "../../../../api/documentTemplatesApi";

const TYPE_LABELS: Record<string, string> = {
  string: "Tekst",
  number: "Liczba",
  money: "Kwota",
  quantity: "Ilość",
  date: "Data",
  datetime: "Data i czas",
  boolean: "Tak/Nie",
  image: "Obraz",
  barcode: "Kod kreskowy",
  qr: "Kod QR",
  array: "Lista",
  object: "Obiekt",
};

type Props = {
  field: VariableFieldDto | null;
  onInsert: (snippet: string) => void;
  onSearchUsage?: (path: string) => void;
};

export function VariableInspectorPanel({ field, onInsert, onSearchUsage }: Props) {
  if (!field) {
    return (
      <div className="border-t border-slate-200 bg-white p-3 text-[11px] text-slate-500">
        Kliknij zmienną w drzewie, aby zobaczyć szczegóły.
      </div>
    );
  }

  const insert = field.insert || `{{ ${field.path.replace("[]", "")} }}`;

  async function copyVariable() {
    try {
      await navigator.clipboard.writeText(insert);
      toast.success("Skopiowano do schowka.");
    } catch {
      toast.error("Nie udało się skopiować.");
    }
  }

  return (
    <div className="border-t border-slate-200 bg-white p-3 text-[11px]">
      <div className="font-semibold text-slate-900">{field.label}</div>
      <dl className="mt-2 space-y-1.5 text-slate-600">
        <Row label="Ścieżka" value={field.path} mono />
        <Row label="Typ" value={TYPE_LABELS[field.type] ?? field.type} />
        {field.description ? <Row label="Opis" value={field.description} /> : null}
        <Row label="Przykład" value={field.sample_value || "—"} />
        <Row label="Wymagane" value={field.required ? "Tak" : "Nie"} />
        <Row label="Źródło danych" value={field.provider_label || field.provider_key || "—"} />
        <Row label="Kolekcja" value={field.is_collection ? "Tak" : "Nie"} />
        <Row label="Do pętli" value={field.loop_usable ? `Tak (${field.loop_var || "row"})` : "Nie"} />
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md bg-slate-900 px-2.5 py-1 text-[11px] font-medium text-white"
          onClick={copyVariable}
        >
          Kopiuj zmienną
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px]"
          onClick={() => onInsert(insert)}
        >
          Wstaw
        </button>
        {onSearchUsage ? (
          <button
            type="button"
            className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] text-blue-700"
            onClick={() => onSearchUsage(field.path.replace("[]", ""))}
          >
            Gdzie używana?
          </button>
        ) : null}
      </div>
      <div className="mt-2 rounded bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-700">{insert}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_1fr] gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className={mono ? "font-mono text-slate-800" : "text-slate-800"}>{value}</dd>
    </div>
  );
}
