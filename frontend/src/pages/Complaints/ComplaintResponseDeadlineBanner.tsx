import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { normalizeComplaintStatus, type ComplaintStatusCode } from "../../types/complaint";

type VisualState = "normal" | "warning" | "danger" | "overdue";

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function complaintDeadlineDaysRemaining(iso: string, now: Date): { overdue: boolean; daysFull: number } {
  const deadline = new Date(iso);
  if (Number.isNaN(deadline.getTime())) return { overdue: false, daysFull: 0 };
  const overdue = now.getTime() > deadline.getTime();
  const dayMs = 86400000;
  const daysFull = Math.round((startOfLocalDay(deadline) - startOfLocalDay(now)) / dayMs);
  return { overdue, daysFull };
}

function openStatusVisual(daysFull: number, overdue: boolean): { state: VisualState; label: string } {
  if (daysFull < 0 || overdue) return { state: "overdue", label: "Po terminie" };
  const d = Math.max(0, daysFull);
  const label = d === 1 ? "Pozostał 1 dzień" : `Pozostało ${d} dni`;
  if (d === 0) return { state: "danger", label };
  if (d <= 2) return { state: "warning", label };
  return { state: "normal", label };
}

function badgeVisualClasses(state: VisualState): string {
  const base =
    "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold leading-tight";
  switch (state) {
    case "normal":
      return `${base} border-slate-200 bg-slate-50 text-slate-800`;
    case "warning":
      return `${base} border-amber-200 bg-amber-50 text-amber-900`;
    case "danger":
      return `${base} border-orange-300 bg-orange-50 text-orange-950`;
    case "overdue":
    default:
      return `${base} border-red-400 bg-red-100 text-red-950 ring-1 ring-red-200/80`;
  }
}

function formatDeadlineDateShort(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const t = Date.parse(String(iso));
  if (Number.isNaN(t)) return "—";
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(t));
}

function visualClasses(state: VisualState, compact: boolean, prominent: boolean): string {
  const base = prominent
    ? "rounded-xl border px-4 py-3 text-base font-semibold shadow-md"
    : compact
      ? "rounded-lg border px-2 py-1 text-[10px] font-semibold"
      : "rounded-xl border px-3 py-2 text-sm font-semibold";
  switch (state) {
    case "normal":
      return `${base} border-slate-200 bg-slate-50 text-slate-800`;
    case "warning":
      return `${base} border-amber-200 bg-amber-50 text-amber-900`;
    case "danger":
      return `${base} border-orange-300 bg-orange-50 text-orange-950`;
    case "overdue":
    default:
      return `${base} border-red-400 bg-red-100 text-red-950 ring-1 ring-red-300`;
  }
}

type Props = {
  responseDeadline: string | null | undefined;
  status: string | null | undefined;
  autoAccepted?: boolean | null;
  acceptedByLaw?: boolean | null;
  /** Z API (szczegóły) — spójny licznik z backendem */
  daysRemainingServer?: number | null;
  isOverdueServer?: boolean | null;
  /** Lista: mniejsza typografia */
  compact?: boolean;
  /** Szczegóły: większy, widoczny blok nad treścią */
  prominent?: boolean;
  /** Gdy data terminu jest już obok osi etapów — bez drugiej linii z tą samą datą */
  hideDeadlineDateDuplicate?: boolean;
  /**
   * Układ w sekcji „Przebieg reklamacji”: data w pierwszej linii, licznik dni jako badge (otwarte etapy).
   */
  processAside?: boolean;
};

type BannerContent = {
  className: string;
  main: string;
  sub: string | null;
  showSub: boolean;
  showAlert: boolean;
  /** Tylko etapy otwarte — kolor badge w trybie processAside */
  badgeState?: VisualState;
  /** ZAAKCEPTOWANA bez mocy prawa — tekst compl./alternatywa do badge */
  asideSecondary?: "accepted_on_time";
};

