# Rack Template editor — Localization analysis (no code changes)

Analysis of the "Strategia nazewnictwa" section and related labels so the UI can be fully Polish. **No code was modified.**

---

## SECTION 1 — Rack template editor component

### Component responsible for creating/editing rack templates

- **Main component:** **`frontend/src/components/warehouse/TemplateCreator.tsx`**
  - This is the modal/content used to create and edit rack templates (name, dimensions, levels, naming strategy, reserve bins, preview).
- **RackTemplateEditor.tsx** — **does not exist** in the project; all template editing is in **TemplateCreator.tsx**.
- **RackSidebar.tsx** — opens the template editor by setting **`editingTemplateId`** or **`showTemplateModal`** and rendering **TemplateCreator** inside a modal (see RackSidebar around lines 524–572). It does not implement the "Strategia nazewnictwa" UI itself.

### Where "Strategia nazewnictwa" is implemented

- **File:** **`frontend/src/components/warehouse/TemplateCreator.tsx`**
- **Block:** **Lines 627–726** — a `<section>` with:
  - **Heading:** `<h4>Strategia nazewnictwa</h4>` (line 629).
  - **Sposób nazewnictwa** — `<label>` and a `<select>` for naming strategy (lines 632–641).
  - When **`namingStrategy === "pattern"`** (lines 645–684):
    - **Orientacja** — `<select>` with column-first / row-first (648–656).
    - **Row ID ({Row})** — label + input (659–660).
    - **Automatyczna numeracja sekcji** — checkbox (663–666).
    - **Start Section ({Section})** — label + number input (668–670).
    - **Kolumna ({Bin})** — label + select numeric/alpha (672–676).
    - **Wzorzec** — label + pattern input + hint line with token names (678–682).
  - For **rack-index** / **custom** (687–711): Wzorzec, Rack, Dopełnienie indeksu, Start indeksu.
  - For **manual** (711–719): short text + "Wklej listę" button.
  - **Nadpisz pojedyncze etykiety** checkbox (720–724).

All of the mixed English/Polish strings in this section are **hardcoded in JSX** in **TemplateCreator.tsx**; none are loaded from **uiStrings.ts** or backend.

---

## SECTION 2 — Label sources

### Where the English/mixed labels come from

| Visible text | Location | Source |
|--------------|----------|--------|
| **Strategia nazewnictwa** | TemplateCreator.tsx:629 | Hardcoded in JSX |
| **Sposób nazewnictwa** | TemplateCreator.tsx:632 | Hardcoded in JSX |
| **Z wzorca (Row/Section/Bin/Level)** | TemplateCreator.tsx:638 | Hardcoded `<option>` |
| **Rack + indeks** | TemplateCreator.tsx:639 | Hardcoded `<option>` |
| **Własny wzorzec** | TemplateCreator.tsx:640 | Hardcoded `<option>` |
| **Ręczne etykiety** | TemplateCreator.tsx:641 | Hardcoded `<option>` |
| **Orientacja** | TemplateCreator.tsx:648 | Hardcoded `<label>` |
| **Column-first (A-1 B-1 C-1)** | TemplateCreator.tsx:654 | Hardcoded `<option>` |
| **Row-first (A-1 A-2 A-3)** | TemplateCreator.tsx:655 | Hardcoded `<option>` |
| **Row ID ({Row})** | TemplateCreator.tsx:659 | Hardcoded `<label>` |
| **Start Section ({Section})** | TemplateCreator.tsx:669 | Hardcoded `<label>` |
| **Kolumna ({Bin})** | TemplateCreator.tsx:673 | Hardcoded `<label>` (Polish + token) |
| **Wzorzec** | TemplateCreator.tsx:679 | Hardcoded `<label>` |
| **{Row} {Section} {Bin} {Level}** (hint) | TemplateCreator.tsx:682 | Hardcoded `<p>` (tokens in braces) |
| **Numeric (1, 2, 3…)** | TemplateCreator.tsx:674 | Hardcoded `<option>` |
| **Alpha (A, B, C…)** | TemplateCreator.tsx:675 | Hardcoded `<option>` |
| **Rack (np. A1)** | TemplateCreator.tsx:704 | Hardcoded `<label>` |
| **{Rack} {Index} {Index:N}** (hint) | TemplateCreator.tsx:691 | Hardcoded `<p>` |

