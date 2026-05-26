import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";

const FLOOR_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const STORAGE_KEY = "label_print_saved_floor_filters_v1";

export type FloorFilterMode = "exclude" | "include_only";

export type FloorFilterUiState = {
  mode: FloorFilterMode;
  /** Sorted unique A–Z; meaning depends on `mode`. */
  tokens: string[];
};

export type SavedFloorFilter = {
  id: string;
  name: string;
  mode: FloorFilterMode;
  tokens: string[];
};

/** Letters to send as `exclude_floors` (matches backend `apply_label_filters`). */
export function excludeFloorsFromUiState(s: FloorFilterUiState): string[] {
  if (s.mode === "exclude") {
    return [...s.tokens].sort();
  }
  if (s.tokens.length === 0) {
    return [];
  }
  const keep = new Set(s.tokens);
  return FLOOR_LETTERS.filter((l) => !keep.has(l));
}

function parseFloorLetters(raw: string): string[] {
  const upper = raw.toUpperCase();
  const out = new Set<string>();
  for (const ch of upper) {
    if (ch >= "A" && ch <= "Z") out.add(ch);
  }
  return [...out].sort();
}

function normalizeSavedList(raw: unknown): SavedFloorFilter[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedFloorFilter[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const mode = o.mode === "include_only" ? "include_only" : "exclude";
    const tokens = Array.isArray(o.tokens)
      ? parseFloorLetters(o.tokens.filter((x) => typeof x === "string").join(","))
      : [];
    if (!id || !name) continue;
    out.push({ id, name, mode, tokens });
  }
  return out;
}

function loadSavedFromStorage(): SavedFloorFilter[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw?.trim()) return [];
    return normalizeSavedList(JSON.parse(raw));
  } catch {
    return [];
  }
}

