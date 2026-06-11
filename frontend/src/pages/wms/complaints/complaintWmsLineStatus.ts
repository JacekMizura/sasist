import type { ComplaintLineDetail } from "../../../types/complaint";
import { normalizeComplaintStatus } from "../../../types/complaint";

export type ComplaintLineSidebarStatus =
  | "pending"
  | "verification"
  | "repair"
  | "exchange"
  | "reject"
  | "refund"
  | "accepted";

export type ComplaintLineSidebarItem = {
  lineId: number;
  productName: string;
  imageUrl: string | null;
  qty: number;
  status: ComplaintLineSidebarStatus;
  statusLabel: string;
};

const DECISION_LABELS: Record<string, string> = {
  repair: "Naprawa",
  exchange: "Wymiana",
  reject: "Odrzucona",
  refund: "Zwrot środków",
};

export function complaintLineDecisionLabel(decision: string | null | undefined): string {
  const d = String(decision ?? "").trim().toLowerCase();
  return DECISION_LABELS[d] ?? "Oczekuje";
}

export function complaintLineSidebarStatus(
  line: ComplaintLineDetail,
  complaintStatus?: string | null,
): { status: ComplaintLineSidebarStatus; label: string } {
  const decision = String(line.decision ?? "").trim().toLowerCase();
  if (decision === "repair") return { status: "repair", label: DECISION_LABELS.repair };
  if (decision === "exchange") return { status: "exchange", label: DECISION_LABELS.exchange };
  if (decision === "reject") return { status: "reject", label: DECISION_LABELS.reject };
  if (decision === "refund") return { status: "refund", label: DECISION_LABELS.refund };

  const op = String(line.operation_status ?? "").trim().toLowerCase();
  const cmp = normalizeComplaintStatus(complaintStatus);
  if (op === "warehouse_in" || cmp === "WERYFIKACJA" || cmp === "DECYZJA") {
    return { status: "verification", label: "Weryfikacja" };
  }
  if (cmp === "ZAAKCEPTOWANA") return { status: "accepted", label: "Uznana" };
  if (cmp === "ODRZUCONA") return { status: "reject", label: "Odrzucona" };

  return { status: "pending", label: "Oczekuje" };
}

export function complaintLineIsResolved(line: ComplaintLineDetail): boolean {
  return Boolean(String(line.decision ?? "").trim());
}

export function complaintLineSidebarItems(
  lines: ComplaintLineDetail[],
  complaintStatus?: string | null,
): ComplaintLineSidebarItem[] {
  return lines.map((line) => {
    const { status, label } = complaintLineSidebarStatus(line, complaintStatus);
    return {
      lineId: line.id,
      productName: line.product_name?.trim() || `Produkt #${line.product_id ?? line.id}`,
      imageUrl: line.product_image_url ?? null,
      qty: line.quantity,
      status,
      statusLabel: label,
    };
  });
}