- **uiStrings.ts:** The only template-creator keys under **`UI_STRINGS.warehouse.templateCreator`** are **name**, **namePlaceholder**, **binsPerLevel**. None of the "Strategia nazewnictwa" labels or dropdown texts are in uiStrings.
- **Constants:** No shared constants file defines these strings; they appear only in TemplateCreator.tsx.
- **Backend/schemas:** **CustomRackTemplate** in **`frontend/src/types/warehouse.ts`** (and backend) use **field names** like **rowId**, **sectionStartIndex**, **namingStrategy**, **namingOrientation**, **binNamingType**, **addressPattern** / **namingPattern**. Those are programmatic keys; the **UI labels** are only in the frontend JSX.
- **Conclusion:** Every user-visible string in "Strategia nazewnictwa" is **hardcoded in TemplateCreator.tsx**. To localize, either replace them with keys from **uiStrings.ts** (recommended) or replace the literal strings with Polish in place. **Option values** (e.g. `"pattern"`, `"column-first"`, `"numeric"`) must stay as-is in code; only the **display text** of options/labels should be translated.

---

## SECTION 3 — Naming tokens engine

### Role of {Row}, {Section}, {Bin}, {Level}

- **Pattern expansion:** **`frontend/src/components/warehouse/warehouseUtils.ts`** — **`expandAddressPattern`** (lines 624–642).
  - Signature: `(pattern, rowId, sectionStartIndex, binNamingType, level1Based, bin1Based)`.
  - It does **literal string replacement** on the pattern:
    - **`.replace(/\{Row\}/g, rowId)`**
    - **`.replace(/\{Section\}/g, section)`**
    - **`.replace(/\{Bin\}/g, binStr)`**
    - **`.replace(/\{Level\}/g, levelStr)`**
  - So the **token names** **{Row}**, **{Section}**, **{Bin}**, **{Level}** are **fixed in code**. The user’s pattern (e.g. `{Row}{Section}-{Bin}-{Level}`) is stored and later expanded by this function. Changing token names would require changing **expandAddressPattern** and any other code that produces or interprets these patterns.

### Are they display-only or part of the engine?

- They are **part of the naming engine**: the pattern string is saved (e.g. **addressPattern** / **namingPattern**) and at runtime **expandAddressPattern** substitutes **{Row}**, **{Section}**, **{Bin}**, **{Level}** by value. So:
  - **Token names inside the pattern** (what the user types in the "Wzorzec" input and what appears in the hint) must remain **{Row}**, **{Section}**, **{Bin}**, **{Level}** so the engine keeps working without code changes.
  - **UI labels** that only *describe* these tokens (e.g. "Row ID", "Start Section", "Kolumna") can be translated to Polish; they are not parsed by the engine.

### Other patterns

- **expandRackIndexPattern** (warehouseUtils.ts, ~645+) uses **{Rack}**, **{Index}**, **{Index:N}** for rack-index/custom strategies. Same idea: those token names are part of the engine; only surrounding labels can be translated.
- **Default pattern** in code: **`{Row}{Section}-{Bin}-{Level}`** (e.g. TemplateCreator.tsx:6, warehouseUtils.ts:621). Placeholder text in the pattern input uses this same string; it should stay as-is so it remains valid for the engine.

### Summary

- **Keep as technical (do not translate):**
  - Token names **inside** the pattern and in the hint: **{Row}**, **{Section}**, **{Bin}**, **{Level}** (and for other strategies: **{Rack}**, **{Index}**, **{Index:N}**).
  - Default/placeholder pattern string, e.g. **{Row}{Section}-{Bin}-{Level}**.
  - Option **values** in DOM: **value="pattern"**, **value="column-first"**, **value="numeric"**, etc. (they are used in logic and possibly persistence).