function persistSaved(list: SavedFloorFilter[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

type Props = {
  value: FloorFilterUiState;
  onChange: (next: FloorFilterUiState) => void;
  /** Shown below controls when non-null / non-false */
  summaryFooter?: ReactNode;
};

export function FloorExclusionPanel({ value, onChange, summaryFooter }: Props) {
  const [draft, setDraft] = useState("");
  const [filterNameDraft, setFilterNameDraft] = useState("");
  const [savedList, setSavedList] = useState<SavedFloorFilter[]>(loadSavedFromStorage);
  const inputRef = useRef<HTMLInputElement>(null);

  const mergeTokens = useCallback(
    (letters: string[]) => {
      if (letters.length === 0) return;
      const next = new Set(value.tokens);
      for (const l of letters) next.add(l);
      onChange({ ...value, tokens: [...next].sort() });
    },
    [value, onChange],
  );

  const applyParsedDraft = useCallback(() => {
    const letters = parseFloorLetters(draft);
    mergeTokens(letters);
    setDraft("");
  }, [draft, mergeTokens]);

  const removeToken = useCallback(
    (letter: string) => {
      onChange({ ...value, tokens: value.tokens.filter((t) => t !== letter) });
    },
    [value, onChange],
  );

  const presetAll = useCallback(() => {
    onChange({ mode: "exclude", tokens: [] });
  }, [onChange]);

  const presetExcludeAF = useCallback(() => {
    onChange({ mode: "exclude", tokens: ["A", "B", "C", "D", "E", "F"] });
  }, [onChange]);

  const presetIncludeOnly = useCallback(() => {
    onChange({ mode: "include_only", tokens: [] });
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onChange]);

  const saveCurrent = useCallback(() => {
    const name = filterNameDraft.trim();
    if (!name) return;
    const entry: SavedFloorFilter = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `f-${Date.now()}`,
      name,
      mode: value.mode,
      tokens: [...value.tokens].sort(),
    };
    setSavedList((prev) => {
      const next = [...prev.filter((s) => s.name.toLowerCase() !== name.toLowerCase()), entry];
      persistSaved(next);
      return next;
    });
    setFilterNameDraft("");
  }, [filterNameDraft, value.mode, value.tokens]);

  const loadSaved = useCallback(
    (s: SavedFloorFilter) => {
      onChange({ mode: s.mode, tokens: [...s.tokens].sort() });
    },
    [onChange],
  );

  const deleteSaved = useCallback((id: string) => {
    setSavedList((prev) => {
      const next = prev.filter((x) => x.id !== id);
      persistSaved(next);
      return next;
    });
  }, []);

  const modeLabel = useMemo(
    () =>
      value.mode === "exclude"
        ? "Zaznaczone litery oznaczają piętra pomijane przy wydruku. Gdy lista jest pusta — drukujemy wszystkie piętra."
        : "Zaznaczone litery oznaczają jedyne piętra, które mają trafić na etykiety. Pozostałe są pomijane.",
    [value.mode],
  );

  const chipLabel = value.mode === "exclude" ? "Pomijane piętra" : "Drukowane piętra";

  const toggleLetter = useCallback(
    (letter: string) => {
      if (value.tokens.includes(letter)) removeToken(letter);
      else mergeTokens([letter]);
    },
    [value, mergeTokens, removeToken],
  );

  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-slate-50/80 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">Filtr pięter</span>
        <button type="button" className="text-xs text-cyan-700 hover:underline" onClick={presetAll}>
          Wyczyść filtr
        </button>
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Litera piętra pochodzi z kodu lokalizacji (np. przy kodzie A1-<strong className="font-semibold text-slate-700">C</strong>-6
        piętro to <strong>C</strong>). Jeśli w danych jest pole piętra, jest ono używane w pierwszej kolejności. To samo
        ograniczenie działa dla etykiet z magazynu oraz dla importu CSV.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "exclude" })}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
            value.mode === "exclude"
              ? "border-cyan-500 bg-cyan-50 text-cyan-900"
              : "border-[#E2E8F0] bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Pomijaj zaznaczone litery
        </button>
        <button
          type="button"
          onClick={() => onChange({ ...value, mode: "include_only" })}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
            value.mode === "include_only"
              ? "border-cyan-500 bg-cyan-50 text-cyan-900"
              : "border-[#E2E8F0] bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          Drukuj tylko wybrane litery
        </button>
      </div>

      <p className="text-xs text-slate-600">{modeLabel}</p>

      <div>
        <div className="flex flex-wrap gap-1">
          {FLOOR_LETTERS.map((letter) => {
            const on = value.tokens.includes(letter);
            return (
              <button
                key={letter}
                type="button"
                title={on ? `Usuń ${letter} z listy` : `Dodaj ${letter}`}
                onClick={() => toggleLetter(letter)}
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-md border text-xs font-semibold transition",
                  on
                    ? "border-cyan-600 bg-cyan-600 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                {letter}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={presetAll}
          className="rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Wszystkie piętra
        </button>
        <button
          type="button"
          onClick={presetExcludeAF}
          className="rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Wyklucz A–F
        </button>
        <button
          type="button"
          onClick={presetIncludeOnly}
          className="rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Tylko wybrane…
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="block text-xs font-medium text-slate-600">Litery (np. A, F, G lub ciąg AFG)</label>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyParsedDraft();
              }
            }}
            placeholder="np. W, Y, Z"
            className="min-w-[12rem] flex-1 rounded border border-[#E2E8F0] bg-white px-2 py-1.5 text-sm text-[#1E293B]"
          />
          <button
            type="button"
            onClick={applyParsedDraft}
            className="rounded-md bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700"
          >
            Dodaj
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">{chipLabel}</p>
        {value.tokens.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Brak — wpisz litery i wciśnij Enter lub „Dodaj”.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {value.tokens.map((letter) => (
              <span
                key={letter}
                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white pl-2 pr-1 py-0.5 text-xs font-semibold text-slate-800"
              >
                {letter}
                <button
                  type="button"
                  onClick={() => removeToken(letter)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-red-50 hover:text-red-700"
                  aria-label={`Usuń ${letter}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {value.mode === "include_only" && value.tokens.length === 0 && (
          <p className="text-xs text-amber-800 mt-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1">
            Wybrano „Drukuj tylko wybrane litery”, ale lista jest pusta — w praktyce nie ograniczasz wtedy wydruku. Zaznacz
            przynajmniej jedną literę albo przełącz na pomijanie.
          </p>
        )}
      </div>

      <div className="rounded-md border border-dashed border-slate-200 bg-white/80 p-2 space-y-2">
        <p className="text-xs font-medium text-slate-600">Zapisane filtry</p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            type="text"
            value={filterNameDraft}
            onChange={(e) => setFilterNameDraft(e.target.value)}
            placeholder="Nazwa zestawu (np. Magazyn B)"
            className="min-w-[10rem] flex-1 rounded border border-[#E2E8F0] px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={saveCurrent}
            disabled={!filterNameDraft.trim()}
            className="rounded-md border border-cyan-600 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-900 disabled:opacity-40"
          >
            Zapisz
          </button>
        </div>
        {savedList.length === 0 ? (
          <p className="text-xs text-slate-400">Brak zapisanych filtrów — zapisz bieżące ustawienie pod nazwą.</p>
        ) : (
          <ul className="space-y-1 max-h-32 overflow-y-auto text-xs">
            {savedList.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1"
              >
                <span className="font-medium text-slate-800 truncate max-w-[12rem]" title={s.name}>
                  {s.name}
                </span>
                <span className="text-slate-500">
                  {s.mode === "include_only" ? "tylko" : "bez"}{" "}
                  {s.tokens.length ? [...s.tokens].sort().join(", ") : "—"}
                </span>
                <span className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    className="text-cyan-700 hover:underline"
                    onClick={() => loadSaved(s)}
                  >
                    Wczytaj
                  </button>
                  <button type="button" className="text-red-600 hover:underline" onClick={() => deleteSaved(s.id)}>
                    Usuń
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {summaryFooter ? (
        <div className="text-xs text-slate-600 border-t border-slate-200 pt-2">{summaryFooter}</div>
      ) : null}
    </div>
  );
}
