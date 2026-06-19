/**
 * Statyczny mockup sidebara statusów — NIE podpięty do aplikacji.
 * Cel: wierniejsze odwzorowanie konceptu drzewa (kontenery + spacing, nie paski).
 *
 * Podgląd lokalny (dev): tymczasowo zaimportuj w dowolnym route lub Storybook.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

type MockActiveId =
  | "wszystkie"
  | "nowe"
  | "braki"
  | "w-toku"
  | "pakowanie"
  | "pilne";

function MockCount({ value, muted }: { value: number | string; muted?: boolean }) {
  return (
    <span
      className={`shrink-0 tabular-nums text-xs font-medium ${muted ? "text-slate-400" : "text-slate-500"}`}
    >
      {value}
    </span>
  );
}

/** Subtelny akcent koloru — nie pełna wysokość wiersza. */
function MockAccent({ className }: { className: string }) {
  return <span className={`inline-block h-4 w-1 shrink-0 rounded-full ${className}`} aria-hidden />;
}

function MockMetaRow({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number | string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
        active
          ? "border-slate-200 bg-slate-100 text-slate-900"
          : "border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span>{label}</span>
      <MockCount value={count} />
    </button>
  );
}

function MockGroupRow({
  label,
  count,
  accentClass,
  expanded,
  active,
  onFilter,
  onToggle,
}: {
  label: string;
  count: number;
  accentClass: string;
  expanded: boolean;
  active: boolean;
  onFilter: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex overflow-hidden rounded-lg border transition-colors ${
        active ? "border-slate-200 bg-slate-100" : "border-slate-200/80 bg-white"
      }`}
    >
      <button
        type="button"
        onClick={onFilter}
        className={`flex min-h-[44px] flex-1 items-center gap-2.5 px-3 py-2.5 text-left text-sm font-semibold text-slate-800 transition-colors ${
          active ? "" : "hover:bg-slate-50"
        }`}
      >
        <MockAccent className={accentClass} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <MockCount value={count} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="flex shrink-0 items-center border-l border-slate-100 px-2.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600"
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
    </div>
  );
}

function MockSubgroupHeader({ label }: { label: string }) {
  return (
    <div className="mb-1 mt-3 flex items-center gap-3">
      <span className="shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

function MockStatusRow({
  label,
  count,
  accentClass,
  active,
  indentRem,
  onClick,
}: {
  label: string;
  count: number;
  accentClass: string;
  active: boolean;
  indentRem: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ marginLeft: `${indentRem}rem` }}
      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "border-slate-200 bg-slate-100 font-medium text-slate-900"
          : "border-transparent font-normal text-slate-700 hover:border-slate-100 hover:bg-slate-50"
      }`}
    >
      <MockAccent className={accentClass} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <MockCount value={count} muted={count === 0} />
    </button>
  );
}

/**
 * Mockup jednego fragmentu drzewa:
 *
 *   Nowe → Problemy → Braki
 *   W toku → Pakowanie → Pakowanie (+ Pilne jako drugi przykład)
 */
export function PanelStatusTreeSidebarMockup() {
  const [activeId, setActiveId] = useState<MockActiveId>("braki");
  const [openNowe, setOpenNowe] = useState(true);
  const [openWtoku, setOpenWtoku] = useState(true);

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans text-slate-900">
      <div className="mx-auto flex max-w-5xl gap-8">
        {/* Sidebar mock */}
        <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Status panelu</h2>
            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Szukaj statusu..."
                className="block w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <MockMetaRow
              label="Wszystkie"
              count={1233}
              active={activeId === "wszystkie"}
              onClick={() => setActiveId("wszystkie")}
            />
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-6 pt-2">
            {/* ── NOWE ── */}
            <div className="pt-2">
              <MockGroupRow
                label="Nowe"
                count={5}
                accentClass="bg-blue-500"
                expanded={openNowe}
                active={activeId === "nowe"}
                onFilter={() => setActiveId("nowe")}
                onToggle={() => setOpenNowe((v) => !v)}
              />
            </div>

            {openNowe ? (
              <div className="mt-3 space-y-1 pl-5">
                <MockSubgroupHeader label="Problemy" />
                <MockStatusRow
                  label="Braki"
                  count={5}
                  accentClass="bg-red-500"
                  active={activeId === "braki"}
                  indentRem={0}
                  onClick={() => setActiveId("braki")}
                />
              </div>
            ) : null}

            {/* ── W TOKU ── */}
            <div className="pt-7">
              <MockGroupRow
                label="W toku"
                count={1224}
                accentClass="bg-amber-500"
                expanded={openWtoku}
                active={activeId === "w-toku"}
                onFilter={() => setActiveId("w-toku")}
                onToggle={() => setOpenWtoku((v) => !v)}
              />
            </div>

            {openWtoku ? (
              <div className="mt-3 space-y-1 pl-5">
                <MockStatusRow
                  label="W toku"
                  count={1224}
                  accentClass="bg-amber-500"
                  active={activeId === "w-toku"}
                  indentRem={0}
                  onClick={() => setActiveId("w-toku")}
                />

                <MockSubgroupHeader label="Pakowanie" />
                <MockStatusRow
                  label="Pakowanie"
                  count={16}
                  accentClass="bg-slate-500"
                  active={activeId === "pakowanie"}
                  indentRem={0}
                  onClick={() => setActiveId("pakowanie")}
                />

                <MockSubgroupHeader label="Zbieranie" />
                <MockStatusRow
                  label="Wózki z koszykami..."
                  count={1202}
                  accentClass="bg-green-500"
                  active={false}
                  indentRem={0}
                  onClick={() => setActiveId("pilne")}
                />
                <MockStatusRow
                  label="Pilne"
                  count={6}
                  accentClass="bg-red-500"
                  active={activeId === "pilne"}
                  indentRem={0}
                  onClick={() => setActiveId("pilne")}
                />
              </div>
            ) : null}
          </div>
        </aside>

        {/* Kontekst — zaślepka listy */}
        <div className="min-w-0 flex-1 pt-2">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-slate-400">Podgląd mockupu</p>
          <h1 className="mb-2 text-2xl font-bold text-slate-800">Lista zamówień</h1>
          <p className="mb-6 text-sm text-slate-500">
            Aktywny filtr: <span className="font-medium text-slate-800">{activeId}</span>
          </p>
          <div className="flex h-96 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
            Tabela zamówień…
          </div>

          <div className="mt-8 rounded-lg border border-dashed border-slate-300 bg-white/60 p-4 text-xs leading-relaxed text-slate-500">
            <p className="mb-2 font-semibold text-slate-700">Zasady mockupu (vs obecny sidebar)</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Grupa i status = osobne kontenery (border + rounded-lg + padding)</li>
              <li>Hierarchia = odstępy (mt-3 / pt-7) + wcięcie pl-5, nie pionowe paski</li>
              <li>Akcent koloru = mały segment h-4 w-1, nie belka na całą wysokość</li>
              <li>Podgrupa = nagłówek sekcji z linią, nie wiersz listy</li>
              <li>Active = bg-slate-100 + border-slate-200 (ERP, bez niebieskiego mobile)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PanelStatusTreeSidebarMockup;