- **Safe to translate:**
  - All **labels** (Row ID, Start Section, Kolumna, Wzorzec, Orientacja, Sposób nazewnictwa).
  - All **dropdown option display text** (e.g. "Column-first (A-1 B-1 C-1)" → Polish description; "Z wzorca (Row/Section/Bin/Level)" → e.g. "Z wzorca (Rząd/Sekcja/Pozycja/Poziom)" for the parenthetical only, or keep token names in the hint and translate the rest).
  - Any other descriptive text in the section.

---

## SECTION 4 — Dropdown option definitions

### Where options are defined

All are **inline in TemplateCreator.tsx** as `<option value="...">Display text</option>` or `<select>` + children. There are no separate option arrays or enums for these dropdowns.

| Control | Location | Options (value → current display) |
|---------|----------|-----------------------------------|
| **Sposób nazewnictwa** | Lines 633–641 | `pattern` → "Z wzorca (Row/Section/Bin/Level)" ; `rack-index` → "Rack + indeks" ; `custom` → "Własny wzorzec" ; `manual` → "Ręczne etykiety" |
| **Orientacja** | Lines 649–656 | `column-first` → "Column-first (A-1 B-1 C-1)" ; `row-first` → "Row-first (A-1 A-2 A-3)" |
| **Kolumna ({Bin})** | Lines 674–676 | `numeric` → "Numeric (1, 2, 3…)" ; `alpha` → "Alpha (A, B, C…)" |

- **Naming strategy:** Type **NamingStrategyId** = **"pattern" \| "rack-index" \| "custom" \| "manual"** (TemplateCreator.tsx, e.g. ~291). Values are used in state and when saving the template.
- **Orientation:** **"column-first" \| "row-first"** (state and **CustomRackTemplate.namingOrientation** in types/warehouse.ts and layoutGenerator).
- **Bin column type:** **"numeric" \| "alpha"** (state and **binNamingType**).

To localize: keep **value** attributes unchanged; replace only the **text content** of each `<option>` (and optionally move those strings to **uiStrings.ts** under e.g. **warehouse.templateCreator.namingStrategy**, **namingOrientation**, **binNamingType**).

---

## SECTION 5 — Recommended Polish translations

### Token names in engine vs UI

- **In pattern and hint:** Keep **{Row}**, **{Section}**, **{Bin}**, **{Level}** unchanged (engine contract).
- **In UI labels:** Use Polish terms so the user understands what each token means:

| English term (in labels/options) | Recommended Polish | Note |
|---------------------------------|---------------------|------|
| **Row** (in "Row ID", "Row/Section/Bin/Level") | **Rząd** | Row = rząd w magazynie |
| **Section** (in "Start Section", "Row/Section/...") | **Sekcja** | Section = sekcja |
| **Bin** (in "Kolumna ({Bin})", "Row/Section/Bin/Level") | **Pozycja** | Bin = pozycja/lokalizacja w regale; "Kolumna" is already Polish but denotes column; for "Bin" the user requested "Pozycja" |
| **Level** (in "Row/Section/Bin/Level") | **Poziom** | Level = poziom regału |

### Suggested label and option text (fully Polish)

