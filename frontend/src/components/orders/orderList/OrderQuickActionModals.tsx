import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { OrderUiStatusPanelSummary } from "../../../types/orderUiStatus";
import { ORDERS_PANEL_GROUP_LABELS } from "../OrdersPanelStatusSidebar";
import type { OrderQuickToolbarActionKind } from "./orderQuickActionKinds";

const inp =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300";
const lab = "block text-xs font-medium text-slate-600";

type ShellProps = {
  title: string;
  subtitle: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
};

function ModalShell({ title, subtitle, busy, onClose, children, footer }: ShellProps) {
  return (
    <div
      className="fixed inset-0 z-[86] flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="flex w-full max-w-md flex-col rounded-xl border border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-action-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="quick-action-title" className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            disabled={busy}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
            onClick={onClose}
            aria-label="Zamknij"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">{footer}</div>
      </div>
    </div>
  );
}

export type OrderQuickActionModalsProps = {
  modal: OrderQuickToolbarActionKind | null;
  orderCount: number;
  panelSummary: OrderUiStatusPanelSummary | null;
  busy: boolean;
  onClose: () => void;
  onApplyChangeStatus: (statusId: string) => Promise<void>;
  onApplyIssueDocument: (documentType: "INVOICE" | "PARAGON") => Promise<void>;
  onApplyAddNote: (text: string) => Promise<void>;
  onApplySetPriority: (priority: "gray" | "blue" | "green" | "yellow" | "orange" | "red" | null) => Promise<void>;
  onApplyPaymentStatus: (paymentStatus: string | null) => Promise<void>;
  /** Etykieta + wiadomość — na razie bez API. */
  onAcknowledgeStub: (message: string) => void;
};

