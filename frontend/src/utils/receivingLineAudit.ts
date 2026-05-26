import type { ReceivingScanLogRead, StockDocumentItemRead } from "../api/stockDocumentsApi";



export type ReceivingLineAuditSummary = {

  lastAdminId: number | null;

  lastOperatorName: string | null;

  lastAt: string | null;

  extraOperatorCount: number;

};



function operatorDisplayName(log: ReceivingScanLogRead, adminNameById: Map<number, string>): string {

  const fromApi = (log.admin_display_name || "").trim();

  if (fromApi) return fromApi;

  const mapped = adminNameById.get(log.admin_id);

  if (mapped?.trim()) return mapped.trim();

  return `Operator #${log.admin_id}`;

}



function operatorInitials(name: string): string {

  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();

  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();

  return "?";

}



export function operatorAvatarInitials(summary: ReceivingLineAuditSummary | null): string {

  if (!summary?.lastOperatorName) return "?";

  return operatorInitials(summary.lastOperatorName);

}



/** Aggregate scan logs from all sibling lines — newest operator wins. */

export function aggregateReceivingLineAudit(

  items: StockDocumentItemRead[],

  adminNameById: Map<number, string>,

): ReceivingLineAuditSummary | null {

  const logs: ReceivingScanLogRead[] = [];

  for (const it of items) {

    for (const log of it.receiving_scan_logs ?? []) logs.push(log);

  }

  if (!logs.length) return null;



  logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const latest = logs[0]!;

  const adminIds = new Set(logs.map((l) => l.admin_id));

  const extra = Math.max(0, adminIds.size - 1);



  return {

    lastAdminId: latest.admin_id,

    lastOperatorName: operatorDisplayName(latest, adminNameById),

    lastAt: latest.created_at,

    extraOperatorCount: extra,

  };

}


