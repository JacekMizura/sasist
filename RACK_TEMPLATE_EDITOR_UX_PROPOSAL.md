# Rack template editor – UX proposal for flexible location naming

**Goal:** Redesign the rack template editor so it supports multiple naming schemes (including manual naming) and clearly separates **structure** (grid: levels × columns) from **name generation** (pattern, orientation, or manual). No implementation; UX analysis and proposal only.

---

## 1. Current screen and assumptions

### Where it lives

- **Entry:** Rack sidebar (e.g. "Twórca szablonu" / template creator modal).  
- **Components:**  
  - **TemplateCreator.tsx** – form + RackPreview.  
  - **RackPreview** – SVG rack with cells; labels from `expandAddressPattern(pattern, rowId, sectionStart, binNamingType, level1Based, bin1Based)`.

### Current fields (TemplateCreator)

| Section / field | Purpose | Assumption |
|-----------------|--------|------------|
| **Nazwa** | Template name | – |
| **Szer. / Gł. / Wys. (cm)** | Rack dimensions | – |
| **Liczba poziomów** | Number of levels (rows) | Level = vertical. |
| **Lokacje na poziom** | Per-level “locations” (columns per row) | “Bin” = column; one value per level. |
| **Naming Scheme** | | |
| → Row ID (`{Row}`) | Row/aisle identifier | Single value per template. |
| → Automatyczna numeracja sekcji | Auto-increment section when placing row | – |
| → Start Section Index (`{Section}`) | Section number start | – |
| → **Bin Naming** (`{Bin}`) | Numeric vs Alpha | **Enforces:** Bin = column (1,2,3 or A,B,C). |
| → **Address Pattern** | e.g. `{Row}{Section}-{Bin}-{Level}` | **Enforces:** exactly {Row}, {Section}, {Bin}, {Level}; order fixed in code (Level = vertical, Bin = horizontal). |
| **Kolor** | Template color | – |
| **Rezerwa** | Click cells to mark reserve | onBinClick only toggles reserve; no label edit. |

### Current preview (RackPreview)

- **Loop:** `for (lev) for (bin)` → each cell gets `expandAddressPattern(pattern, rowId, sectionStart, binNamingType, lev+1, bin+1)`.
- **Display:** One label per cell (e.g. A-1, B-1, C-1). Same pattern for all cells; no per-cell override, no “structure only” view.
- **Implicit model:** Level = row index (1-based), Bin = column index (1-based). No option for “row-first” (e.g. A-1 A-2 A-3) vs “column-first” (A-1 B-1 C-1) naming.

### What enforces the current naming model

1. **Address pattern is single global string** – No choice of “naming strategy” (pattern vs rack-first vs custom vs manual).
2. **expandAddressPattern(..., level1Based, bin1Based)** – Always called with (level, segment) in that order; pattern tokens {Level} and {Bin} are fixed to “vertical row” and “horizontal column.” So **orientation is hard-coded** (column-first: A-1 B-1 C-1).
3. **Bin Naming** only controls how the **column** is rendered (numeric/alpha); there is no symmetric “level naming” or “orientation” (which axis is Bin vs Level).
4. **No manual naming** – No field to type a custom name per cell or to switch to “manual list” (P01, P02, P03).
5. **Preview shows only generated names** – No “structure view” (row/column indices) and no way to edit a cell’s label in the editor.
6. **Row ID / Section** – Tied to address pattern only; no separate “rack-first” pattern like A1-01, A1-02.

So the UI enforces: **one pattern, one orientation (column-first), pattern variables {Row},{Section},{Bin},{Level} only, no manual override.**

---

## 2. Which current fields to keep, remove, or move

### Keep (structure and basic identity)

- **Nazwa** – Template name.  
- **Szer. / Gł. / Wys. (cm)** – Dimensions (structure).  
- **Liczba poziomów** – Levels (structure).  
- **Lokacje na poziom** – Columns per level (structure).  
- **Kolor** – Template color.  
- **Rezerwa** – Reserve bins (structure/semantics); keep click-to-toggle; later can coexist with “edit label” if same cell supports both.

### Move into “Naming strategy” (new section)

- **Row ID** – Becomes one of the pattern variables; keep but place under “Naming” / “Pattern variables.”  
- **Section Start Index** – Same; optional variable for pattern.  
- **Bin Naming (numeric/alpha)** – Becomes “Column display” or “Bin variable style” inside pattern-based strategy.  
- **Address Pattern** – Becomes the main “Pattern” input when strategy = “Pattern-based.”  
- **Automatyczna numeracja sekcji** – Stays as behavior when placing rows; can live under Naming or a small “When placing” subsection.

### Remove or generalize

- **Single “Address Pattern” as the only option** – Replace with a **Naming strategy** choice (see below); pattern is one of the options.  
- **Implicit “Bin = column, Level = row”** – Replace with explicit **Orientation** (or equivalent) when strategy is pattern-based, so the same grid can produce row-first or column-first labels.

### Add (new)