export function OrderQuickActionModals({
  modal,
  orderCount,
  panelSummary,
  busy,
  onClose,
  onApplyChangeStatus,
  onApplyIssueDocument,
  onApplyAddNote,
  onApplySetPriority,
  onApplyPaymentStatus,
  onAcknowledgeStub,
}: OrderQuickActionModalsProps) {
  const [statusId, setStatusId] = useState("");
  const [documentType, setDocumentType] = useState<"INVOICE" | "PARAGON">("INVOICE");
  const [noteText, setNoteText] = useState("");
  const [paymentStatusQuick, setPaymentStatusQuick] = useState("");
  const [priorityColor, setPriorityColor] = useState<"gray" | "blue" | "green" | "yellow" | "orange" | "red" | "">("");

  useEffect(() => {
    if (!modal) return;
    if (modal === "change_status") setStatusId("");
    if (modal === "set_priority") setPriorityColor("");
    if (modal === "issue_document") setDocumentType("INVOICE");
    if (modal === "add_note") setNoteText("");
    if (modal === "change_payment_status") setPaymentStatusQuick("");
  }, [modal]);

  if (!modal) return null;

  const subtitle = `Zamówień: ${orderCount}.`;

  const cancelBtn = (
    <button
      type="button"
      disabled={busy}
      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
      onClick={onClose}
    >
      Anuluj
    </button>
  );

  if (modal === "change_status") {
    return (
      <ModalShell
        title="Zmień status panelu"
        subtitle={subtitle}
        busy={busy}
        onClose={onClose}
        footer={
          <>
            {cancelBtn}
            <button
              type="button"
              disabled={busy || statusId.trim() === ""}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void onApplyChangeStatus(statusId)}
            >
              {busy ? "Zapisywanie…" : "Zastosuj"}
            </button>
          </>
        }
      >
        <label className={lab}>
          Status panelu
          <select
            className={inp}
            disabled={busy}
            value={statusId}
            onChange={(e) => setStatusId(e.target.value)}
          >
            <option value="">— wybierz —</option>
            <option value="__clear__">Usuń etykietę panelu</option>
            {(panelSummary?.groups ?? []).flatMap((block) =>
              block.sub_statuses.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {ORDERS_PANEL_GROUP_LABELS[block.main_group]}: {s.name}
                </option>
              )),
            )}
          </select>
        </label>
      </ModalShell>
    );
  }

  if (modal === "issue_document") {
    return (
      <ModalShell
        title="Wystaw dokument"
        subtitle={subtitle}
        busy={busy}
        onClose={onClose}
        footer={
          <>
            {cancelBtn}
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void onApplyIssueDocument(documentType)}
            >
              {busy ? "Zapisywanie…" : "Zapisz"}
            </button>
          </>
        }
      >
        <fieldset>
          <legend className={lab}>Typ dokumentu</legend>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-slate-800">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="quick-doc-type"
                checked={documentType === "INVOICE"}
                disabled={busy}
                onChange={() => setDocumentType("INVOICE")}
              />
              Faktura
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="quick-doc-type"
                checked={documentType === "PARAGON"}
                disabled={busy}
                onChange={() => setDocumentType("PARAGON")}
              />
              Paragon
            </label>
          </div>
        </fieldset>
      </ModalShell>
    );
  }

  if (modal === "set_priority") {
    return (
      <ModalShell
        title="Ustaw priorytet"
        subtitle={subtitle}
        busy={busy}
        onClose={onClose}
        footer={
          <>
            {cancelBtn}
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void onApplySetPriority(priorityColor || null)}
            >
              {busy ? "Zapisywanie…" : "Zastosuj"}
            </button>
          </>
        }
      >
        <label className={lab}>
          Priorytet
          <select className={inp} disabled={busy} value={priorityColor} onChange={(e) => setPriorityColor(e.target.value as typeof priorityColor)}>
            <option value="">Brak priorytetu</option>
            <option value="gray">Szary</option>
            <option value="blue">Niebieski</option>
            <option value="green">Zielony</option>
            <option value="yellow">Żółty</option>
            <option value="orange">Pomarańczowy</option>
            <option value="red">Czerwony</option>
          </select>
        </label>
      </ModalShell>
    );
  }

  if (modal === "change_payment_status") {
    return (
      <ModalShell
        title="Zmień status płatności"
        subtitle={subtitle}
        busy={busy}
        onClose={onClose}
        footer={
          <>
            {cancelBtn}
            <button
              type="button"
              disabled={busy}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() =>
                void onApplyPaymentStatus(paymentStatusQuick.trim() === "" ? null : paymentStatusQuick.trim())
              }
            >
              {busy ? "Zapisywanie…" : "Zastosuj"}
            </button>
          </>
        }
      >
        <label className={lab}>
          Status płatności (meta panelu)
          <select
            className={inp}
            disabled={busy}
            value={paymentStatusQuick}
            onChange={(e) => setPaymentStatusQuick(e.target.value)}
          >
            <option value="">— wyczyść / nie ustawiaj —</option>
            <option value="oczekuje">oczekuje</option>
            <option value="zaksięgowana">zaksięgowana</option>
            <option value="opłacone">opłacone</option>
            <option value="nieopłacone">nieopłacone</option>
          </select>
        </label>
        <p className="mt-2 text-xs text-slate-500">Ta sama wartość zostanie zapisana we wszystkich zaznaczonych zamówieniach.</p>
      </ModalShell>
    );
  }

  if (modal === "add_note") {
    return (
      <ModalShell
        title="Dodaj notatkę"
        subtitle={subtitle}
        busy={busy}
        onClose={onClose}
        footer={
          <>
            {cancelBtn}
            <button
              type="button"
              disabled={busy || !noteText.trim()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              onClick={() => void onApplyAddNote(noteText)}
            >
              {busy ? "Zapisywanie…" : "Dopisz"}
            </button>
          </>
        }
      >
        <label className={lab}>
          Treść
          <textarea
            className={`${inp} min-h-[5rem]`}
            disabled={busy}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Notatka zostanie dopisana do każdego zaznaczonego zamówienia."
          />
        </label>
      </ModalShell>
    );
  }

  if (modal === "generate_label") {
    return (
      <ModalShell
        title="Generuj etykietę"
        subtitle={subtitle}
        busy={false}
        onClose={onClose}
        footer={
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => onAcknowledgeStub("Generowanie etykiety — funkcja w przygotowaniu.")}
          >
            Rozumiem
          </button>
        }
      >
        <p className="text-sm text-slate-600">Ta akcja będzie dostępna wkrótce.</p>
      </ModalShell>
    );
  }

  if (modal === "send_message") {
    return (
      <ModalShell
        title="Wyślij wiadomość"
        subtitle={subtitle}
        busy={false}
        onClose={onClose}
        footer={
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            onClick={() => onAcknowledgeStub("Wysyłka wiadomości — funkcja w przygotowaniu.")}
          >
            Rozumiem
          </button>
        }
      >
        <p className="text-sm text-slate-600">Ta akcja będzie dostępna wkrótce.</p>
      </ModalShell>
    );
  }

  return null;
}
