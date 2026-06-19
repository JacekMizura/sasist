/**
 * Mockup v3 — szerokość i gęstość sidebara statusów.
 * NIE podpięty do produkcyjnego OrdersPanelStatusSidebar.
 *
 * Podgląd: /dev/panel-status-sidebar-mockup
 * Screenshot (publiczny): /dev/panel-status-sidebar-mockup-screenshot
 *
 * Założenia v3:
 * - Sidebar +56 px względem prod. lg:w-64 (256 → 312 px)
 * - Liczniki: flex ml-auto, bez stałej szerokości kolumny
 * - Nazwy: pełne, bez truncate
 * - Operacyjne: osobna lista widoków — bez pasków, ikon, kart, badge
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, Package, Search, ShoppingCart } from "lucide-react";

/** Prod. baseline: lg:w-64 = 16rem = 256px. Mockup: +56px. */
export const MOCK_SIDEBAR_WIDTH_PX = 312;

type MockActiveId =
  | "wszystkie"
  | "nowe"
  | "braki"
  | "w-toku"
  | "pakowanie"
  | "wozki"
  | "pilne"
  | "zakonczone"
  | "op-uszkodzone"
  | "op-przyjete"
  | "op-decyzja"
  | "op-weryfikacja";

function MockCount({ value, active }: { value: number | string; active?: boolean }) {
  return (
    <span
      className={`ml-auto shrink-0 pl-2 text-right tabular-nums text-xs font-medium ${
        active ? "text-slate-700" : "text-slate-500"
      }`}
    >
      {value}
    </span>
  );
}

/** Wiersz meta (Wszystkie) — bez paska. */
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
      className={`flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "border-slate-200 bg-slate-100 font-medium text-slate-900"
          : "border-transparent font-normal text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      <MockCount value={count} active={active} />
    </button>
  );
}

/** Wiersz statusu panelu — ikona WMS + pasek + pełna nazwa. */
function MockStatusRow({
  label,
  count,
  barColor,
  active,
  onClick,
  wmsIcon,
}: {
  label: string;
  count: number | string;
  barColor: string;
  active: boolean;
  onClick: () => void;
  wmsIcon?: "cart" | "clock" | "package";
}) {
  const Icon =
    wmsIcon === "cart" ? ShoppingCart : wmsIcon === "clock" ? Clock : wmsIcon === "package" ? Package : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-1.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
        active
          ? "border-slate-200 bg-slate-100 font-medium text-slate-900"
          : "border-transparent font-normal text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="flex w-5 shrink-0 items-center justify-center pt-0.5" aria-hidden>
        {Icon ? <Icon className="h-3.5 w-3.5 text-slate-400" strokeWidth={2} /> : null}
      </span>
      <span
        className="mt-0.5 h-4 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: barColor }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      <MockCount value={count} active={active} />
    </button>
  );
}

/**
 * Wiersz operacyjny (zwroty) — osobna lista widoków.
 * Bez pasków, ikon WMS, kart, badge.
 */
function MockOperationalRow({
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
      className={`flex w-full items-start rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
        active ? "bg-slate-100 font-medium text-slate-900" : "font-normal text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="min-w-0 flex-1 leading-snug">{label}</span>
      <MockCount value={count} active={active} />
    </button>
  );
}