- **Naming strategy** selector (see below).  
- **Orientation** (for pattern-based): e.g. “Column-first (A-1 B-1 C-1)” vs “Row-first (A-1 A-2 A-3).”  
- **Rack-first pattern** option or preset (e.g. A1-01, A1-02) as alternative to Row/Section/Bin/Level.  
- **Custom pattern** – Free format with placeholders (document which tokens are supported).  
- **Manual naming** – Mode where user can edit labels per cell (or paste a list).  
- **Preview mode** toggle: Structure view vs Name view (and optionally “both”).  
- **Per-cell label override** – Optional manual override for individual cells when strategy is pattern-based.

---

## 3. Proposed UI layout for rack template editor

### High-level layout (unchanged)

- **Left:** Form (scrollable).  
- **Right:** Preview (live).  
- **Bottom:** Save / Cancel.

### Left panel: two main blocks

**Block 1 – Structure (existing, slightly relabeled)**

- **Nazwa** – Template name.  
- **Wymiary** – Szer. (cm), Gł. (cm), Wys. (cm).  
- **Struktura regału:**  
  - Liczba poziomów (levels).  
  - Lokacje na poziom – per-level columns (as today).  
- **Kolor** – Template color.  
- **Rezerwa** – “Kliknij komórki, aby oznaczyć jako rezerwa” + same click behavior.  

This block has **no** Row ID, Section, Bin Naming, or Address Pattern. Those move to Block 2.

**Block 2 – Naming strategy (new section)**

- **Sposób nazewnictwa** (or “Strategia nazewnictwa”) – **Single selector:**  
  - **Z wzorca** – Pattern-based (current behaviour, extended).  
  - **Rack + indeks** – Rack-first (e.g. A1-01, A1-02).  
  - **Własny wzorzec** – Custom pattern (free string + placeholders).  
  - **Ręczne** – Manual; user edits or pastes names per cell.

- **When “Z wzorca” (pattern-based):**  
  - **Orientacja etykiet:** [ Column-first (A-1 B-1 C-1) | Row-first (A-1 A-2 A-3) ].  
  - **Wzorzec adresu** – Text input, e.g. `{Row}{Section}-{Bin}-{Level}`.  
  - **Zmienne:**  
    - Row ID (`{Row}`): text.  
    - Section start (`{Section}`): number.  
    - Kolumna (`{Bin}`): [ Numeric (1,2,3) | Alpha (A,B,C) ].  
    - (Optional) Level display: numeric vs alpha if ever needed.)  

- **When “Rack + indeks”:**  
  - **Wzorzec:** e.g. `{Rack}-{Index:2}` → A1-01, A1-02.  
  - **Rack** = Row ID or aisle letter (one field).  

- **When “Własny wzorzec”:**  
  - One text input with placeholders; short help: “Dostępne: {Row}, {Section}, {Bin}, {Level}, {Rack}, {Index}.”  

- **When “Ręczne”:**  
  - **Podgląd** shows editable labels per cell (or a list/grid of inputs).  
  - Optional “Import list” (paste lines) to fill names in order (e.g. by level then column).  

- **Opcja:** “Nadpisz pojedyncze etykiety” – when on, preview cells become editable even in pattern mode; overrides stored as map `(level, column) → string` and saved with template.

### Right panel: preview

- **Preview mode** (toggle or tabs):  
  - **Struktura** – Grid showing only structural indices, e.g. column letters/numbers and level numbers (A B C / 1 2 3), no generated names.  
  - **Nazwy** – Current behaviour: show generated (or manual) label per cell.  
  - Optional **Oba** – e.g. small structure hint + main label.  

- **Content:**  
  - Same SVG rack and cell layout as today.  
  - In “Nazwy” mode: show `loc_name` (from pattern or manual override).  
  - In “Struktura”: show e.g. “L{level} C{col}” or “1, 2, 3” and “A, B, C” on axes.  
  - If “Nadpisz pojedyncze etykiety” is on, cells in “Nazwy” view are clickable to edit (inline or small modal).

---

## 4. How naming strategy should be configured

### Strategy selector

- **One control** at the top of the Naming block: radio group or dropdown.  
- **Four options** (or three if “Rack + indeks” is merged into “Własny wzorzec” as a preset):  
  1. **Z wzorca** – Pattern with {Row},{Section},{Bin},{Level}; orientation choice.  
  2. **Rack + indeks** – Single pattern like {Rack}-{Index:2}.  
  3. **Własny wzorzec** – Free pattern string.  
  4. **Ręczne** – No pattern; user fills names.

### Pattern variables (for pattern-based / custom)

- **Editable in UI:** Row ID, Section start, Bin style (numeric/alpha).  
- **Documented:** Level is always numeric 1-based unless a future “Level style” is added.  
- **Preview:** Any change to pattern or variables immediately updates the right-hand preview (name view).  
- **Validation:** If pattern contains unknown tokens, show a short warning and list allowed tokens.

### Orientation (pattern-based only)

