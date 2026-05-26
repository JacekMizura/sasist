import type { Dispatch, ReactNode, SetStateAction } from "react";
import { Link } from "react-router-dom";

import type { ReturnUiStatusPanelSummary, WmsReturnRead, WmsSettingsRead } from "../../types/wmsReturn";
import type { ReturnDetailSectionId } from "../../constants/returnModuleDetailSections";
import { RETURN_DETAIL_SECTION_LABELS_PL } from "../../constants/returnModuleDetailSections";
import { getReturnUiStatusSummary, patchReturnRmzUiStatus } from "../../api/returnUiStatusApi";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { WMS_ROUTES } from "../wms/wmsRoutes";
import { listSellasistInputClass } from "../../components/listPage/listSellasistTokens";

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
  salesDocRaw: string;
  fi: FiBreakdown | null;
  bankRecipient: string;
  bankTransfer: { recipientName: string | null; bankAccount: string | null; address: string | null };
  activityEntries: { at: string; msg: string }[];
  panelCorrectionFileRaw: string | null;
  panelSummary: ReturnUiStatusPanelSummary | null;
  patchingUi: boolean;
  setPatchingUi: Dispatch<SetStateAction<boolean>>;
  setData: Dispatch<SetStateAction<WmsReturnRead | null>>;
  setErr: Dispatch<SetStateAction<string | null>>;
  setPanelSummary: Dispatch<SetStateAction<ReturnUiStatusPanelSummary | null>>;
  wmsSettings: WmsSettingsRead | null;
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
  detailGroupLabels: Record<string, string>;
  linesSection: ReactNode;
};

