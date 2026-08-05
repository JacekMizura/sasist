import { useMemo, useState, type ReactNode } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Image as ImageIcon,
  Indent,
  Info,
  Link as LinkIcon,
  List,
  ListOrdered,
  Outdent,
  Plus,
  Redo2,
  Undo2,
  Video,
} from "lucide-react";

import { GhostButton, Input, PrimaryButton, Select, Textarea } from "../../design-system";

export type ProductEditDescriptionTabProps = {
  tagsText: string;
  setTagsText: (v: string) => void;
  shortDescription: string;
  setShortDescription: (v: string) => void;
  serialNotes: string;
  setSerialNotes: (v: string) => void;
  longDescription: string;
  setLongDescription: (v: string) => void;
  attributeGroup: string;
  setAttributeGroup: (v: string) => void;
  saving: boolean;
};

const formLabel =
  "form-label block text-sm font-medium text-gray-900 mb-1 md:mb-0 md:pt-2 md:text-right md:pr-4";
const formRow = "mb-6 grid grid-cols-1 gap-2 md:grid-cols-[200px_1fr] md:items-start md:gap-6";
const fieldChrome =
  "[&_input]:!rounded-md [&_input]:!border [&_input]:!border-gray-300 [&_input]:!bg-white [&_input]:!shadow-none [&_input]:focus:!border-orange-500 [&_input]:focus:!ring-2 [&_input]:focus:!ring-orange-500/10 [&_textarea]:!rounded-md [&_textarea]:!border [&_textarea]:!border-gray-300 [&_textarea]:!bg-white [&_textarea]:!shadow-none [&_textarea]:focus:!border-orange-500 [&_textarea]:focus:!ring-2 [&_textarea]:focus:!ring-orange-500/10 [&_select]:!rounded-md [&_select]:!border [&_select]:!border-gray-300 [&_select]:!bg-white [&_select]:!shadow-none [&_select]:focus:!border-orange-500 [&_select]:focus:!ring-2 [&_select]:focus:!ring-orange-500/10";

function ToolbarDivider() {
  return <div className="mx-1 h-5 w-px bg-gray-300" aria-hidden />;
}