- **Single choice:** “Column-first” vs “Row-first.”  
  - **Column-first:** First index in loop = level, second = segment → labels like A-1 B-1 C-1 (current).  
  - **Row-first:** Swap meaning so “first index” is column, “second” is level → A-1 A-2 A-3.  
- Stored on template (e.g. `namingOrientation: "column-first" | "row-first"`) and used in `expandAddressPattern` (or equivalent) so the same pattern produces the correct mapping.

### Rack-first and custom

- **Rack-first:** Template stores a simple pattern (e.g. `{Rack}-{Index:2}`) and “Rack” value (Row ID). Index = global bin index (1..N) or (level, column) in a defined order. No {Bin}/{Level} needed.  
- **Custom:** User types a pattern; backend/frontend support a fixed set of tokens; no orientation (or one default order).

---

## 5. How preview should display structure vs names

### Structure view

- **Purpose:** Show only grid structure (levels × columns), no naming logic.  
- **Content:**  
  - Levels: 1, 2, 3, … (or L1, L2, …).  
  - Columns: 1, 2, 3 or A, B, C (driven by “Bin” style or neutral).  
  - Cells can show “L2 / C3” or “2,3” or leave empty with axes.  
- **No** call to `expandAddressPattern`; only indices. Helps users see “which is level, which is column” before attaching names.

### Name view

- **Purpose:** Show final labels (for labels, reports, and export).  
- **Content:**  
  - For each cell: generated name from selected strategy (pattern, rack-first, custom) or manual override.  
  - Same layout as today (one label per cell; volume/dimensions optional below).  
- **Editable:** If “Override single labels” is on, click cell → small input/modal to set that cell’s label; store overrides in template and apply on top of generated name.

### Toggle or tabs

- **Control:** “Podgląd: [ Struktura | Nazwy ]” (or “Struktura / Nazwy” tabs).  
- Default can stay “Nazwy” so current behaviour is preserved.

---

## 6. How manual naming should work

### When strategy = “Ręczne”

- **No pattern**, no Row ID / Section / Bin Naming.  
- **Preview (Name view):** Each cell shows an **editable** label (text input or click-to-edit).  
- **Initial state:** All cells empty or “—” so user fills them.  
- **Paste/list import (optional):**  
  - “Wklej listę” – user pastes lines (e.g. P01, P02, P03, …).  
  - Order: fill by level then column (or configurable order).  
  - Remaining cells stay empty if list is shorter.  
- **Persistence:** Template stores `manualLabels: Record<string, string>` keyed by e.g. `"levelIndex-columnIndex"` (or same key as reserve_bin_keys).  
- **Validation:** Optional uniqueness check per warehouse when template is used (handled at save/placement time).

### Override in pattern mode

- **Optional** “Nadpisz pojedyncze etykiety” (Override single labels).  
- When on: for each cell, if `manualOverrides[key]` exists, show it; else show pattern-generated name.  
- Same storage as manual strategy (`manualOverrides` or reuse `manualLabels`).  
- In preview, override cells could have a small visual cue (e.g. italic or icon) so user sees which are overridden.

### Data model (conceptual)

- **Template:**  
  - `namingStrategy: "pattern" | "rack-first" | "custom" | "manual"`  
  - `namingOrientation?: "column-first" | "row-first"` (for pattern)  
  - `addressPattern?: string`  
  - `rowId`, `sectionStartIndex`, `binNamingType` (for pattern)  
  - `manualLabels?: Record<string, string>` (cell key → label; used for manual strategy or overrides)

---

## 7. Summary

| Topic | Proposal |
|-------|----------|
| **New UI layout** | Two blocks: (1) Structure (name, dimensions, levels, columns per level, color, reserve); (2) Naming strategy (strategy selector + strategy-specific options). Preview on the right with mode: Structure | Names. |
| **Keep** | Name, dimensions, levels, “lokacje na poziom,” color, reserve. |
| **Move** | Row ID, Section, Bin Naming, Address Pattern → into “Naming strategy” section. |
| **Remove / generalize** | Single mandatory Address Pattern; replaced by strategy choice. Implicit orientation replaced by explicit “Column-first / Row-first” when pattern-based. |
| **Naming strategy** | Four options: Pattern-based (with orientation), Rack-first, Custom pattern, Manual. Pattern variables (Row, Section, Bin style) and pattern string configured under Pattern-based (and Custom). |
| **Preview** | Two modes: **Structure view** (indices only, no names), **Name view** (generated or manual labels). Optional per-cell override in pattern mode; in manual mode all cells editable. |
| **Manual naming** | Strategy “Ręczne”: no pattern; all labels edited in preview (or pasted list). Stored as `manualLabels` by cell key. Optional “Override single labels” in pattern mode reuses same mechanism. |

This gives a single, consistent UX that supports: different orientation models (column-first, row-first), rack-first naming, custom patterns, and full manual naming, while keeping structure (levels × columns) separate from name generation.

---

*End of UX proposal. No code changes were made.*
