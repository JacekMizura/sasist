/** Odpowiedź z DELETE/POST bulk-delete (produkty, zwroty, klienci, zestawy…). */
export type EntityBulkDeleteResult = {
  success_count: number;
  soft_deleted_count: number;
  blocked_count: number;
  blocked: { order_id?: number; reason?: string; product_id?: number }[];
  errors: string[];
  skipped_not_found: number;
  skipped_already_archived?: number;
  messages: string[];
  deleted: number;
};

export function summarizeEntityBulkDeleteToast(r: EntityBulkDeleteResult): string {
  const msgs = (r.messages ?? []).filter(Boolean);
  if (msgs.length) return msgs.join(" ");
  if (r.errors?.length) return r.errors.join(" ");
  const n = r.deleted ?? r.success_count + r.soft_deleted_count;
  if (n > 0) return `Zakończono operację (${n}).`;
  return "Brak zmian.";
}
