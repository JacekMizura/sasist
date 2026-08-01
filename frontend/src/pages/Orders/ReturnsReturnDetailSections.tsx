import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Link } from "react-router-dom";
import {
  Download,
  Eye,
  FileText,
  MessageSquare,
  NotebookPen,
  Printer,
  UserRound,
} from "lucide-react";

import type { CustomerInsightsRead, ReturnUiStatusPanelSummary, WmsReturnRead, WmsSettingsRead } from "../../types/wmsReturn";
import type { ReturnDetailSectionId } from "../../constants/returnModuleDetailSections";
import { RETURN_DETAIL_SECTION_LABELS_PL } from "../../constants/returnModuleDetailSections";
import { getReturnUiStatusSummary, patchReturnRmzUiStatus } from "../../api/returnUiStatusApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { PrimaryButton, primaryButtonClassName } from "../../design-system/PrimaryButton";
import { OrderHistoryTimeline } from "../../components/orders/OrderHistoryTimeline";
import { PanelBulkStatusPickerDropdown } from "../../components/panel/PanelBulkStatusPickerDropdown";
import type { OrderUiPanelSubgroupRead, OrderUiStatusPanelSummary } from "../../types/orderUiStatus";
import {
  ReturnDetailEmptyState,
  ReturnDetailKpiCell,
  ReturnDetailWidgetShell,
  RETURN_WIDGET_TEXTAREA_CLASS,
} from "../../components/returns/detailWidgets/ReturnDetailWidgetShell";
import { buildReturnDetailTimelineEvents } from "../../components/returns/detailWidgets/returnDetailWidgetUtils";

type FiBreakdown = {
  total: number;
  products: number;
  shipping: number;
  adjustments: number | null;
};

type CommEntry = { at: string; body: string; who: string };

export type RmzDetailSectionRenderCtx = {
  data: WmsReturnRead;
  rid: number;
  terminal: boolean;
  cust: string;
  customerAddress: string | null;
  salesDocRaw: string;
  fi: FiBreakdown | null;
  bankRecipient: string;
  bankTransfer: { recipientName: string | null; bankAccount: string | null; address: string | null };
  activityEntries: { at: string; msg: string }[];
  panelCorrectionFileRaw: string | null;
  panelSummary: ReturnUiStatusPanelSummary | null;
  panelSubgroups?: OrderUiPanelSubgroupRead[] | null;
  patchingUi: boolean;
  setPatchingUi: Dispatch<SetStateAction<boolean>>;
  setData: Dispatch<SetStateAction<WmsReturnRead | null>>;
  setErr: Dispatch<SetStateAction<string | null>>;
  setPanelSummary: Dispatch<SetStateAction<ReturnUiStatusPanelSummary | null>>;
  wmsSettings: WmsSettingsRead | null;
  /** @deprecated Widget Terminal WMS usunięty — flaga tylko pod menu nagłówka. */
  showWmsTerminal?: boolean;
  customerInsights: CustomerInsightsRead | null;
  openRefundModal: () => void;
  refund: WmsReturnRead["refund"];
  notesDraft: string;
  setNotesDraft: Dispatch<SetStateAction<string>>;
  notesSavedAt: number | null;
  setNotesSavedAt: Dispatch<SetStateAction<number | null>>;
  commDraft: string;
  setCommDraft: Dispatch<SetStateAction<string>>;
  commEntries: CommEntry[];
  setCommEntries: Dispatch<SetStateAction<CommEntry[]>>;
  panelRmzNotesKey: (id: number) => string;
  panelRmzCommKey: (id: number) => string;
  formatWhen: (iso: string | null | undefined) => string;
  formatMoneyPln: (value: number | null | undefined) => string;
  refundTypeLabelPl: (t: string | null | undefined) => string;
  triggerTextDownload: (filename: string, body: string, mime?: string) => void;
  linesSection: ReactNode;
};

const ghostBtn =
  "inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

