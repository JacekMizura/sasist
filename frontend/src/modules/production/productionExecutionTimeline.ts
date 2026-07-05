export type TimelineStepStatus = "done" | "active" | "pending" | "skipped";

export type ProductionTimelineStep = {
  key: string;
  label: string;
  status: TimelineStepStatus;
  at?: string | null;
  detail?: string | null;
};

const TERMINAL = new Set(["completed", "cancelled"]);

const STATUS_RANK: Record<string, number> = {
  draft: 0,
  planned: 1,
  collecting: 2,
  in_progress: 3,
  awaiting_putaway: 4,
  putaway: 4,
  completed: 5,
  cancelled: -1,
};

function rank(status: string): number {
  return STATUS_RANK[status] ?? 0;
}

export type TimelinePwDocument = {
  id: number;
  number?: string | null;
};

export type TimelineSource = {
  status: string;
  created_at?: string | null;
  released_to_wms_at?: string | null;
  is_released_to_wms?: boolean;
  started_at?: string | null;
  collecting_completed_at?: string | null;
  production_completed_at?: string | null;
  completed_at?: string | null;
  rw_document_number?: string | null;
  pw_document_number?: string | null;
  rw_stock_document_id?: number | null;
  pw_stock_document_id?: number | null;
  pw_documents?: TimelinePwDocument[];
};

export function buildProductionTimeline(src: TimelineSource): ProductionTimelineStep[] {
  const status = String(src.status || "draft").toLowerCase();
  const wmsDone = Boolean(src.is_released_to_wms || src.released_to_wms_at);
  const collectingDone = Boolean(
    src.collecting_completed_at || rank(status) >= rank("in_progress"),
  );
  const productionDone = Boolean(
    src.production_completed_at || rank(status) >= rank("awaiting_putaway"),
  );
  const pwDocs =
    src.pw_documents ??
    (src.pw_stock_document_id
      ? [{ id: src.pw_stock_document_id, number: src.pw_document_number }]
      : []);
  const pwCreated = pwDocs.length > 0;
  const putawayDone = status === "completed";
  const allDone = status === "completed";

  const pwDetail =
    pwDocs.length === 1
      ? `PW ${pwDocs[0].number ?? pwDocs[0].id}`
      : pwDocs.length > 1
        ? `${pwDocs.length} dokumenty PW`
        : null;

  const steps: ProductionTimelineStep[] = [
    {
      key: "created",
      label: "Utworzono",
      status: "done",
      at: src.created_at,
    },
    {
      key: "wms",
      label: "Wydano do WMS",
      status: wmsDone ? "done" : "pending",
      at: src.released_to_wms_at,
    },
    {
      key: "collecting",
      label: "Zbieranie",
      status: collectingDone ? "done" : wmsDone ? "active" : "pending",
      at: collectingDone ? src.collecting_completed_at ?? src.started_at : src.started_at,
      detail: src.rw_document_number ? `RW ${src.rw_document_number}` : null,
    },
    {
      key: "production",
      label: productionDone ? "Produkcja zakończona" : "Produkcja",
      status: productionDone ? "done" : collectingDone ? "active" : "pending",
      at: productionDone ? src.production_completed_at : null,
    },
    {
      key: "pw_document",
      label: "Utworzono dokument PW",
      status: pwCreated ? "done" : productionDone ? "active" : "pending",
      at: pwCreated ? src.production_completed_at : null,
      detail: pwDetail,
    },
    {
      key: "putaway",
      label: "Rozlokowanie",
      status: putawayDone ? "done" : pwCreated ? "active" : "pending",
      at: putawayDone ? src.completed_at : null,
      detail: pwDetail,
    },
    {
      key: "completed",
      label: "Zakończono",
      status: allDone ? "done" : "pending",
      at: src.completed_at,
    },
  ];

  if (status === "cancelled") {
    return steps.map((s) =>
      s.key === "created" ? s : { ...s, status: "skipped" as const, detail: "Anulowano" },
    );
  }

  return steps;
}

export function currentExecutionPhaseLabel(status: string): string {
  const key = String(status || "draft").toLowerCase();
  switch (key) {
    case "draft":
    case "planned":
      return "Planowanie";
    case "collecting":
      return "Zbieranie surowców";
    case "in_progress":
      return "Produkcja";
    case "awaiting_putaway":
      return "Oczekuje na rozlokowanie";
    case "putaway":
      return "Rozlokowanie w toku";
    case "completed":
      return "Zakończone";
    case "cancelled":
      return "Anulowane";
    default:
      return key;
  }
}

export function formatTimelineTimestamp(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16).replace("T", " ");
  return d.toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
