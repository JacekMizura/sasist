/**
 * Set `PDF_EMBED_ROBOTO` to false to use built-in Helvetica (no custom font / no TTF subsetting).
 * When true, register Roboto in generateWarehousePDF.tsx and keep `PDF_FONT_FAMILY` as "Roboto".
 */
export const PDF_EMBED_ROBOTO = true;

export const PDF_FONT_FAMILY: "Roboto" | "Helvetica" = PDF_EMBED_ROBOTO ? "Roboto" : "Helvetica";
