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
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <p className="mb-2 text-xs text-slate-500">Widoczna nazwa na liście zwrotów i w tym widoku.</p>
          <p className="mb-6 text-sm text-slate-900">
            Stan dokumentu: <span className="font-semibold">{data.status?.name ?? "—"}</span>
          </p>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">Etykieta na liście</span>
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
              className={`${listSellasistInputClass} mt-2 w-full !border-0 !border-b !border-slate-200 !bg-transparent !px-0 !py-2 text-sm text-slate-900 !shadow-none !ring-0 focus:!border-slate-900`}
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
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <div className="mb-2 flex items-end justify-between">
            <span className="text-sm text-slate-600">Rozliczono pozycje</span>
            <span className="font-semibold tabular-nums text-slate-900">
              {resolvedCount}/{totalLines || 1}
            </span>
          </div>
          <div className="h-1 w-full overflow-hidden bg-slate-100">
            <div
              className="h-full bg-slate-900 transition-all duration-300"
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
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <p className="text-sm text-slate-600">
            Zdjęcia i dokumentacja z terminala —{" "}
            <Link to={WMS_ROUTES.returnsProcess(data.id)} className="font-medium text-slate-900 underline underline-offset-4 hover:text-slate-600">
              otwórz terminal WMS
            </Link>
          </p>
        </div>
      );

    case "damage_photos":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <p className="text-sm text-slate-500">Podgląd zdjęć z RMZ — wkrótce.</p>
        </div>
      );

    case "decision_history":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <ul className="max-h-52 overflow-y-auto text-sm">
            {activityEntries.length === 0 ? (
              <li className="text-slate-500">Brak wpisów (pełna historia w WMS).</li>
            ) : (
              activityEntries.map((e, i) => (
                <li key={i} className="flex gap-4 border-b border-slate-50 py-3 last:border-0">
                  <span className="shrink-0 tabular-nums text-xs text-slate-400">{formatWhen(e.at)}</span>
                  <span className="text-slate-800">{e.msg}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      );

    case "customer_data":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Nazwa</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{cust}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Telefon</dt>
              <dd className="mt-0.5 break-all text-slate-800">{data.phone?.trim() || data.customer_phone?.trim() || "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">E-mail</dt>
              <dd className="mt-0.5 break-all text-slate-800">{data.email?.trim() || data.customer_email?.trim() || "—"}</dd>
            </div>
          </dl>
        </div>
      );

    case "notes":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <p className="mb-3 text-[10px] text-slate-400">Zapis lokalnie w tej przeglądarce.</p>
          <textarea
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            rows={3}
            placeholder="Notatka dla zespołu…"
            className="w-full resize-y border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-900 placeholder:text-slate-300 focus:border-slate-900 focus:ring-0"
          />
          <div className="mt-4 flex items-center gap-4">
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
              className="bg-slate-900 px-5 py-2 text-xs font-semibold tracking-wide text-white transition-colors hover:bg-slate-800"
            >
              Zapisz
            </button>
            {notesSavedAt != null ? (
              <span className="text-[10px] text-slate-400">Zapisano: {formatWhen(new Date(notesSavedAt).toISOString())}</span>
            ) : null}
          </div>
        </div>
      );

    case "correspondence":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <p className="mb-4 text-[10px] text-slate-400">Wpisy zapisane lokalnie na tym urządzeniu.</p>
          
          <ul className="mb-6 max-h-40 space-y-4 overflow-y-auto text-sm">
            {commEntries.length === 0 ? (
              <li className="text-slate-500">Brak wiadomości.</li>
            ) : (
              [...commEntries]
                .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                .map((c, i) => (
                  <li key={i} className="border-l-2 border-slate-200 pl-3">
                    <div className="mb-1 flex items-baseline gap-2 text-[10px]">
                      <span className="font-semibold uppercase tracking-wider text-slate-900">{c.who}</span>
                      <span className="text-slate-400 tabular-nums">{formatWhen(c.at)}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{c.body}</p>
                  </li>
                ))
            )}
          </ul>
          
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Nowa wiadomość</span>
              <textarea
                value={commDraft}
                onChange={(e) => setCommDraft(e.target.value)}
                rows={2}
                className="w-full resize-none border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-sm text-slate-900 focus:border-slate-900 focus:ring-0"
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
              className="shrink-0 bg-slate-900 px-5 py-2 text-xs font-semibold tracking-wide text-white transition-colors hover:bg-slate-800 disabled:opacity-30"
            >
              Dodaj
            </button>
          </div>
        </div>
      );

    case "attachments":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <div className="space-y-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Sprzedaż</span>
                <span className="block truncate text-slate-900" title={salesDocRaw || undefined}>
                  {salesDocRaw || "—"}
                </span>
              </div>
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
                className="shrink-0 border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
              >
                Pobierz
              </button>
            </div>
            
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-50 pt-4">
              <div>
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Korekta</span>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/orders/${data.order_id}`}
                  className="bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800"
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
                          // raw text
                        }
                        triggerTextDownload(`${fileName.replace(/[^\w.-]+/g, "_")}.txt`, body);
                      } catch {
                        setErr("Nie udało się odczytać pliku korekty.");
                      }
                    }}
                    className="border border-slate-200 px-4 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50"
                  >
                    Pobierz
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      );

    case "payment_data":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <p className="mb-4 text-[10px] text-slate-400">Z adresu zamówienia (import).</p>
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Nazwa</dt>
              <dd className="mt-0.5 text-slate-900">{bankRecipient}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Rachunek</dt>
              <dd className="mt-0.5 break-all font-mono text-sm text-slate-900">{bankTransfer.bankAccount ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Adres</dt>
              <dd className="mt-0.5 text-slate-800">{bankTransfer.address ?? "—"}</dd>
            </div>
          </dl>
        </div>
      );

    case "refund":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-4 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          
          <div className="mb-6">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Łączny zwrot</p>
            <p className="text-3xl font-light tracking-tight tabular-nums text-slate-900">{formatMoneyPln(fi?.total ?? 0)}</p>
          </div>

          <div className="mb-6 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Produkty</span>
              <span className="font-medium tabular-nums text-slate-900">{formatMoneyPln(fi?.products ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Dostawa</span>
              <span className="font-medium tabular-nums text-slate-900">{formatMoneyPln(fi?.shipping ?? 0)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Korekty</span>
              <span className="font-medium tabular-nums text-slate-700">
                {fi?.adjustments != null && fi.adjustments !== 0 ? formatMoneyPln(fi.adjustments) : "—"}
              </span>
            </div>
          </div>

          {wmsSettings?.enable_refund === false ? (
            <p className="text-sm text-slate-500">Zwrot środków rozliczany w panelu biura.</p>
          ) : (
            <div className="pt-2">
              {refund ? (
                <p className="mb-4 text-sm text-slate-800">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">Typ zwrotu</span>
                  {refundTypeLabelPl(refund.refund_type)}
                </p>
              ) : (
                <p className="mb-4 text-[10px] text-slate-400">Brak zapisanego zwrotu.</p>
              )}

              <button
                type="button"
                disabled={terminal}
                onClick={() => openRefundModal()}
                className="w-full bg-slate-900 py-3 text-xs font-semibold tracking-wide text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30"
              >
                ZAPISZ ZWROT
              </button>
            </div>
          )}
        </div>
      );

    case "customer_stats":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <p className="text-sm text-slate-500">Dodatkowe informacje o kliencie pojawią się tutaj po podłączeniu analityki.</p>
        </div>
      );

    case "prior_returns_history":
      return (
        <div className="border-b border-slate-100 py-6 last:border-0">
          <h2 className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-900">{label}</h2>
          <p className="text-sm text-slate-500">Historia wcześniejszych zwrotów dla tego klienta — w przygotowaniu.</p>
        </div>
      );

    default:
      return null;
  }
}