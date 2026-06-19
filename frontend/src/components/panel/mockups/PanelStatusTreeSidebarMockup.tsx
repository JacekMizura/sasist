/**
 * Statyczny mockup sidebara statusów v2 — NIE podpięty do aplikacji.
 *
 * Zasady:
 * - Grupa = folder/kontener sekcji (zawsze wyraźniejszy niż status)
 * - Status nieaktywny = lekki wiersz listy (bez border/karty)
 * - Status aktywny = jedyny kontener (bg + border + rounded-lg)
 * - Podgrupa = nagłówek sekcji + linia
 * - Operacyjne = ten sam język co statusy
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";

type MockActiveId =
  | "wszystkie"
  | "nowe"
  | "braki"
  | "w-toku"
  | "pakowanie"
  | "pilne"
  | "op-przyjecie"
  | "op-weryfikacja";

function MockCount({ value, muted }: { value: number | string; muted?: boolean }) {
  return (
    <span
      className={`shrink-0 tabular-nums text-xs font-medium ${muted ? "text-slate-400" : "text-slate-500"}`}
    >
      {value}
    </span>
  );
}

function MockAccent({ className }: { className: string }) {
  return <span className={`inline-block h-3.5 w-1 shrink-0 rounded-full ${className}`} aria-hidden />;
}

/** Meta + status + operacyjne — wspólny wzorzec wiersza. */
function MockListRow({
  label,
  count,
  accentClass,
  active,
  onClick,
}: {
  label: string;
  count?: number | string;
  accentClass?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors ${
        active
          ? "rounded-lg border border-slate-200 bg-slate-100 font-medium text-slate-900"
          : "rounded-lg border border-transparent font-normal text-slate-700 hover:bg-slate-50"
      }`}
    >
      {accentClass ? <MockAccent className={accentClass} /> : <span className="w-1 shrink-0" aria-hidden />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? <MockCount value={count} muted={count === 0} /> : null}
    </button>
  );
}

/** Grupa główna — folder sekcji; chevron tuż przy nazwie. */
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
      className={`rounded-lg border px-2.5 py-2 transition-colors ${
        active ? "border-slate-200 bg-slate-100" : "border-slate-200/90 bg-slate-50/80"
      }`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onFilter}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md py-0.5 pl-0.5 pr-1 text-left transition-colors ${
            active ? "" : "hover:bg-white/60"
          }`}
        >
          <MockAccent className={accentClass} />
          <span className="truncate text-sm font-bold text-slate-800">{label}</span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="shrink-0 rounded p-0.5 text-slate-400 transition-colors hover:bg-white/70 hover:text-slate-600"
          aria-expanded={expanded}
          aria-label={expanded ? "Zwiń grupę" : "Rozwiń grupę"}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <MockCount value={count} />
      </div>
    </div>
  );
}

function MockSubgroupHeader({ label }: { label: string }) {
  return (
    <div className="mb-0.5 mt-1.5 flex items-center gap-2 pl-0.5">
      <span className="shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

function MockSectionLabel({ label }: { label: string }) {
  return (
    <div className="mb-0.5 mt-2 flex items-center gap-2 border-t border-slate-100 pt-2 pl-0.5">
      <span className="shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <div className="h-px flex-1 bg-slate-100" />
    </div>
  );
}

export function PanelStatusTreeSidebarMockup() {
  const [activeId, setActiveId] = useState<MockActiveId>("braki");
  const [openNowe, setOpenNowe] = useState(true);
  const [openWtoku, setOpenWtoku] = useState(true);

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans text-slate-900">
      <div className="mx-auto flex max-w-5xl gap-8">
        <aside className="flex w-[340px] shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4 pb-3">
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Status panelu</h2>
            <div className="relative mb-2.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Szukaj statusu..."
                className="block w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-slate-300"
              />
            </div>
            <MockListRow
              label="Wszystkie"
              count={1233}
              active={activeId === "wszystkie"}
              onClick={() => setActiveId("wszystkie")}
            />
          </div>

          <div className="flex-1 space-y-0 overflow-y-auto px-3 pb-4 pt-1.5">
            {/* NOWE */}
            <div className="pt-1">
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
              <div className="mt-1.5 space-y-0 pl-4">
                <MockSubgroupHeader label="Problemy" />
                <MockListRow
                  label="Braki"
                  count={5}
                  accentClass="bg-red-500"
                  active={activeId === "braki"}
                  onClick={() => setActiveId("braki")}
                />
              </div>
            ) : null}

            {/* W TOKU */}
            <div className="pt-3.5">
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
              <div className="mt-1.5 space-y-0 pl-4">
                <MockListRow
                  label="W toku"
                  count={1224}
                  accentClass="bg-amber-500"
                  active={activeId === "w-toku"}
                  onClick={() => setActiveId("w-toku")}
                />

                <MockSubgroupHeader label="Pakowanie" />
                <MockListRow
                  label="Pakowanie"
                  count={16}
                  accentClass="bg-slate-500"
                  active={activeId === "pakowanie"}
                  onClick={() => setActiveId("pakowanie")}
                />

                <MockSubgroupHeader label="Zbieranie" />
                <MockListRow
                  label="Wózki z koszykami..."
                  count={1202}
                  accentClass="bg-green-500"
                  active={false}
                  onClick={() => setActiveId("pilne")}
                />
                <MockListRow
                  label="Pilne"
                  count={6}
                  accentClass="bg-red-500"
                  active={activeId === "pilne"}
                  onClick={() => setActiveId("pilne")}
                />
              </div>
            ) : null}

            {/* OPERACYJNE — ten sam język co statusy */}
            <div className="mt-2">
              <MockSectionLabel label="Operacyjne" />
              <div className="space-y-0 pl-0.5">
                <MockListRow
                  label="Do przyjęcia"
                  count={12}
                  accentClass="bg-sky-500"
                  active={activeId === "op-przyjecie"}
                  onClick={() => setActiveId("op-przyjecie")}
                />
                <MockListRow
                  label="W trakcie weryfikacji"
                  count={3}
                  accentClass="bg-violet-500"
                  active={activeId === "op-weryfikacja"}
                  onClick={() => setActiveId("op-weryfikacja")}
                />
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1 pt-2">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">Mockup v2</p>
          <h1 className="mb-1 text-2xl font-bold text-slate-800">Lista zamówień</h1>
          <p className="mb-4 text-sm text-slate-500">
            Aktywny filtr: <span className="font-medium text-slate-800">{activeId}</span>
          </p>
          <div className="flex h-96 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400">
            Tabela zamówień…
          </div>

          <div className="mt-6 rounded-lg border border-dashed border-slate-300 bg-white/60 p-4 text-xs leading-relaxed text-slate-500">
            <p className="mb-2 font-semibold text-slate-700">Zmiany v2</p>
            <ul className="list-inside list-disc space-y-1">
              <li>Odstępy −40–50% (mt-1.5 / pt-3.5 zamiast mt-3 / pt-7)</li>
              <li>Status nieaktywny = lekki wiersz; kontener tylko przy active</li>
              <li>Grupa = folder (border + tło), font-bold, chevron przy nazwie</li>
              <li>Operacyjne = MockListRow, bez badge i kapsułek</li>
              <li>Podgrupy = nagłówek + linia (bez zmian)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PanelStatusTreeSidebarMockup;