export function renderRmzDetailSection(id: ReturnDetailSectionId, ctx: RmzDetailSectionRenderCtx): ReactNode {
  const label = RETURN_DETAIL_SECTION_LABELS_PL[id];
  const {
    data,
    rid,
    terminal,
    cust,
    customerAddress,
    salesDocRaw,
    fi,
    bankRecipient,
    bankTransfer,
    activityEntries,
    panelCorrectionFileRaw,
    panelSummary,
    patchingUi,
    setPatchingUi,
    setData,
    setErr,
    setPanelSummary,
    wmsSettings,
    customerInsights,
    openRefundModal,
    refund,
    notesDraft,
    setNotesDraft,
    notesSavedAt,
    setNotesSavedAt,
    commDraft,
    setCommDraft,
    commEntries,
    setCommEntries,
    panelRmzNotesKey,
    panelRmzCommKey,
    formatWhen,
    formatMoneyPln,
    refundTypeLabelPl,
    triggerTextDownload,
    linesSection,
  } = ctx;

  const resolvedCount = data.lines.filter((ln) => ln.processed_at != null).length;
  const totalLines = data.lines.length;
  const progressPct = totalLines > 0 ? Math.min(100, Math.round((resolvedCount / totalLines) * 100)) : 0;
  const phone = data.phone?.trim() || data.customer_phone?.trim() || "";
  const email = data.email?.trim() || data.customer_email?.trim() || "";

  switch (id) {
    case "return_status":
      return (
        <ReturnDetailWidgetShell
          title="Etykieta na liście"
          hint="Ten sam status co w Panelu Statusów — widoczny na liście zwrotów."
        >
          <PanelBulkStatusPickerDropdown
            className="w-full max-w-full"
            panelSummary={panelSummary as unknown as OrderUiStatusPanelSummary | null}
            panelSubgroups={ctx.panelSubgroups}
            selectedStatusId={data.ui_status?.id ?? null}
            disabled={patchingUi || panelSummary == null || terminal}
            placeholder="Bez etykiety"
            ariaLabel="Etykieta panelu zwrotu"
            onSelect={(v) => {
              const nextId = v === "" ? null : Number(v);
              void (async () => {
                setPatchingUi(true);
                setErr(null);
                try {
                  const updated = await patchReturnRmzUiStatus(rid, DAMAGE_TENANT_ID, nextId, data.warehouse_id);
                  setData(updated);
                  const s = await getReturnUiStatusSummary(DAMAGE_TENANT_ID, data.warehouse_id);
                  setPanelSummary(s);
                } catch {
                  setErr("Nie udało się zapisać statusu.");
                } finally {
                  setPatchingUi(false);
                }
              })();
            }}
          />
        </ReturnDetailWidgetShell>
      );

    case "progress_bar":
      return (
        <ReturnDetailWidgetShell title={label}>
          <div className="mb-2 flex items-end justify-between gap-3">
            <span className="text-[13px] text-slate-600">
              {resolvedCount} / {totalLines || 0} produktów rozliczonych
            </span>
            <span className="text-[12px] font-semibold tabular-nums text-slate-500">{progressPct}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-800 transition-all duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </ReturnDetailWidgetShell>
      );

    case "returned_products":
      return linesSection;

    case "wms_view":
      // Terminal WMS nie jest stałym widgetem — opcjonalna akcja w menu nagłówka.
      return null;

    case "damage_photos":
      return (
        <ReturnDetailWidgetShell title={label}>
          <ReturnDetailEmptyState
            title="Brak zdjęć uszkodzeń"
            description="Podgląd zdjęć z RMZ pojawi się tutaj, gdy będą dostępne."
          />
        </ReturnDetailWidgetShell>
      );

    case "decision_history":
      return (
        <ReturnDetailWidgetShell title={label}>
          {activityEntries.length === 0 ? (
            <ReturnDetailEmptyState
              title="Brak wpisów w dzienniku"
              description="Pełna historia operacyjna jest też dostępna w WMS."
            />
          ) : (
            <OrderHistoryTimeline
              compact
              hideHeader
              bare
              events={buildReturnDetailTimelineEvents(activityEntries)}
              formatDate={formatWhen}
              title="Dziennik"
            />
          )}
        </ReturnDetailWidgetShell>
      );

    case "customer_data": {
      const initials = cust
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("");
      return (
        <ReturnDetailWidgetShell
          title={label}
          icon={<UserRound className="h-4 w-4" strokeWidth={2} aria-hidden />}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[13px] font-semibold text-slate-600"
              aria-hidden
            >
              {initials || "?"}
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-[13px]">
              <p className="font-semibold text-slate-900">{cust}</p>
              {phone ? (
                <a href={`tel:${phone}`} className="block text-slate-700 hover:text-slate-900 hover:underline">
                  {phone}
                </a>
              ) : (
                <p className="text-slate-400">Telefon —</p>
              )}
              {email ? (
                <a href={`mailto:${email}`} className="block break-all text-slate-700 hover:text-slate-900 hover:underline">
                  {email}
                </a>
              ) : (
                <p className="text-slate-400">E-mail —</p>
              )}
              {customerAddress ? (
                <p className="whitespace-pre-line text-slate-600">{customerAddress}</p>
              ) : null}
            </div>
          </div>
        </ReturnDetailWidgetShell>
      );
    }

    case "notes":
      return (
        <ReturnDetailWidgetShell
          title={label}
          icon={<NotebookPen className="h-4 w-4" strokeWidth={2} aria-hidden />}
          hint="Zapis lokalnie w tej przeglądarce."
        >
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={3}
            placeholder="Notatka dla zespołu…"
            className={RETURN_WIDGET_TEXTAREA_CLASS}
          />
          <div className="mt-3 flex items-center gap-3">
            <PrimaryButton
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(panelRmzNotesKey(rid), notesDraft);
                  setNotesSavedAt(Date.now());
                } catch {
                  setErr("Nie udało się zapisać notatek.");
                }
              }}
            >
              Zapisz
            </PrimaryButton>
            {notesSavedAt != null ? (
              <span className="text-[11px] text-slate-400">
                Zapisano: {formatWhen(new Date(notesSavedAt).toISOString())}
              </span>
            ) : null}
          </div>
          {notesDraft.trim() && notesSavedAt != null ? (
            <article className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/40 px-3.5 py-3">
              <div className="mb-1.5 flex flex-wrap items-baseline gap-2 text-[11px]">
                <span className="font-semibold text-slate-800">Operator</span>
                <span className="tabular-nums text-slate-400">
                  {formatWhen(new Date(notesSavedAt).toISOString())}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[13px] text-slate-800">{notesDraft}</p>
            </article>
          ) : null}
        </ReturnDetailWidgetShell>
      );

    case "correspondence":
      return (
        <ReturnDetailWidgetShell
          title={label}
          icon={<MessageSquare className="h-4 w-4" strokeWidth={2} aria-hidden />}
          hint="Wpisy zapisane lokalnie na tym urządzeniu."
        >
          {commEntries.length === 0 ? (
            <ReturnDetailEmptyState
              title="Brak wiadomości"
              description="Dodaj pierwszą wiadomość do klienta lub zespołu."
            />
          ) : (
            <ul className="mb-4 max-h-52 space-y-2.5 overflow-y-auto">
              {[...commEntries]
                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                .map((c, i) => (
                  <li key={i} className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3">
                    <div className="mb-1 flex items-baseline gap-2 text-[11px]">
                      <span className="font-semibold text-slate-900">{c.who}</span>
                      <span className="tabular-nums text-slate-400">{formatWhen(c.at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-[13px] text-slate-800">{c.body}</p>
                  </li>
                ))}
            </ul>
          )}

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Nowa wiadomość
              </span>
              <textarea
                value={commDraft}
                onChange={(e) => setCommDraft(e.target.value)}
                rows={2}
                className={RETURN_WIDGET_TEXTAREA_CLASS}
              />
            </label>
            <PrimaryButton
              type="button"
              className="shrink-0"
              disabled={!commDraft.trim()}
              onClick={() => {
                const body = commDraft.trim();
                if (!body) return;
                const next: CommEntry[] = [...commEntries, { at: new Date().toISOString(), body, who: "Operator" }];
                setCommEntries(next);
                setCommDraft("");
                try {
                  localStorage.setItem(panelRmzCommKey(rid), JSON.stringify(next));
                } catch {
                  setErr("Nie udało się zapisać wiadomości.");
                }
              }}
            >
              Dodaj
            </PrimaryButton>
          </div>
        </ReturnDetailWidgetShell>
      );

    case "attachments": {
      const downloadSales = () => {
        if (!salesDocRaw) return;
        triggerTextDownload(
          `dokument-sprzedazy-${salesDocRaw.replace(/[^\w.-]+/g, "_")}.txt`,
          `Dokument sprzedaży (referencja z panelu)\nNumer: ${salesDocRaw}\nZamówienie: #${data.order_id}\nRMZ: ${data.rmz_number}\n`,
        );
      };
      const downloadCorrection = () => {
        if (!panelCorrectionFileRaw) return;
        try {
          const raw = panelCorrectionFileRaw;
          let fileName = "korekta";
          let body = raw;
          try {
            const parsed = JSON.parse(raw) as { name?: string; content?: string };
            if (typeof parsed.content === "string") body = parsed.content;
            if (typeof parsed.name === "string" && parsed.name.trim()) fileName = parsed.name.trim();
          } catch {
            // raw text
          }
          triggerTextDownload(`${fileName.replace(/[^\w.-]+/g, "_")}.txt`, body);
        } catch {
          setErr("Nie udało się odczytać pliku korekty.");
        }
      };

      return (
        <ReturnDetailWidgetShell title={label}>
          <div className="space-y-3">
            <article className="rounded-xl border border-slate-200/80 px-3.5 py-3">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sprzedaż</p>
                  <p className="mt-0.5 truncate text-[13px] font-semibold text-slate-900" title={salesDocRaw || undefined}>
                    {salesDocRaw || "Brak numeru"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{salesDocRaw ? "Dostępny" : "Brak dokumentu"}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={ghostBtn} disabled={!salesDocRaw} onClick={downloadSales}>
                  <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Pobierz
                </button>
                <button type="button" className={ghostBtn} disabled={!salesDocRaw} onClick={downloadSales}>
                  <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Podgląd
                </button>
                <button type="button" className={ghostBtn} disabled={!salesDocRaw} onClick={downloadSales}>
                  <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  Drukuj
                </button>
              </div>
            </article>

            {panelCorrectionFileRaw ? (
              <article className="rounded-xl border border-slate-200/80 px-3.5 py-3">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Korekta</p>
                    <p className="mt-0.5 text-[13px] font-semibold text-slate-900">Plik korekty</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Zapisany lokalnie</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={ghostBtn} onClick={downloadCorrection}>
                    <Download className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Pobierz
                  </button>
                  <button type="button" className={ghostBtn} onClick={downloadCorrection}>
                    <Eye className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Podgląd
                  </button>
                  <button type="button" className={ghostBtn} onClick={downloadCorrection}>
                    <Printer className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Drukuj
                  </button>
                </div>
              </article>
            ) : (
              <Link to={`/orders/${data.order_id}`} className={`${primaryButtonClassName()} w-full justify-center`}>
                Utwórz korektę
              </Link>
            )}
          </div>
        </ReturnDetailWidgetShell>
      );
    }

    case "payment_data":
      return (
        <ReturnDetailWidgetShell title={label} hint="Z adresu zamówienia (import).">
          <dl className="space-y-3 text-[13px]">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Nazwa</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{bankRecipient}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rachunek</dt>
              <dd className="mt-0.5 break-all font-mono text-[12px] text-slate-900">
                {bankTransfer.bankAccount ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Adres</dt>
              <dd className="mt-0.5 text-slate-800">{bankTransfer.address ?? "—"}</dd>
            </div>
          </dl>
        </ReturnDetailWidgetShell>
      );

    case "refund":
      return (
        <ReturnDetailWidgetShell title={label}>
          <div className="grid grid-cols-2 gap-2.5">
            <ReturnDetailKpiCell label="Zwrot" value={formatMoneyPln(fi?.products ?? 0)} />
            <ReturnDetailKpiCell label="Dostawa" value={formatMoneyPln(fi?.shipping ?? 0)} />
            <ReturnDetailKpiCell
              label="Korekty"
              value={
                fi?.adjustments != null && fi.adjustments !== 0 ? formatMoneyPln(fi.adjustments) : "—"
              }
            />
            <ReturnDetailKpiCell label="Razem" value={formatMoneyPln(fi?.total ?? 0)} />
          </div>

          {wmsSettings?.enable_refund === false ? (
            <p className="mt-4 text-[13px] text-slate-500">Zwrot środków rozliczany w panelu biura.</p>
          ) : (
            <div className="mt-4">
              {refund ? (
                <p className="mb-3 text-[13px] text-slate-800">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Typ zwrotu
                  </span>
                  {refundTypeLabelPl(refund.refund_type)}
                </p>
              ) : (
                <p className="mb-3 text-[12px] text-slate-400">Brak zapisanego zwrotu.</p>
              )}
              <PrimaryButton type="button" className="w-full justify-center" disabled={terminal} onClick={() => openRefundModal()}>
                Zapisz zwrot
              </PrimaryButton>
            </div>
          )}
        </ReturnDetailWidgetShell>
      );

    case "customer_stats":
      return (
        <ReturnDetailWidgetShell title={label}>
          {customerInsights ? (
            <div className="grid grid-cols-2 gap-2.5">
              <ReturnDetailKpiCell label="Zamówienia" value={String(customerInsights.total_orders_count)} />
              <ReturnDetailKpiCell label="Zwroty" value={String(customerInsights.total_returns_count)} />
              <ReturnDetailKpiCell
                label="Wskaźnik zwrotów"
                value={`${Math.round((customerInsights.return_rate || 0) * 100)}%`}
              />
              <ReturnDetailKpiCell label="Ryzyko" value={customerInsights.risk_label || "—"} />
            </div>
          ) : (
            <ReturnDetailEmptyState
              title="Brak statystyk klienta"
              description="Podłącz e-mail klienta, aby wczytać KPI zamówień i zwrotów."
            />
          )}
        </ReturnDetailWidgetShell>
      );

    case "prior_returns_history":
      return (
        <ReturnDetailWidgetShell title={label}>
          <ReturnDetailEmptyState
            title="Brak historii wcześniejszych zwrotów"
            description="Lista wcześniejszych RMZ dla tego klienta pojawi się w kolejnej iteracji."
          />
        </ReturnDetailWidgetShell>
      );

    default:
      return null;
  }
}
