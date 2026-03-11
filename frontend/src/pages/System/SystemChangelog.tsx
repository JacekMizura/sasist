import { useEffect, useState } from "react";
import { getChangelog } from "../../api/systemApi";

export default function SystemChangelog() {
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getChangelog()
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message ?? "Błąd ładowania");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-6"><p className="text-slate-500">Ładowanie…</p></div>;
  if (error) {
    return (
      <div className="p-6">
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-red-800">
          <p className="font-medium">Błąd</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">Changelog</h2>
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
        <pre className="block p-6 text-sm text-slate-700 whitespace-pre-wrap font-sans max-h-[70vh] overflow-y-auto">
          {content || "(Brak treści)"}
        </pre>
      </div>
    </div>
  );
}
