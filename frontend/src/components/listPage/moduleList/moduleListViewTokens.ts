/** Dwukolumnowy układ listy modułu (sidebar + treść). */
export const moduleListTwoColumnShellClass = "flex flex-col gap-6 lg:flex-row lg:items-start";

/** Kolumna treści listy. */
export const moduleListContentColumnClass = "flex min-w-0 flex-1 flex-col gap-5";

/** Kontener tabeli z paskiem multiakcji — bez zewnętrznej karty. */
export const moduleTableCardClass = "min-w-0";

/** Pasek multiakcji nad tabelą. */
export const moduleBulkBarClass = "flex min-h-12 flex-wrap items-center gap-2 border-b border-slate-100 py-2";

/** Kwadratowy przycisk skrótu w pasku multiakcji. */
export const moduleBulkIconBtnClass =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-none transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30";

/** Przycisk tekstowy w pasku multiakcji (Usuń / Odznacz). */
export const moduleBulkTextBtnClass =
  "inline-flex h-9 shrink-0 items-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-40";

export const moduleBulkDangerBtnClass =
  "inline-flex h-9 shrink-0 items-center rounded-lg border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-900 hover:bg-red-100 disabled:opacity-40";

/** Separator „lub” między sekcjami paska. */
export const moduleBulkOrSeparatorClass = "shrink-0 text-xs text-slate-400";

/** Stopka paginacji tabeli. */
export const moduleTablePaginationFooterClass =
  "flex flex-col gap-3 border-t border-slate-100 py-4 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between";
