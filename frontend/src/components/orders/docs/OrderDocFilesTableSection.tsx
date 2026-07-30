import { useRef } from "react";
import { Download, Eye, Mail, Printer, Trash2, Upload } from "lucide-react";

import { orderDocKindToneClass, type OrderDocTableRow } from "./orderDocTableTypes";

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
  return (
    <div className="flex w-full items-center justify-end gap-2">
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100" onClick={() => onPreview(row)}>
        <Eye className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100" onClick={() => onPrint(row)}>
        <Printer className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100" onClick={() => onDownload(row)}>
        <Download className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100" onClick={() => onEmail(row)}>
        <Mail className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" className="rounded p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50" onClick={() => onDelete(row)}>
        <Trash2 className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  );
}

export function OrderDocFilesTableSection({
  title,
  rows,
  showTypeColumn,
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

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">{title}</h3>
        <input type="file" ref={uploadInputRef} className="hidden" onChange={(e) => { onUploadFiles?.(e.target.files); e.target.value = ""; }} />
      </div>
      <div className="bg-white border-b border-slate-200 px-5 py-3 flex items-center space-x-4 text-sm">
         <label className="flex items-center font-medium cursor-pointer text-slate-600"><input type="checkbox" className="mr-2 rounded border-slate-300 w-4 h-4"/> wykonaj</label>
         <button className="text-slate-500 hover:text-slate-900" onClick={() => onToolbarPrint?.()}><Printer size={16}/></button>
         <button className="text-slate-500 hover:text-slate-900" onClick={() => onToolbarEmail?.()}><Mail size={16}/></button>
         <button className="text-slate-500 hover:text-slate-900" onClick={() => uploadInputRef.current?.click()}><Upload size={16}/></button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="text-[10px] text-slate-400 uppercase font-bold border-b border-slate-100 bg-slate-50/50">
            <tr>
              <th className="px-5 py-3 w-10"></th>
              <th className="px-5 py-3 w-40">DATA</th>
              <th className="px-5 py-3 w-48">RODZAJ</th>
              <th className="px-5 py-3 w-full">NAZWA DOKUMENTU</th>
              <th className="px-5 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-5 py-4"><input type="checkbox" className="rounded border-slate-300 w-4 h-4"/></td>
                <td className="px-5 py-4 text-slate-500">{row.date}</td>
                <td className="px-5 py-4">
                  {showTypeColumn && row.typeLabel ? (
                    <div className="flex items-center">
                      <span className={`text-[10px] font-bold text-white px-1.5 py-0.5 rounded mr-2 ${orderDocKindToneClass(row.typeLabel.tone)}`}>{row.typeLabel.abbr}</span> 
                      {row.typeLabel.name}
                    </div>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-5 py-4 max-w-[200px]">
                  <span className="font-medium text-slate-800 truncate block">{row.name}</span>
                </td>
                <td className="px-5 py-4 text-right text-slate-400">
                  <OrderDocTableRowActions row={row} onPreview={onPreview} onPrint={onPrint} onDownload={onDownload} onEmail={onEmail} onDelete={onDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
