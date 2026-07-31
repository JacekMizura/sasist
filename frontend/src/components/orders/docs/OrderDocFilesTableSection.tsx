import { useMemo, useRef, useState } from "react";
import {
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Mail,
  Plus,
  Printer,
  Trash2,
  Upload,
} from "lucide-react";

import { orderDocKindToneClass, type OrderDocTableRow } from "./orderDocTableTypes";

const ICON_BTN =
  "inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40";
const ROW_ICON_BTN =
  "inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800";
const TH =
  "px-3 py-2 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400";
const TD = "px-3 py-2 align-middle";

function StatusBadge({ status }: { status: OrderDocTableRow["status"] }) {
  if (status === "approved") {
    return (
      <span className="inline-flex rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold leading-none text-white">
        Zatwierdzony
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-bold leading-none text-slate-600">
      Niezatwierdzony
    </span>
  );
}

function FileTypeIcon({ row }: { row: OrderDocTableRow }) {
  const n = `${row.name} ${row.mimeType ?? ""}`.toLowerCase();
  if (n.includes("pdf") || n.endsWith(".pdf")) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-red-50 text-red-600" title="PDF">
        <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
    );
  }
  if (n.includes("csv") || n.includes("excel") || n.includes("sheet") || /\.(xlsx?|csv)$/.test(n)) {
    return (
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-700" title="Arkusz">
        <FileSpreadsheet className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
      </span>
    );
  }
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-500" title="Plik">
      <FileText className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
    </span>
  );
}

