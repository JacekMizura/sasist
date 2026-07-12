export type PrintJobStatusFilter =
  | "all"
  | "pending"
  | "processing"
  | "printed"
  | "failed"
  | "cancelled";

export const PRINT_JOB_STATUS_FILTERS: { value: PrintJobStatusFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "pending", label: "Oczekujące" },
  { value: "processing", label: "W trakcie" },
  { value: "printed", label: "Wydrukowane" },
  { value: "failed", label: "Nieudane" },
  { value: "cancelled", label: "Anulowane" },
];

export function printJobStatusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Oczekuje";
    case "processing":
      return "W trakcie";
    case "printed":
      return "Wydrukowano";
    case "failed":
      return "Błąd";
    case "cancelled":
      return "Anulowano";
    default:
      return status;
  }
}

export function printJobStatusClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200/80";
    case "processing":
      return "bg-orange-50 text-orange-700 ring-1 ring-orange-200/80";
    case "printed":
      return "bg-green-50 text-green-700 ring-1 ring-green-200/80";
    case "failed":
      return "bg-red-50 text-red-700 ring-1 ring-red-200/80";
    case "cancelled":
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80";
    default:
      return "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80";
  }
}

export function agentHealthClass(health: string): string {
  switch (health) {
    case "online":
      return "bg-green-50 text-green-700 ring-1 ring-green-200/80";
    case "stale":
      return "bg-orange-50 text-orange-700 ring-1 ring-orange-200/80";
    default:
      return "bg-red-50 text-red-700 ring-1 ring-red-200/80";
  }
}

export function agentHealthLabel(health: string): string {
  switch (health) {
    case "online":
      return "Online";
    case "stale":
      return "Opóźniony";
    default:
      return "Offline";
  }
}

export function canRetryJob(status: string): boolean {
  return status === "failed" || status === "printed" || status === "cancelled";
}

export function canCancelJob(status: string): boolean {
  return status === "pending" || status === "processing";
}

export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
