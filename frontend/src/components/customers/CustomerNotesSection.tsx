import { useCallback, useEffect, useState } from "react";
import {
  createCustomerNote,
  deleteCustomerNote,
  fetchCustomerNotes,
  updateCustomerNote,
  type CustomerNote,
} from "../../api/customerCrmApi";
import { Pin, Trash2 } from "lucide-react";

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30";

type Props = {
  customerId: number;
  tenantId: number;
};

export function CustomerNotesSection({ customerId, tenantId }: Props) {
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNotes(await fetchCustomerNotes(customerId, tenantId));
    } catch {
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addNote = async () => {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      await createCustomerNote(customerId, tenantId, text);
      setBody("");
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200/90 bg-white p-4">
      <h2 className="text-sm font-bold text-slate-800">Notatki handlowe</h2>
      <p className="mt-1 text-xs text-slate-500">Wewnętrzne informacje o kliencie — widoczne tylko w systemie.</p>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1 text-xs font-medium text-slate-600">
          Nowa notatka
          <textarea
            className={`${inp} min-h-[72px] resize-y`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Np. klient VIP, preferuje telefon…"
          />
        </label>
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void addNote()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Dodaj
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Ładowanie notatek…</p>
      ) : notes.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Brak notatek.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {notes.map((note) => (
            <li
              key={note.id}
              className={`rounded-lg border px-3 py-2.5 ${
                note.is_pinned ? "border-blue-200 bg-blue-50/40" : "border-slate-100 bg-slate-50/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap text-sm text-slate-800">{note.body}</p>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    title={note.is_pinned ? "Odepnij" : "Przypnij"}
                    onClick={() =>
                      void updateCustomerNote(customerId, note.id, tenantId, {
                        is_pinned: !note.is_pinned,
                      }).then(load)
                    }
                    className="rounded p-1 text-slate-500 hover:bg-white hover:text-blue-700"
                  >
                    <Pin className={`h-4 w-4 ${note.is_pinned ? "fill-blue-600 text-blue-600" : ""}`} />
                  </button>
                  <button
                    type="button"
                    title="Usuń"
                    onClick={() => void deleteCustomerNote(customerId, note.id, tenantId).then(load)}
                    className="rounded p-1 text-slate-500 hover:bg-white hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="mt-1 text-[10px] text-slate-500">
                {note.author_name ?? "System"} · {new Date(note.created_at).toLocaleString("pl-PL")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