function ToolBtn({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      className={`rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900 ${className}`}
      onMouseDown={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}

/**
 * Product edit — Opis tab.
 * DOM hierarchy is a structural 1:1 port of `edycja_produktu_nowy_widok.html`
 * (full-width body under tabs).
 */
export function ProductEditDescriptionTab({
  tagsText,
  setTagsText,
  shortDescription,
  setShortDescription,
  serialNotes,
  setSerialNotes,
  longDescription,
  setLongDescription,
  attributeGroup,
  setAttributeGroup,
  saving,
}: ProductEditDescriptionTabProps) {
  const [attrsCollapsed, setAttrsCollapsed] = useState(false);
  const wordCount = useMemo(() => {
    const t = longDescription.trim();
    if (!t) return 0;
    return t.split(/\s+/).filter(Boolean).length;
  }, [longDescription]);

  return (
    <div className={`w-full max-w-none space-y-12 ${fieldChrome}`}>
      {/* SEKCJA: Podstawowe pola opisowe */}
      <section>
        <div className={formRow}>
          <label className={formLabel}>Tagi</label>
          <div>
            <Input
              density="comfortable"
              focusTone="neutral"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="np. sznurowadła, cat, obuwie"
            />
          </div>
        </div>

        <div className={formRow}>
          <label className={formLabel}>Krótki opis</label>
          <div>
            <Textarea
              density="comfortable"
              focusTone="neutral"
              className="min-h-[100px] resize-y"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
            />
          </div>
        </div>

        <div className={formRow}>
          <label className={formLabel}>Nr.seryjny</label>
          <div>
            <Textarea
              density="comfortable"
              focusTone="neutral"
              className="min-h-[80px] resize-y"
              value={serialNotes}
              onChange={(e) => setSerialNotes(e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* SEKCJA: Długi opis (edytor) */}
      <section>
        <h2 className="mb-6 text-lg font-bold text-gray-900">Długi opis</h2>

        <div className="overflow-hidden rounded border border-gray-300 bg-white">
          <div className="flex flex-wrap gap-x-4 gap-y-2 border-b border-gray-200 px-3 py-1.5 text-[13px] text-gray-700">
            {["Plik", "Edycja", "Wstaw", "Widok", "Format", "Tabela", "Narzędzia"].map((label) => (
              <span key={label} className="flex cursor-default items-center hover:text-orange-600">
                {label} <ChevronDown className="ml-1 h-2.5 w-2.5" strokeWidth={2.5} />
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 px-3 py-2">
            <ToolBtn title="Cofnij">
              <Undo2 className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn title="Ponów">
              <Redo2 className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolbarDivider />
            <ToolBtn className="px-2 text-sm font-medium text-gray-700">
              <Plus className="mr-1 inline h-3.5 w-3.5" />
              <ChevronDown className="inline h-2.5 w-2.5" strokeWidth={2.5} />
            </ToolBtn>
            <ToolbarDivider />
            <ToolBtn title="Pogrubienie" className="min-w-[28px] text-center font-bold text-gray-700">
              B
            </ToolBtn>
            <ToolBtn title="Kursywa" className="min-w-[28px] text-center font-serif italic text-gray-700">
              I
            </ToolBtn>
            <ToolbarDivider />
            <ToolBtn title="Wyrównaj do lewej">
              <AlignLeft className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn title="Wyśrodkuj">
              <AlignCenter className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn title="Wyrównaj do prawej">
              <AlignRight className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn title="Wyjustuj">
              <AlignJustify className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolbarDivider />
            <ToolBtn title="Lista punktowa" className="flex items-center">
              <List className="h-3.5 w-3.5" />
              <ChevronDown className="ml-1 h-2.5 w-2.5" strokeWidth={2.5} />
            </ToolBtn>
            <ToolBtn title="Lista numerowana" className="flex items-center">
              <ListOrdered className="h-3.5 w-3.5" />
              <ChevronDown className="ml-1 h-2.5 w-2.5" strokeWidth={2.5} />
            </ToolBtn>
            <ToolBtn title="Zmniejsz wcięcie">
              <Outdent className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn title="Zwiększ wcięcie">
              <Indent className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolbarDivider />
            <ToolBtn title="Wstaw link">
              <LinkIcon className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn title="Wstaw obraz">
              <ImageIcon className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn title="Wstaw wideo">
              <Video className="h-3.5 w-3.5" />
            </ToolBtn>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-1.5">
            <button
              type="button"
              className="flex items-center rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
            >
              Wysokość linii <ChevronDown className="ml-1.5 h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="flex items-center rounded px-2 py-1 font-bold text-gray-700 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
            >
              A <ChevronDown className="ml-1 h-2.5 w-2.5 text-gray-400" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="flex items-center rounded bg-gray-100 px-2 py-1 font-bold text-gray-700 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
            >
              A <ChevronDown className="ml-1 h-2.5 w-2.5 text-gray-400" strokeWidth={2.5} />
            </button>
            <button
              type="button"
              className="flex items-center rounded px-2 py-1 text-sm text-gray-700 hover:bg-gray-100"
              onMouseDown={(e) => e.preventDefault()}
            >
              <span className="mr-1 line-through">ABC</span>
              <ChevronDown className="ml-1.5 h-2.5 w-2.5" strokeWidth={2.5} />
            </button>
          </div>

          <Textarea
            density="comfortable"
            focusTone="neutral"
            className="!min-h-[400px] !rounded-none !border-0 !px-6 !py-6 !text-sm !shadow-none !ring-0 focus:!border-0 focus:!ring-0"
            value={longDescription}
            onChange={(e) => setLongDescription(e.target.value)}
            placeholder="Tu znajduje się zawartość długiego opisu"
            aria-label="Długi opis"
          />

          <div className="flex justify-end border-t border-gray-200 px-3 py-1.5">
            <span className="text-xs font-medium text-gray-500">Słów: {wordCount}</span>
          </div>
        </div>
      </section>

      {/* SEKCJA: Uniwersalny opis */}
      <section className="border-t border-gray-200 pt-8">
        <h2 className="mb-6 text-lg font-bold text-gray-900">Uniwersalny opis</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">Nie utworzono opisu.</span>
          <button
            type="button"
            className="rounded bg-[#8ec600] px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#7cb000]"
          >
            Otwórz edytor
          </button>
        </div>
      </section>

      {/* SEKCJA: Parametry */}
      <section className="border-t border-gray-200 pt-8">
        <h2 className="mb-4 text-lg font-bold text-gray-900">Parametry</h2>
        <div className="mb-6 rounded bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Parametry są kluczowymi danymi produktowymi, które służą do precyzyjnego opisu cech i
          specyfikacji produktów. Są one wykorzystywane w integracjach z zewnętrznymi kanałami
          sprzedaży, umożliwiając efektywne prezentowanie produktów i usprawniając procesy
          sprzedażowe.
        </div>
        <div className="space-y-6">
          <GhostButton
            type="button"
            density="compact"
            className="inline-flex items-center gap-2 !border !border-gray-300 !bg-white !text-gray-700"
          >
            <Plus className="h-3.5 w-3.5 text-gray-400" /> Dodaj parametr
          </GhostButton>

          <div>
            <h3 className="mb-2 text-sm font-bold text-gray-900">Wybierz grupy parametrów</h3>
            <div className="flex flex-col items-start gap-4 sm:flex-row">
              <div className="w-full max-w-xs">
                <Select density="comfortable" focusTone="neutral" defaultValue="">
                  <option value="">Wybrano 0 z 0</option>
                </Select>
              </div>
              <GhostButton
                type="button"
                density="compact"
                className="inline-flex items-center gap-2 whitespace-nowrap !border !border-gray-300 !bg-white !text-gray-700"
              >
                <Plus className="h-3.5 w-3.5 text-gray-400" /> Dodaj parametry z wybranych grup
              </GhostButton>
            </div>
          </div>
        </div>
      </section>

      {/* SEKCJA: Atrybuty */}
      <section className="border-t border-gray-200 pt-8">
        <div className="mb-6 flex items-center gap-2">
          <h2 className="text-lg font-bold text-gray-900">Atrybuty</h2>
          <Info className="h-3.5 w-3.5 cursor-help text-blue-500" aria-hidden />
          <button
            type="button"
            className="ml-2 flex items-center gap-1 rounded border border-gray-300 bg-white px-2 py-0.5 text-xs text-gray-600 transition-colors hover:bg-gray-50"
            onClick={() => setAttrsCollapsed((v) => !v)}
          >
            <ChevronDown
              className={`h-2.5 w-2.5 transition-transform ${attrsCollapsed ? "" : "rotate-180"}`}
              strokeWidth={2.5}
            />
            {attrsCollapsed ? "Rozwiń" : "Zwiń"}
          </button>
        </div>

        {!attrsCollapsed && (
          <div className={`${formRow} items-center`}>
            <label className={`${formLabel} !mb-0 !pt-0`}>Grupa atrybutów</label>
            <div className="max-w-xs">
              <Select
                density="comfortable"
                focusTone="neutral"
                value={attributeGroup}
                onChange={(e) => setAttributeGroup(e.target.value)}
              >
                <option value="">--- wybierz ---</option>
              </Select>
            </div>
          </div>
        )}

        <div className="mt-8 flex justify-end">
          <PrimaryButton type="submit" density="compact" disabled={saving}>
            Zapisz
          </PrimaryButton>
        </div>
      </section>

      {/* SEKCJA: Log czynności */}
      <section className="border-t border-gray-200 pb-8 pt-6">
        <h2 className="text-[15px] font-bold text-gray-900">Log czynności</h2>
      </section>
    </div>
  );
}
