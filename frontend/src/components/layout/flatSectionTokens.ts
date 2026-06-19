/** Cienki separator sekcji (#e5e7eb). */
export const flatSectionDividerClass = "border-b border-gray-200";

/** Stos sekcji — kolejne dzieci dostają linię u góry i odstęp. */
export const flatSectionsStackClass =
  "[&>section:not(:first-child)]:mt-10 [&>section:not(:first-child)]:border-t [&>section:not(:first-child)]:border-gray-200 [&>section:not(:first-child)]:pt-10";

/** Zwarty stos sekcji formularza (mniejsze odstępy między blokami). */
export const flatFormSectionsStackClass =
  "[&>section:not(:first-child)]:mt-6 [&>section:not(:first-child)]:border-t [&>section:not(:first-child)]:border-gray-200 [&>section:not(:first-child)]:pt-6";

/** Pionowy separator kolumny listy (sidebar | treść). */
export const flatListSidebarDividerClass = "lg:border-r lg:border-gray-200 lg:pr-8";

/** Separator między filtrem a tabelą na liście modułu. */
export const flatListTableSectionClass = "border-t border-gray-200 pt-6";

/** Lewo wyrównany obszar contentu (max ~1400px) — ustawienia, formularze modułu. */
export const moduleSettingsPageShellClass = "w-full max-w-[87.5rem]";