function OrderDocTableRowActions({
  row,
  onPreview,
  onPrint,
  onDownload,
  onEmail,
  onDelete,
}: {
  row: OrderDocTableRow;
  onPreview: (row: OrderDocTableRow) => void;
  onPrint: (row: OrderDocTableRow) => void;
  onDownload: (row: OrderDocTableRow) => void;
  onEmail: (row: OrderDocTableRow) => void;
  onDelete: (row: OrderDocTableRow) => void;
}) {
  const isPlaceholder = row.type === "placeholder" || row.id.startsWith("no-");
  if (isPlaceholder) return <span className="text-slate-300">—</span>;

  return (
    <div className="flex w-full items-center justify-end gap-0.5">
      <button type="button" className={ROW_ICON_BTN} title="Podgląd" aria-label="Podgląd" onClick={() => onPreview(row)}>
        <Eye className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button type="button" className={ROW_ICON_BTN} title="Drukuj" aria-label="Drukuj" onClick={() => onPrint(row)}>
        <Printer className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button type="button" className={ROW_ICON_BTN} title="E-mail" aria-label="E-mail" onClick={() => onEmail(row)}>
        <Mail className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button type="button" className={ROW_ICON_BTN} title="Pobierz" aria-label="Pobierz" onClick={() => onDownload(row)}>
        <Download className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        className={`${ROW_ICON_BTN} hover:bg-red-50 hover:text-red-600`}
        title="Usuń"
        aria-label="Usuń"
        onClick={() => onDelete(row)}
      >
        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}

export type OrderDocFilesTableSectionVariant = "documents" | "attachments" | "waybills";

export function OrderDocFilesTableSection({
  title,
  rows,
  showTypeColumn,
  variant = "documents",
  onUploadFiles,
  onToolbarPrint,
  onToolbarEmail,
  onPreview,
  onPrint,
  onDownload,
  onEmail,
  onDelete,
}: {
  title: string;
  rows: OrderDocTableRow[];
  showTypeColumn: boolean;
  /** Visual variant — attachments hide RODZAJ and emphasize file icons. */
  variant?: OrderDocFilesTableSectionVariant;
  onUploadFiles?: (files: FileList | null) => void;
  onToolbarPrint?: () => void;
  onToolbarEmail?: () => void;
  onPreview: (row: OrderDocTableRow) => void;
  onPrint: (row: OrderDocTableRow) => void;
  onDownload: (row: OrderDocTableRow) => void;
  onEmail: (row: OrderDocTableRow) => void;
  onDelete: (row: OrderDocTableRow) => void;
}) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const selectableRows = useMemo(
    () => rows.filter((r) => r.type !== "placeholder" && !r.id.startsWith("no-")),
    [rows],
  );
  const allSelected = selectableRows.length > 0 && selectableRows.every((r) => selected.has(r.id));
  const someSelected = selectableRows.some((r) => selected.has(r.id));

  const titleMatch = title.match(/^(.*?)(?:\s*\((\d+)\))?$/);
  const heading = (titleMatch?.[1] ?? title).trim();
  const countFromTitle = titleMatch?.[2] != null ? Number(titleMatch[2]) : rows.length;
  const count = Number.isFinite(countFromTitle) ? countFromTitle : rows.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(selectableRows.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedRows = selectableRows.filter((r) => selected.has(r.id));

  const runOnSelected = (fn: (row: OrderDocTableRow) => void) => {
    const targets = selectedRows.length > 0 ? selectedRows : selectableRows.slice(0, 1);
    targets.forEach(fn);
  };

  const showRodzaj = showTypeColumn && variant !== "attachments";
  const isAttachments = variant === "attachments";

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold tracking-tight text-slate-900">{heading}</h3>
          <span className="inline-flex min-w-[1.5rem] items-center justify-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-600">
            {count}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-3 py-1.5">
        <label className="mr-1.5 inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-slate-300 text-slate-800 focus:ring-slate-400"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = !allSelected && someSelected;
            }}
            onChange={toggleAll}
            disabled={selectableRows.length === 0}
          />
          Wykonaj
        </label>
        <button
          type="button"
          className={ICON_BTN}
          title="Drukuj"
          aria-label="Drukuj zaznaczone"
          disabled={selectableRows.length === 0}
          onClick={() => {
            if (onToolbarPrint) onToolbarPrint();
            else runOnSelected(onPrint);
          }}
        >
          <Printer className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          className={ICON_BTN}
          title="E-mail"
          aria-label="Wyślij e-mail"
          disabled={selectableRows.length === 0}
          onClick={() => {
            if (onToolbarEmail) onToolbarEmail();
            else runOnSelected(onEmail);
          }}
        >
          <Mail className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        <button
          type="button"
          className={ICON_BTN}
          title="Pobierz"
          aria-label="Pobierz zaznaczone"
          disabled={selectableRows.length === 0}
          onClick={() => runOnSelected(onDownload)}
        >
          <Download className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
        {onUploadFiles ? (
          <button
            type="button"
            className={ICON_BTN}
            title="Wgraj plik"
            aria-label="Wgraj plik"
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
        <input
          type="file"
          ref={uploadInputRef}
          className="hidden"
          multiple={isAttachments}
          onChange={(e) => {
            onUploadFiles?.(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className={`${TH} w-10`} aria-label="Zaznacz" />
              <th className={`${TH} w-36`}>Data</th>
              {showRodzaj ? <th className={`${TH} w-44`}>Rodzaj</th> : null}
              <th className={TH}>{isAttachments ? "Nazwa pliku" : "Nazwa dokumentu"}</th>
              <th className={`${TH} text-right`}>Akcje</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={showRodzaj ? 5 : 4} className="px-3 py-6 text-center text-[13px] text-slate-400">
                  Brak pozycji.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isPlaceholder = row.type === "placeholder" || row.id.startsWith("no-");
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                    <td className={TD}>
                      {isPlaceholder ? (
                        <span className="inline-block w-3.5" />
                      ) : (
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-slate-800 focus:ring-slate-400"
                          checked={selected.has(row.id)}
                          onChange={() => toggleOne(row.id)}
                        />
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap text-[12px] tabular-nums text-slate-500`}>{row.date}</td>
                    {showRodzaj ? (
                      <td className={TD}>
                        {row.typeLabel ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-flex min-w-[1.75rem] items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold text-white ${orderDocKindToneClass(row.typeLabel.tone)}`}
                            >
                              {row.typeLabel.abbr}
                            </span>
                            <span className="text-[12px] font-medium text-slate-700">{row.typeLabel.name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className={TD}>
                      <div className="flex min-w-0 items-center gap-2">
                        {isAttachments && !isPlaceholder ? <FileTypeIcon row={row} /> : null}
                        <div className="min-w-0">
                          <p
                            className={`truncate text-[13px] font-semibold leading-snug ${
                              isPlaceholder ? "font-medium text-slate-400" : "text-slate-900"
                            }`}
                            title={row.name}
                          >
                            {row.name}
                          </p>
                          {!isPlaceholder ? (
                            <div className="mt-0.5">
                              <StatusBadge status={row.status} />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} text-right`}>
                      <OrderDocTableRowActions
                        row={row}
                        onPreview={onPreview}
                        onPrint={onPrint}
                        onDownload={onDownload}
                        onEmail={onEmail}
                        onDelete={onDelete}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {isAttachments && onUploadFiles ? (
        <div className="border-t border-slate-100 px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 shadow-sm transition-colors hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Dodaj plik
          </button>
        </div>
      ) : null}
    </section>
  );
}
