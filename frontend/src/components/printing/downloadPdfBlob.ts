/** Trigger a browser download for a PDF blob. */
export function downloadPdfBlob(blob: Blob, filename: string): void {
  const pdf = blob.type?.includes("pdf") ? blob : new Blob([blob], { type: "application/pdf" });
  const url = URL.createObjectURL(pdf);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