- **Sposób nazewnictwa** — keep.
- **Z wzorca (Row/Section/Bin/Level)** → **Z wzorca (Rząd/Sekcja/Pozycja/Poziom)** so the parenthetical is Polish; tokens in the *pattern* and hint stay **{Row}** etc.
- **Orientacja** — keep.
- **Column-first (A-1 B-1 C-1)** → e.g. **Najpierw kolumny (A-1 B-1 C-1)** or **Kolumnowo (A-1 B-1 C-1)**.
- **Row-first (A-1 A-2 A-3)** → e.g. **Najpierw wiersze (A-1 A-2 A-3)** or **Wierszowo (A-1 A-2 A-3)**.
- **Row ID ({Row})** → **Rząd ({Row})** or **Identyfikator rzędu ({Row})**.
- **Start Section ({Section})** → **Sekcja początkowa ({Section})**.
- **Kolumna ({Bin})** → **Pozycja ({Bin})** (to align with "Bin → Pozycja"; "Kolumna" can be kept if you prefer "column" meaning).
- **Wzorzec** — keep.
- Hint line **{Row} {Section} {Bin} {Level}** — keep as-is (tokens); optionally add a short Polish line above/below, e.g. "Dostępne: Rząd, Sekcja, Pozycja, Poziom".
- **Numeric (1, 2, 3…)** → **Liczbowo (1, 2, 3…)**.
- **Alpha (A, B, C…)** → **Alfabetycznie (A, B, C…)**.
- **Rack (np. A1)** (in rack-index/custom block) → **Regał (np. A1)**.

### What must stay in English (technical)

- **Option values** in HTML/state: **pattern**, **rack-index**, **custom**, **manual**, **column-first**, **row-first**, **numeric**, **alpha**.
- **Pattern and placeholder** content: **{Row}**, **{Section}**, **{Bin}**, **{Level}**, and pattern like **{Row}{Section}-{Bin}-{Level}**.
- For rack-index/custom: tokens **{Rack}**, **{Index}**, **{Index:N}** in pattern and hint.

### Implementation approach (when you do change code)

1. **Add keys to uiStrings.ts** under e.g. **`warehouse.templateCreator`** (or a new **`namingStrategy`** subsection) for every user-visible string in "Strategia nazewnictwa" (labels, option texts, hints). Use the Polish text from the table above.
2. **In TemplateCreator.tsx**, replace hardcoded strings with **`UI_STRINGS.warehouse.templateCreator.*`** (or the chosen keys). Keep all **value=** and token names unchanged.
3. **Do not** change **expandAddressPattern** or **expandRackIndexPattern** token names; only change UI copy.

---

## Summary table

| Item | Source | Keep as-is (technical) | Translate to Polish |
|------|--------|------------------------|----------------------|
| Section heading | TemplateCreator.tsx:629 | — | "Strategia nazewnictwa" already Polish |
| Sposób nazewnictwa options | TemplateCreator.tsx:638–641 | `value` (pattern, rack-index, custom, manual) | Option text, e.g. "Z wzorca (Rząd/Sekcja/Pozycja/Poziom)" |
| Orientacja options | TemplateCreator.tsx:654–655 | `value` (column-first, row-first) | "Najpierw kolumny (...)" / "Najpierw wiersze (...)" |
| Row ID label | TemplateCreator.tsx:659 | Token **{Row}** in label | "Rząd ({Row})" or "Identyfikator rzędu ({Row})" |
| Start Section label | TemplateCreator.tsx:669 | Token **{Section}** | "Sekcja początkowa ({Section})" |
| Kolumna ({Bin}) label | TemplateCreator.tsx:673 | Token **{Bin}** | "Pozycja ({Bin})" (or keep "Kolumna") |
| Bin type options | TemplateCreator.tsx:674–675 | `value` (numeric, alpha) | "Liczbowo (1, 2, 3…)" / "Alfabetycznie (A, B, C…)" |
| Wzorzec input placeholder / hint | TemplateCreator.tsx:681–682 | Pattern **{Row}{Section}-{Bin}-{Level}** and token names in hint | Optional short Polish description of tokens |
| Rack (np. A1) | TemplateCreator.tsx:704 | — | "Regał (np. A1)" |
| Token names in pattern/hint | TemplateCreator.tsx, warehouseUtils | **{Row}**, **{Section}**, **{Bin}**, **{Level}** (and **{Rack}**, **{Index}**) | Do not translate; they are part of the naming engine |