function MockGroupRow({
  label,
  count,
  barColor,
  expanded,
  active,
  onFilter,
  onToggle,
}: {
  label: string;
  count: number;
  barColor: string;
  expanded: boolean;
  active: boolean;
  onFilter: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex items-start gap-1 rounded-lg border px-2 py-2 transition-colors ${
        active ? "border-slate-200 bg-slate-100" : "border-slate-200/80 bg-slate-50/70"
      }`}
    >
      <button type="button" onClick={onFilter} className="flex min-w-0 flex-1 items-start gap-2 py-0.5 pl-1 text-left">
        <span className="mt-1 h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: barColor }} aria-hidden />
        <span className="text-sm font-semibold leading-snug text-slate-800">{label}</span>
      </button>
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 rounded p-0.5 pt-1 text-slate-400 hover:text-slate-600"
        aria-expanded={expanded}
        aria-label={expanded ? "Zwiń grupę" : "Rozwiń grupę"}
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      <MockCount value={count} active={active} />
    </div>
  );
}

function MockSubgroupHeader({ label }: { label: string }) {
  return (
    <div className="mb-0.5 mt-2 flex items-center gap-2 pl-4">
      <span className="shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <div className="h-px min-w-[2rem] flex-1 bg-slate-100" />
    </div>
  );
}

function MockOperationalHeader() {
  return (
    <div className="mb-1 mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-slate-400">Operacyjne</span>
      <div className="h-px min-w-[2rem] flex-1 bg-slate-100" />
    </div>
  );
}

type SidebarContentProps = {
  activeId: MockActiveId;
  setActiveId: (id: MockActiveId) => void;
  allExpanded?: boolean;
  screenshotRootId?: string;
};

function MockSidebarContent({ activeId, setActiveId, allExpanded = false, screenshotRootId }: SidebarContentProps) {
  const [openNowe, setOpenNowe] = useState(true);
  const [openWtoku, setOpenWtoku] = useState(true);
  const [openZakonczone, setOpenZakonczone] = useState(true);

  const showNowe = allExpanded || openNowe;
  const showWtoku = allExpanded || openWtoku;
  const showZakonczone = allExpanded || openZakonczone;

  return (
    <aside
      id={screenshotRootId}
      className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      style={{ width: MOCK_SIDEBAR_WIDTH_PX }}
    >
      <div className="border-b border-slate-100 p-3 pb-2">
        <h2 className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Status panelu</h2>
        <div className="relative mb-2 px-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Szukaj statusu…"
            readOnly={allExpanded}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2 text-xs placeholder:text-slate-400"
          />
        </div>
        <MockMetaRow
          label="Wszystkie"
          count={1233}
          active={activeId === "wszystkie"}
          onClick={() => setActiveId("wszystkie")}
        />
      </div>

      <div className={`space-y-0 px-2 pb-4 pt-2 ${allExpanded ? "" : "flex-1 overflow-y-auto"}`}>
        <div className="pt-1">
          <MockGroupRow
            label="Nowe"
            count={5}
            barColor="#3b82f6"
            expanded={showNowe}
            active={activeId === "nowe"}
            onFilter={() => setActiveId("nowe")}
            onToggle={() => setOpenNowe((v) => !v)}
          />
        </div>
        {showNowe ? (
          <div className="mt-1.5 space-y-1 pl-4">
            <MockSubgroupHeader label="Problemy magazynowe" />
            <MockStatusRow
              label="Braki — oczekuje na uzupełnienie"
              count={5}
              barColor="#ef4444"
              active={activeId === "braki"}
              onClick={() => setActiveId("braki")}
            />
          </div>
        ) : null}

        <div className="pt-3">
          <MockGroupRow
            label="W toku"
            count={1224}
            barColor="#f59e0b"
            expanded={showWtoku}
            active={activeId === "w-toku"}
            onFilter={() => setActiveId("w-toku")}
            onToggle={() => setOpenWtoku((v) => !v)}
          />
        </div>
        {showWtoku ? (
          <div className="mt-1.5 space-y-1 pl-4">
            <MockSubgroupHeader label="Pakowanie i wysyłka" />
            <MockStatusRow
              label="Pakowanie"
              count={16}
              barColor="#64748b"
              wmsIcon="package"
              active={activeId === "pakowanie"}
              onClick={() => setActiveId("pakowanie")}
            />
            <MockStatusRow
              label="Spakowane — oczekuje na kuriera"
              count={3}
              barColor="#64748b"
              active={false}
              onClick={() => setActiveId("pakowanie")}
            />

            <MockSubgroupHeader label="Zbieranie" />
            <MockStatusRow
              label="Wózki z koszykami"
              count={1202}
              barColor="#22c55e"
              wmsIcon="cart"
              active={activeId === "wozki"}
              onClick={() => setActiveId("wozki")}
            />
            <MockStatusRow
              label="Pilne — priorytet operacyjny"
              count={6}
              barColor="#ef4444"
              wmsIcon="clock"
              active={activeId === "pilne"}
              onClick={() => setActiveId("pilne")}
            />
          </div>
        ) : null}

        <div className="pt-3">
          <MockGroupRow
            label="Zakończone"
            count={4}
            barColor="#10b981"
            expanded={showZakonczone}
            active={activeId === "zakonczone"}
            onFilter={() => setActiveId("zakonczone")}
            onToggle={() => setOpenZakonczone((v) => !v)}
          />
        </div>
        {showZakonczone ? (
          <div className="mt-1.5 space-y-1 pl-4">
            <MockStatusRow
              label="Przyjęte do dekretacji księgowej"
              count={2}
              barColor="#10b981"
              active={false}
              onClick={() => setActiveId("zakonczone")}
            />
          </div>
        ) : null}

        <MockOperationalHeader />
        <div className="space-y-0.5">
          <MockOperationalRow
            label="Do decyzji"
            count={0}
            active={activeId === "op-decyzja"}
            onClick={() => setActiveId("op-decyzja")}
          />
          <MockOperationalRow
            label="Uszkodzone"
            count={2}
            active={activeId === "op-uszkodzone"}
            onClick={() => setActiveId("op-uszkodzone")}
          />
          <MockOperationalRow
            label="Przyjęte"
            count={14}
            active={activeId === "op-przyjete"}
            onClick={() => setActiveId("op-przyjete")}
          />
          <MockOperationalRow
            label="W trakcie weryfikacji towaru"
            count={3}
            active={activeId === "op-weryfikacja"}
            onClick={() => setActiveId("op-weryfikacja")}
          />
          <MockOperationalRow label="Refundacje oczekujące" count={0} active={false} onClick={() => setActiveId("wszystkie")} />
          <MockOperationalRow label="Reklamacje powiązane" count={0} active={false} onClick={() => setActiveId("wszystkie")} />
          <MockOperationalRow label="Odrzucone" count={1} active={false} onClick={() => setActiveId("wszystkie")} />
          <MockOperationalRow label="Rozliczone" count={6} active={false} onClick={() => setActiveId("wszystkie")} />
        </div>
      </div>
    </aside>
  );
}

/** Pełna wysokość, wszystkie grupy rozwinięte — tylko pod screenshot. */
export function PanelStatusSidebarMockupV3Screenshot() {
  const [activeId, setActiveId] = useState<MockActiveId>("wozki");

  return (
    <div className="min-h-[100dvh] bg-slate-100 p-8 font-sans text-slate-900">
      <MockSidebarContent
        activeId={activeId}
        setActiveId={setActiveId}
        allExpanded
        screenshotRootId="mockup-sidebar-screenshot"
      />
    </div>
  );
}

export function PanelStatusSidebarMockupV3() {
  const [activeId, setActiveId] = useState<MockActiveId>("wozki");

  return (
    <div className="min-h-screen bg-slate-100 p-6 font-sans text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 lg:flex-row lg:items-start">
        <MockSidebarContent activeId={activeId} setActiveId={setActiveId} />

        <div className="min-w-0 flex-1 pt-1">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-400">Mockup v3 — tylko podgląd</p>
          <h1 className="mb-1 text-2xl font-bold text-slate-800">Zwroty / zamówienia</h1>
          <p className="mb-1 text-sm text-slate-500">
            Aktywny filtr: <span className="font-medium text-slate-800">{activeId}</span>
          </p>
          <p className="mb-4 text-xs text-slate-400">
            Szerokość sidebara: {MOCK_SIDEBAR_WIDTH_PX}px (prod. 256px + 56px)
          </p>

          <div className="mb-6 flex h-80 items-center justify-center rounded-xl border border-slate-200 bg-white text-sm text-slate-400">
            Tabela listy…
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-4 text-xs leading-relaxed text-slate-600">
              <p className="mb-2 font-semibold text-slate-800">Statusy panelu</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Sidebar {MOCK_SIDEBAR_WIDTH_PX}px (+56 px)</li>
                <li>Pełne nazwy — bez truncate</li>
                <li>Licznik: ml-auto + tabular-nums (bez w-12)</li>
                <li>Ikona WMS + pasek tylko tutaj</li>
              </ul>
            </div>
            <div className="rounded-lg border border-dashed border-slate-300 bg-white/80 p-4 text-xs leading-relaxed text-slate-600">
              <p className="mb-2 font-semibold text-slate-800">Operacyjne</p>
              <ul className="list-inside list-disc space-y-1">
                <li>Osobna lista widoków</li>
                <li>Bez pasków, ikon, kart, badge</li>
                <li>Ten sam układ licznika (flex prawo)</li>
                <li>Hover / active tylko tło wiersza</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-xs text-amber-950">
            Nie wdrożone do <code className="rounded bg-amber-100/80 px-1">OrdersPanelStatusSidebar</code> ani{" "}
            <code className="rounded bg-amber-100/80 px-1">ReturnsListPanel</code>.
          </div>
        </div>
      </div>
    </div>
  );
}

export default PanelStatusSidebarMockupV3;