export function renderRmzDetailSection(id: ReturnDetailSectionId, ctx: RmzDetailSectionRenderCtx): ReactNode {
  const label = RETURN_DETAIL_SECTION_LABELS_PL[id];
  const {
    data,
    rid,
    terminal,
    cust,
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
    detailGroupLabels,
    linesSection,
  } = ctx;

  const resolvedCount = data.lines.filter((ln) => ln.processed_at != null).length;
  const totalLines = data.lines.length;

  switch (id) {
    case "return_status":
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <p className="mt-1 text-[11px] text-gray-500">Widoczna nazwa na liście zwrotów i w tym widoku.</p>
          <p className="mt-2 text-[11px] text-gray-600">
            Stan dokumentu: <span className="font-medium text-gray-900">{data.status?.name ?? "—"}</span>
          </p>
          <label className="mt-2 block">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Etykieta na liście</span>
            <select
              value={data.ui_status?.id ?? ""}
              disabled={patchingUi || panelSummary == null || terminal}
              onChange={(e) => {
                const v = e.target.value;
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
              className={`${listSellasistInputClass} mt-1 max-w-full`}
            >
              <option value="">— bez etykiety</option>
              {(panelSummary?.groups ?? []).map((block) => (
                <optgroup key={block.main_group} label={detailGroupLabels[block.main_group] ?? block.main_group}>
                  {block.sub_statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
      );

    case "progress_bar":
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <p className="mt-2 text-sm text-gray-800">
            Rozliczono{" "}
            <span className="font-semibold tabular-nums">
              {resolvedCount}/{totalLines || 1}
            </span>{" "}
            pozycji
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-slate-700 transition-[width]"
              style={{
                width: `${totalLines > 0 ? Math.min(100, Math.round((resolvedCount / totalLines) * 100)) : 0}%`,
              }}
            />
          </div>
        </div>
      );

    case "returned_products":
      return linesSection;

    case "wms_view":
      return (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          </div>
          <div className="px-3 py-2">
            <p className="text-xs text-gray-600">
              Zdjęcia i dokumentacja z terminala —{" "}
              <Link to={WMS_ROUTES.returnsProcess(data.id)} className="font-medium text-blue-700 hover:underline">
                otwórz terminal WMS
              </Link>
              .
            </p>
          </div>
        </div>
      );

    case "damage_photos":
      return (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          </div>
          <div className="px-3 py-2">
            <p className="text-xs text-gray-500">Podgląd zdjęć z RMZ — wkrótce.</p>
          </div>
        </div>
      );

    case "decision_history":
      return (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-3 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          </div>
          <ul className="max-h-52 overflow-y-auto px-3 py-2 text-sm">
            {activityEntries.length === 0 ? (
              <li className="text-gray-500">Brak wpisów (pełna historia w WMS).</li>
            ) : (
              activityEntries.map((e, i) => (
                <li key={i} className="flex gap-3 border-b border-gray-100 py-1.5 last:border-0">
                  <span className="shrink-0 tabular-nums text-xs text-gray-400">{formatWhen(e.at)}</span>
                  <span className="text-gray-800">{e.msg}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      );

    case "customer_data":
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <dl className="mt-2 space-y-1.5 text-xs leading-snug">
            <div>
              <dt className="text-[10px] font-medium uppercase text-gray-400">Nazwa</dt>
              <dd className="font-medium text-gray-900">{cust}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase text-gray-400">Telefon</dt>
              <dd className="break-all text-gray-800">{data.phone?.trim() || data.customer_phone?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase text-gray-400">E-mail</dt>
              <dd className="break-all text-gray-800">{data.email?.trim() || data.customer_email?.trim() || "—"}</dd>
            </div>
          </dl>
        </div>
      );

    case "notes":
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <p className="mt-1 text-[10px] text-gray-500">Zapis lokalnie w tej przeglądarce.</p>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={3}
            placeholder="Notatka dla zespołu…"
            className="mt-1.5 w-full resize-y rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                try {
                  localStorage.setItem(panelRmzNotesKey(rid), notesDraft);
                  setNotesSavedAt(Date.now());
                } catch {
                  setErr("Nie udało się zapisać notatek.");
                }
              }}
              className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-800"
            >
              Zapisz
            </button>
            {notesSavedAt != null ? (
              <span className="text-[10px] text-gray-500">{formatWhen(new Date(notesSavedAt).toISOString())}</span>
            ) : null}
          </div>
        </div>
      );

    case "correspondence":
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <p className="mt-1 text-[10px] text-gray-500">Wpisy zapisane lokalnie na tym urządzeniu.</p>
          <ul className="mt-1.5 max-h-32 space-y-1 overflow-y-auto text-sm">
            {commEntries.length === 0 ? (
              <li className="text-gray-500">Brak wiadomości.</li>
            ) : (
              [...commEntries]
                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                .map((c, i) => (
                  <li key={i} className="border-b border-gray-100 px-0.5 py-1 last:border-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-1 text-[10px] text-gray-500">
                      <span className="font-medium text-gray-700">{c.who}</span>
                      <span className="tabular-nums">{formatWhen(c.at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-xs text-gray-800">{c.body}</p>
                  </li>
                ))
            )}
          </ul>
          <div className="mt-1.5 flex flex-col gap-1.5 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1 text-xs">
              <span className="text-gray-600">Wiadomość</span>
              <textarea
                value={commDraft}
                onChange={(e) => setCommDraft(e.target.value)}
                rows={2}
                className="mt-0.5 w-full resize-none rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
              />
            </label>
            <button
              type="button"
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
              className="shrink-0 rounded-md bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
            >
              Dodaj
            </button>
          </div>
        </div>
      );

    case "attachments":
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <div className="mt-2 space-y-2 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-medium text-gray-700">Sprzedaż</span>
              <span className="min-w-0 flex-1 truncate text-gray-900" title={salesDocRaw || undefined}>
                {salesDocRaw || "—"}
              </span>
              <button
                type="button"
                disabled={!salesDocRaw}
                title={!salesDocRaw ? "Brak numeru dokumentu" : "Pobierz plik referencyjny"}
                onClick={() => {
                  if (!salesDocRaw) return;
                  triggerTextDownload(
                    `dokument-sprzedazy-${salesDocRaw.replace(/[^\w.-]+/g, "_")}.txt`,
                    `Dokument sprzedaży (referencja z panelu)\nNumer: ${salesDocRaw}\nZamówienie: #${data.order_id}\nRMZ: ${data.rmz_number}\n`,
                  );
                }}
                className="shrink-0 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Pobierz
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2">
              <span className="font-medium text-gray-700">Korekta</span>
              <Link
                to={`/orders/${data.order_id}`}
                className="shrink-0 rounded-md bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-800"
              >
                Utwórz
              </Link>
              {panelCorrectionFileRaw ? (
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const raw = panelCorrectionFileRaw;
                      let fileName = "korekta";
                      let body = raw;
                      try {
                        const parsed = JSON.parse(raw) as { name?: string; content?: string };
                        if (typeof parsed.content === "string") body = parsed.content;
                        if (typeof parsed.name === "string" && parsed.name.trim()) fileName = parsed.name.trim();
                      } catch {
                        /* raw text */
                      }
                      triggerTextDownload(`${fileName.replace(/[^\w.-]+/g, "_")}.txt`, body);
                    } catch {
                      setErr("Nie udało się odczytać pliku korekty.");
                    }
                  }}
                  className="shrink-0 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50"
                >
                  Pobierz
                </button>
              ) : null}
            </div>
          </div>
        </div>
      );

    case "payment_data":
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <p className="mt-0.5 text-[10px] text-gray-500">Z adresu zamówienia (import).</p>
          <dl className="mt-1.5 space-y-1 text-xs leading-snug">
            <div>
              <dt className="text-[10px] font-medium uppercase text-gray-400">Nazwa</dt>
              <dd className="text-gray-900">{bankRecipient}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase text-gray-400">Rachunek</dt>
              <dd className="break-all font-mono text-[11px] text-gray-800">{bankTransfer.bankAccount ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase text-gray-400">Adres</dt>
              <dd className="text-gray-800">{bankTransfer.address ?? "—"}</dd>
            </div>
          </dl>
        </div>
      );

    case "refund":
      return (
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Suma</p>
          <p className="text-2xl font-bold tabular-nums leading-none text-gray-900">{formatMoneyPln(fi?.total ?? 0)}</p>
          <p className="mt-0.5 text-[10px] text-gray-500">Łączny zwrot</p>

          <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 border-t border-gray-100 pt-2 text-xs leading-tight">
            <div className="min-w-0 space-y-0.5">
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">Produkty</span>
                <span className="shrink-0 font-medium tabular-nums text-gray-900">{formatMoneyPln(fi?.products ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">Dostawa</span>
                <span className="shrink-0 font-medium tabular-nums text-gray-900">{formatMoneyPln(fi?.shipping ?? 0)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-gray-600">Korekty</span>
                <span className="shrink-0 font-medium tabular-nums text-gray-700">
                  {fi?.adjustments != null && fi.adjustments !== 0 ? formatMoneyPln(fi.adjustments) : "—"}
                </span>
              </div>
            </div>
          </div>

          {wmsSettings?.enable_refund === false ? (
            <p className="mt-2 text-xs leading-snug text-gray-600">Zwrot środków rozliczany w panelu biura.</p>
          ) : (
            <>
              {refund ? (
                <p className="mt-1.5 text-[10px] text-gray-500">
                  Typ zwrotu: <span className="font-medium text-gray-800">{refundTypeLabelPl(refund.refund_type)}</span>
                </p>
              ) : (
                <p className="mt-1.5 text-[10px] text-gray-500">Brak zapisanego zwrotu.</p>
              )}

              <button
                type="button"
                disabled={terminal}
                onClick={() => openRefundModal()}
                className="mt-2 w-full rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Zapisz zwrot
              </button>
            </>
          )}
        </div>
      );

    case "customer_stats":
      return (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 text-xs text-gray-600">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <p className="mt-2 leading-relaxed">Dodatkowe informacje o kliencie pojawią się tutaj po podłączeniu analityki.</p>
        </div>
      );

    case "prior_returns_history":
      return (
        <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50/80 p-3 text-xs text-gray-600">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</h2>
          <p className="mt-2 leading-relaxed">Historia wcześniejszych zwrotów dla tego klienta — w przygotowaniu.</p>
        </div>
      );

    default:
      return null;
  }
}