export default function ComplaintResponseDeadlineBanner({
  responseDeadline,
  status,
  autoAccepted,
  acceptedByLaw,
  daysRemainingServer,
  isOverdueServer,
  compact = false,
  prominent = false,
  hideDeadlineDateDuplicate = false,
  processAside = false,
}: Props) {
  const now = new Date();
  const legalAccept = Boolean(autoAccepted || acceptedByLaw);

  const content: BannerContent | null = (() => {
    if (!responseDeadline || !String(responseDeadline).trim()) return null;
    const st = normalizeComplaintStatus(status ?? undefined);

    const deadlineLabel = (() => {
      try {
        const d = new Date(String(responseDeadline));
        if (Number.isNaN(d.getTime())) return null;
        return new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(d);
      } catch {
        return null;
      }
    })();

    if (st === "ODRZUCONA") {
      return null;
    }

    if (st === "ZAAKCEPTOWANA") {
      if (legalAccept) {
        return {
          className: visualClasses("overdue", compact, prominent),
          main: "Po terminie — zaakceptowana z mocy prawa",
          sub: "Brak odpowiedzi w ustawowym terminie (14 dni).",
          showSub: !compact,
          showAlert: true,
        };
      }
      if (deadlineLabel) {
        return {
          className: visualClasses("normal", compact, prominent),
          main: hideDeadlineDateDuplicate
            ? "Zakończono przed upływem terminu."
            : `Termin odpowiedzi: ${deadlineLabel}`,
          sub: hideDeadlineDateDuplicate ? null : "Zakończono przed upływem terminu.",
          showSub: !compact && !hideDeadlineDateDuplicate,
          showAlert: false,
          asideSecondary:
            processAside || hideDeadlineDateDuplicate ? ("accepted_on_time" as const) : undefined,
        };
      }
      return null;
    }

    const open: ComplaintStatusCode[] = ["NOWE", "OCZEKIWANIE_NA_PRODUKT", "WERYFIKACJA", "DECYZJA"];
    if (!open.includes(st)) return null;

    const useServer =
      typeof daysRemainingServer === "number" && typeof isOverdueServer === "boolean" && !Number.isNaN(daysRemainingServer);
    const { overdue, daysFull } = useServer
      ? {
          overdue: Boolean(isOverdueServer) || daysRemainingServer! < 0,
          daysFull: daysRemainingServer!,
        }
      : complaintDeadlineDaysRemaining(String(responseDeadline), now);

    const { state, label } = openStatusVisual(daysFull, overdue);
    return {
      className: visualClasses(state, compact, prominent),
      main: label,
      sub: deadlineLabel && !hideDeadlineDateDuplicate ? `Termin końcowy: ${deadlineLabel}` : null,
      showSub: Boolean(deadlineLabel) && !compact && !hideDeadlineDateDuplicate,
      showAlert: state === "overdue" || state === "danger" || state === "warning",
      badgeState: state,
    };
  })();

  if (!content) return null;

  const dateLine = (
    <p className="text-sm text-gray-700">
      Termin odpowiedzi:{" "}
      <span className="font-medium tabular-nums text-gray-900">{formatDeadlineDateShort(responseDeadline)}</span>
    </p>
  );

  if (processAside) {
    const st = normalizeComplaintStatus(status ?? undefined);
    const wrapAside = (body: ReactNode) => (
      <div className="flex w-full min-w-0 flex-col gap-2 text-left md:w-auto md:max-w-md md:items-end md:text-right">
        {dateLine}
        {body}
      </div>
    );

    if (st === "ZAAKCEPTOWANA" && legalAccept) {
      return wrapAside(
        <div className={content.className}>
          <div className={`flex items-start gap-2 ${prominent ? "gap-3" : ""}`}>
            {content.showAlert ? (
              <AlertTriangle
                className={`shrink-0 text-current opacity-90 ${prominent ? "mt-0.5 h-6 w-6" : "mt-0.5 h-4 w-4"}`}
                aria-hidden
              />
            ) : null}
            <div className="min-w-0">
              <p className="leading-snug">{content.main}</p>
              {content.showSub && content.sub ? (
                <p className={`mt-1 font-normal opacity-90 ${prominent ? "text-sm" : "text-xs"}`}>{content.sub}</p>
              ) : null}
            </div>
          </div>
        </div>,
      );
    }

    if (content.asideSecondary === "accepted_on_time") {
      return wrapAside(
        <span className={badgeVisualClasses("normal")}>Zakończono przed upływem terminu.</span>,
      );
    }

    if (content.badgeState != null) {
      return wrapAside(
        <span className={`${badgeVisualClasses(content.badgeState)}`}>
          {content.showAlert ? (
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-current opacity-90" aria-hidden />
          ) : null}
          {content.main}
        </span>,
      );
    }

    return wrapAside(
      <div className={content.className}>
        <div className={`flex items-start gap-2 ${prominent ? "gap-3" : ""}`}>
          {content.showAlert ? (
            <AlertTriangle
              className={`shrink-0 text-current opacity-90 ${prominent ? "mt-0.5 h-6 w-6" : "mt-0.5 h-4 w-4"}`}
              aria-hidden
            />
          ) : null}
          <div className="min-w-0">
            <p className="leading-snug">{content.main}</p>
            {content.showSub && content.sub ? (
              <p className={`mt-1 font-normal opacity-90 ${prominent ? "text-sm" : "text-xs"}`}>{content.sub}</p>
            ) : null}
          </div>
        </div>
      </div>,
    );
  }

  return (
    <div className={content.className}>
      <div className={`flex items-start gap-2 ${prominent ? "gap-3" : ""}`}>
        {content.showAlert ? (
          <AlertTriangle
            className={`shrink-0 text-current opacity-90 ${prominent ? "mt-0.5 h-6 w-6" : "mt-0.5 h-4 w-4"}`}
            aria-hidden
          />
        ) : null}
        <div className="min-w-0">
          <p className="leading-snug">{content.main}</p>
          {content.showSub && content.sub ? (
            <p className={`mt-1 font-normal opacity-90 ${prominent ? "text-sm" : "text-xs"}`}>{content.sub}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
