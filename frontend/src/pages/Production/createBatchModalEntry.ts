/**
 * Focused entry rules for CreateBatchModal (recommendation → create).
 * Kept pure so UX contracts stay testable without mounting the dialog.
 */

export function shouldShowProductCatalog(opts: {
  fromSingleRecommendation: boolean;
  productCatalogOpen: boolean;
  lineCount: number;
}): boolean {
  if (opts.productCatalogOpen) return true;
  if (opts.fromSingleRecommendation && opts.lineCount === 1) return false;
  return true;
}

export function isFocusedRecommendationEntry(opts: {
  fromSingleRecommendation: boolean;
  productCatalogOpen: boolean;
  lineCount: number;
}): boolean {
  return opts.fromSingleRecommendation && !opts.productCatalogOpen && opts.lineCount === 1;
}
