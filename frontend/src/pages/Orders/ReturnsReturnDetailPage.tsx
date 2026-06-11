import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronRight, Home, List } from "lucide-react";

import api from "../../api/axios";
import {
  getWmsReturn,
  getWmsReturnsModeSettings,
  finalizeWmsReturn,
} from "../../api/wmsReturnsApi";
import { getReturnUiStatusSummary } from "../../api/returnUiStatusApi";
import { getOfficeReturnModuleConfig } from "../../api/returnModuleConfigApi";
import type {
  ReturnUiMainGroup,
  ReturnUiStatusPanelSummary,
  ReturnStatusBrief,
  WmsReturnFinalizeLineIn,
  WmsReturnLineDamageEntryRead,
  WmsReturnLineRead,
  WmsReturnRead,
  WmsSettingsRead,
} from "../../types/wmsReturn";
import { coercePhotoUrlForDamageEntry, createDamageEntry } from "../../api/damageReportsApi";
import { uploadDamageImageFile } from "../../api/damageUploadApi";
import { formatRelativeAgo } from "../../utils/formatRelativeAgo";
import { resolveDamageMediaUrl } from "../../utils/resolveDamageMediaUrl";
import {
  finalizeLineFromProcess,
  finalizeLineFromRead,
  finalizeLineFromSplit,
  isFinalizeLineComplete,
  isRmzLineFullyResolved,
  mergeLineReadFromDraft,
} from "../../utils/rmzFinalizePayload";
import { WMS_ROUTES } from "../wms/wmsRoutes";
import {
  decodeRmzDamageTypePayload,
  encodeRmzDamageTypePayload,
  filterRmzDamageTypeIdsForClass,
  rmzDamageTypeLabel,
  RmzDamageTypeChips,
} from "../damage/rmzDamageTypes";
import { WMS_REJECT_OTHER_ID, WMS_REJECT_REASON_GROUPS, wmsRejectReasonSelectOptions } from "../damage/wmsRejectReasons";

const WMS_REJECT_LABEL_BY_ID: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const g of WMS_REJECT_REASON_GROUPS) {
    for (const r of g.reasons) m.set(r.id, r.label);
  }
  return m;
})();

function wmsRejectReasonLabel(code: string): string {
  const c = code.trim();
  if (!c) return "—";
  return WMS_REJECT_LABEL_BY_ID.get(c) ?? c;
}

/** Wyciąga zapis odrzucenia z `damage_type` (osobno: pełna linia / część `reject:` przy split). */
function parseRejectEvidenceFromLine(line: WmsReturnLineRead): { reasonId: string; note: string | null } | null {
  const dt = (line.damage_type ?? "").trim();
  if (!dt) return null;
  let enc: string | null = null;
  const rejectIdx = dt.lastIndexOf("reject:");
  if (rejectIdx >= 0) {
    enc = dt.slice(rejectIdx + "reject:".length).trim();
  } else if (line.decision === "REJECTED") {
    /* Cała linia odrzucona przez `/process` — `damage_type` to wyłącznie meta odrzucenia. */
    enc = dt;
  }
  if (!enc) return null;
  const pipeNotatka = enc.indexOf("|notatka:");
  if (pipeNotatka >= 0) {
    return {
      reasonId: enc.slice(0, pipeNotatka).trim(),
      note: enc.slice(pipeNotatka + "|notatka:".length).trim() || null,
    };
  }
  const parts = enc.split(" | ").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[1].startsWith("notatka:")) {
    return { reasonId: parts[0], note: parts[1].slice("notatka:".length).trim() || null };
  }
  return { reasonId: enc.trim(), note: null };
}

function DamageEntryEvidenceCard({ ent }: { ent: WmsReturnLineDamageEntryRead }) {
  const reasonIds = decodeRmzDamageTypePayload(ent.damage_type ?? null);
  const reasonLabels = reasonIds.map((id) => rmzDamageTypeLabel(id)).filter(Boolean);
  const photos = [...new Set((ent.photo_urls ?? []).map((u) => String(u).trim()).filter(Boolean))];
  const qty = Math.max(1, Math.floor(Number(ent.qty) || 1));
  const op = (ent.operator_name ?? "").trim();
  const when = formatWhen(ent.created_at ?? null);
  const note = (ent.note ?? "").trim();

  return (
    <div className="rounded-lg border border-slate-200/90 bg-slate-50/50 px-2.5 py-2 text-[11px] text-slate-800 shadow-sm">
      <p className="font-bold uppercase tracking-wide text-slate-700">
        Uszkodzone — klasa {ent.condition}
        {qty > 1 ? <span className="ml-1.5 font-semibold tabular-nums normal-case text-slate-600">· {qty} szt.</span> : null}
      </p>
      {reasonLabels.length > 0 ? (
        <div className="mt-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Powody</p>
          <ul className="mt-0.5 list-inside list-disc text-slate-700">
            {reasonLabels.map((label, i) => (
              <li key={`${ent.id}-r-${i}`}>{label}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-1 text-slate-500">Brak wskazanych powodów w zapisie.</p>
      )}
      {photos.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Zdjęcia ({photos.length})
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {photos.map((u, pi) => (
              <a
                key={`${u}-${pi}`}
                href={resolveDamageMediaUrl(u)}
                target="_blank"
                rel="noopener noreferrer"
                className="block shrink-0"
              >
                <img
                  src={resolveDamageMediaUrl(u)}
                  alt=""
                  className="h-12 w-12 rounded-md border border-slate-200 object-cover"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}
      {note ? (
        <div className="mt-2 border-t border-slate-200/80 pt-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Notatka</p>
          <p className="mt-0.5 whitespace-pre-wrap text-slate-700">&ldquo;{note}&rdquo;</p>
        </div>
      ) : null}
      <p className="mt-2 text-[10px] text-slate-500">
        {op ? <span className="font-medium text-slate-600">{op}</span> : <span>Operator: —</span>}
        <span className="mx-1 text-slate-300">·</span>
        <span className="tabular-nums">{when}</span>
      </p>
    </div>
  );
}

function RejectionEvidencePanel({
  line,
  rejectedUnits,
}: {
  line: WmsReturnLineRead;
  rejectedUnits: number;
}) {
  if (rejectedUnits < 1) return null;
  const parsed = parseRejectEvidenceFromLine(line);
  const rejPhotos = Array.isArray(line.photo_urls)
    ? [...new Set(line.photo_urls.map((u) => String(u).trim()).filter(Boolean))]
    : [];

  return (
    <div className="mt-3 space-y-2 border-t border-dashed border-rose-200/60 pt-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-rose-800/90">Odrzucenie — dokumentacja</p>
      <p className="text-[11px] font-semibold tabular-nums text-slate-700">{rejectedUnits} szt.</p>
      {parsed ? (
        <p className="text-[11px] text-slate-800">
          <span className="font-semibold text-slate-600">Powód: </span>
          {wmsRejectReasonLabel(parsed.reasonId)}
          {parsed.note ? (
            <span className="mt-1 block whitespace-pre-wrap text-slate-700">&ldquo;{parsed.note}&rdquo;</span>
          ) : null}
        </p>
      ) : (
        <p className="text-[11px] text-slate-500">
          Brak rozpoznanego opisu powodu w zapisie linii (sprawdź pole typu / meta po stronie API).
        </p>
      )}
      {rejPhotos.length > 0 ? (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Zdjęcia / dowód ({rejPhotos.length})
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {rejPhotos.map((u, i) => (
              <a key={`${u}-${i}`} href={resolveDamageMediaUrl(u)} target="_blank" rel="noopener noreferrer" className="block shrink-0">
                <img src={resolveDamageMediaUrl(u)} alt="" className="h-12 w-12 rounded-md border border-slate-200 object-cover" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
      {line.processed_at ? (
        <p className="text-[10px] text-slate-500">
          Zapis pozycji: <span className="tabular-nums">{formatWhen(line.processed_at)}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Panel RMZ product row — subtle left stripe + wash (decision scan). */
function rmzLineRowShellClass(tone: "OK" | "DAMAGED" | "REJECTED" | null): string {
  const base =
    "min-w-0 border-b border-gray-200 transition-colors duration-150 ease-in-out last:border-b-0 border-l-4";
  if (tone === "OK") return `${base} border-l-emerald-500/85 bg-white hover:bg-slate-50/90`;
  if (tone === "DAMAGED") return `${base} border-l-amber-500/85 bg-white hover:bg-amber-50/35`;
  if (tone === "REJECTED") return `${base} border-l-rose-500/85 bg-white hover:bg-rose-50/30`;
  return `${base} border-l-transparent bg-white hover:bg-slate-50/80`;
}

function advancedLineToneFromQtys(
  lineQty: number,
  acc: string,
  dmgB: string,
  dmgC: string,
  rej: string,
): "OK" | "DAMAGED" | "REJECTED" | null {
  const a = Math.max(0, parseInt(acc, 10) || 0);
  const db = Math.max(0, parseInt(dmgB, 10) || 0);
  const dc = Math.max(0, parseInt(dmgC, 10) || 0);
  const r = Math.max(0, parseInt(rej, 10) || 0);
  if (a + db + dc + r !== lineQty) return null;
  if (r > 0) return "REJECTED";
  if (db + dc > 0) return "DAMAGED";
  if (a > 0) return "OK";
  return null;
}

function advancedLineToneFromSaved(line: WmsReturnLineRead, lineQty: number): "OK" | "DAMAGED" | "REJECTED" | null {
  const d = line.decision;
  if (d === "OK" || d === "DAMAGED" || d === "REJECTED") return d;
  return advancedLineToneFromQtys(
    lineQty,
    String(line.accepted_qty ?? 0),
    String(line.damaged_b_qty ?? 0),
    String(line.damaged_c_qty ?? 0),
    String(line.rejected_qty ?? 0),
  );
}
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import type { ReturnModuleConfigDto } from "../../types/returnModuleConfig";
import type { ReturnDetailSectionId } from "../../constants/returnModuleDetailSections";
import { normalizeReturnDetailLayout } from "../../utils/returnDetailLayout";
import { PanelDetailEntityHeader } from "../../components/panelDetail/PanelDetailEntityHeader";
import {
  panelDetailAsideColClass,
  panelDetailMainColClass,
  panelDetailMainGridClass,
  panelDetailPageSectionSpacingClass,
} from "../../components/panelDetail/panelDetailLayout";
import { listSellasistToolbarSquareBtn } from "../../components/listPage/listSellasistTokens";
import { renderRmzDetailSection, type RmzDetailSectionRenderCtx } from "./ReturnsReturnDetailSections";

const DETAIL_GROUP_LABELS: Record<ReturnUiMainGroup, string> = {
  NEW: "Nowe zwroty",
  IN_PROGRESS: "W toku",
  DONE: "Zakończone",
};

const KNOWN_SOURCE_LABEL: Record<string, string> = {
  allegro: "Allegro",
  ebay: "eBay",
  amazon: "Amazon",
  empik: "Empik",
  shoper: "Shoper",
  woocommerce: "WooCommerce",
  prestashop: "PrestaShop",
  bricklink: "Bricklink",
};

function normalizeOrderSourceDisplay(raw?: string | null): string {
  const s = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "—";
  const low = s.toLowerCase();
  if (KNOWN_SOURCE_LABEL[low]) return KNOWN_SOURCE_LABEL[low];
  const spaced = s.replace(/([a-z])([A-Z])/g, "$1 $2");
  if (spaced !== s) {
    return spaced
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  if (/[\s_\-]+/.test(s)) {
    return s
      .split(/[\s_\-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(" ");
  }
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(d);
  } catch {
    return "—";
  }
}

function formatMoneyPln(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  try {
    return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(Number(value));
  } catch {
    return `${Number(value).toFixed(2)} PLN`;
  }
}

function parseMoneyInput(raw: string | null | undefined): number | null {
  const t = (raw ?? "").trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseOrderItemUnitPrice(it?: OrderItemRow): number {
  const n = Number(it?.unit_price);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isRmzTerminal(status: ReturnStatusBrief): boolean {
  return status.type === "done_success" || status.type === "done_rejected";
}

/** Polish UI labels (API still uses OK / DAMAGED / REJECTED). */
function decisionLabelPl(d: string | null | undefined): string {
  if (d === "OK") return "Przyjmij";
  if (d === "DAMAGED") return "Uszkodzony";
  if (d === "REJECTED") return "Odrzuć";
  return "—";
}

function refundTypeLabelPl(t: string | null | undefined): string {
  const x = (t ?? "").toUpperCase();
  if (x === "FULL") return "Pełny";
  if (x === "PARTIAL") return "Częściowy";
  if (x === "NONE") return "Brak";
  return t ?? "—";
}

function panelRmzNotesKey(rmzId: number): string {
  return `panel.rmz.notes.${rmzId}`;
}

function panelRmzCommKey(rmzId: number): string {
  return `panel.rmz.comm.${rmzId}`;
}

type CommEntry = { at: string; body: string; who: string };

type OrderItemRow = {
  id: number;
  quantity: number;
  unit_price?: number | null;
  product?: {
    name?: string | null;
    image_url?: string | null;
    ean?: string | null;
    sku?: string | null;
    symbol?: string | null;
  };
};

type OrderDetailLite = {
  id: number;
  items: OrderItemRow[];
  addresses_json?: string | null;
};

function pickImportStr(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/** Best-effort z `Order.addresses_json` (billing / import). */
function bankTransferFromAddressesJson(addressesJson: string | null | undefined): {
  recipientName: string | null;
  bankAccount: string | null;
  address: string | null;
} {
  if (!addressesJson?.trim()) return { recipientName: null, bankAccount: null, address: null };
  try {
    const data = JSON.parse(addressesJson) as Record<string, unknown>;
    const blocks: Record<string, unknown>[] = [];
    for (const key of ["billing", "shipping", "invoice"]) {
      const b = data[key];
      if (b && typeof b === "object") blocks.push(b as Record<string, unknown>);
    }

    let recipientName: string | null = null;
    let bankAccount: string | null = null;
    let address: string | null = null;

    for (const b of blocks) {
      if (!recipientName) {
        recipientName =
          pickImportStr(b, ["Imię i nazwisko", "account_holder", "Nazwa odbiorcy", "company", "Company"]) ||
          (() => {
            const fn = pickImportStr(b, ["Imię", "first_name"]);
            const ln = pickImportStr(b, ["Nazwisko", "last_name"]);
            return fn && ln ? `${fn} ${ln}` : fn || ln || null;
          })();
      }
      if (!bankAccount) {
        bankAccount = pickImportStr(b, [
          "Numer konta",
          "Konto bankowe",
          "IBAN",
          "iban",
          "bank_account",
          "account_number",
          "Nr konta",
        ]);
      }
      if (!address) {
        const street = pickImportStr(b, ["Ulica", "street", "address1"]);
        const zip = pickImportStr(b, ["Kod pocztowy", "postcode", "zip"]);
        const city = pickImportStr(b, ["Miasto", "city"]);
        const parts = [street, zip && city ? `${zip} ${city}` : zip || city].filter(Boolean);
        if (parts.length) address = parts.join(", ");
        else address = pickImportStr(b, ["Adres", "full_address"]);
      }
    }
    return { recipientName, bankAccount, address };
  } catch {
    return { recipientName: null, bankAccount: null, address: null };
  }
}

function triggerTextDownload(filename: string, body: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function firstImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== "string") return null;
  const first = url.trim().split(";").map((s) => s.trim()).find(Boolean);
  return first ? resolveDamageMediaUrl(first) : null;
}

function financialBreakdown(data: WmsReturnRead): {
  total: number;
  products: number;
  shipping: number;
  adjustments: number | null;
} {
  const ref = data.refund;
  const shipBase = Number(data.shipping_cost) || 0;
  let products = 0;
  let shipping = 0;
  if (ref) {
    products = Number(ref.refund_amount) || 0;
    if (ref.refund_shipping) {
      shipping = ref.refund_shipping_amount != null ? Number(ref.refund_shipping_amount) : shipBase;
    }
  }
  const total = products + shipping;
  let adjustments: number | null = null;
  if (ref && ref.refund_type === "FULL" && total === 0) {
    adjustments = null;
  }
  return { total, products, shipping, adjustments };
}

/** Office panel: operational RMZ detail (/orders/returns/:id). WMS grid remains canonical for photos / strict workflow. */
export default function ReturnsReturnDetailPage() {
  const { returnId } = useParams<{ returnId: string }>();
  const rid = Number(returnId);
  const navigate = useNavigate();

  const [data, setData] = useState<WmsReturnRead | null>(null);
  const [orderLite, setOrderLite] = useState<OrderDetailLite | null>(null);
  const [wmsSettings, setWmsSettings] = useState<WmsSettingsRead | null>(null);
  const [panelSummary, setPanelSummary] = useState<ReturnUiStatusPanelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [patchingUi, setPatchingUi] = useState(false);
  const [lineSavingOi, setLineSavingOi] = useState<number | null>(null);
  const [lineErr, setLineErr] = useState<string | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundShipping, setRefundShipping] = useState(false);
  const [refundShippingAmount, setRefundShippingAmount] = useState("");
  const [refundShippingManualEdit, setRefundShippingManualEdit] = useState(false);
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [damagedRefundByKey, setDamagedRefundByKey] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSavedAt, setNotesSavedAt] = useState<number | null>(null);
  const [commDraft, setCommDraft] = useState("");
  const [commEntries, setCommEntries] = useState<CommEntry[]>([]);
  const [moduleCfg, setModuleCfg] = useState<ReturnModuleConfigDto | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<number, WmsReturnFinalizeLineIn>>({});
  const [finalizeSaving, setFinalizeSaving] = useState(false);
  const [finalizeSuccessMsg, setFinalizeSuccessMsg] = useState<string | null>(null);

  const applyLineDraft = useCallback((draft: WmsReturnFinalizeLineIn) => {
    setLineDrafts((prev) => ({ ...prev, [draft.order_item_id]: draft }));
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        lines: prev.lines.map((ln) =>
          ln.order_item_id === draft.order_item_id ? mergeLineReadFromDraft(ln, draft) : ln,
        ),
      };
    });
  }, []);

  useEffect(() => {
    if (!Number.isFinite(rid) || rid <= 0) {
      setData(null);
      setLoading(false);
      setErr("Nieprawidłowy identyfikator zwrotu.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void (async () => {
      try {
        const r = await getWmsReturn(rid, DAMAGE_TENANT_ID);
        if (cancelled) return;
        const wh =
          r.warehouse_id != null && Number.isFinite(Number(r.warehouse_id)) && Number(r.warehouse_id) > 0
            ? Math.floor(Number(r.warehouse_id))
            : undefined;
        const [summary, settings] = await Promise.all([
          getReturnUiStatusSummary(DAMAGE_TENANT_ID, wh),
          getWmsReturnsModeSettings({ tenantId: DAMAGE_TENANT_ID, warehouseId: wh }),
        ]);
        if (cancelled) return;
        setData(r);
        setPanelSummary(summary);
        setWmsSettings(settings);
        const drafts: Record<number, WmsReturnFinalizeLineIn> = {};
        for (const ln of r.lines) {
          if (isRmzLineFullyResolved(ln)) {
            drafts[ln.order_item_id] = finalizeLineFromRead(ln);
          }
        }
        setLineDrafts(drafts);
        try {
          const ord = await api.get<OrderDetailLite>(`/orders/${r.order_id}/`);
          if (!cancelled) setOrderLite(ord.data);
        } catch {
          if (!cancelled) setOrderLite(null);
        }
      } catch {
        if (!cancelled) {
          setErr("Nie udało się wczytać zwrotu.");
          setData(null);
          setPanelSummary(null);
          setWmsSettings(null);
          setOrderLite(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rid]);

  useEffect(() => {
    if (!Number.isFinite(rid) || rid <= 0) return;
    try {
      setNotesDraft(localStorage.getItem(panelRmzNotesKey(rid)) ?? "");
    } catch {
      setNotesDraft("");
    }
    try {
      const raw = localStorage.getItem(panelRmzCommKey(rid));
      if (raw) {
        const parsed = JSON.parse(raw) as CommEntry[];
        setCommEntries(Array.isArray(parsed) ? parsed : []);
      } else {
        setCommEntries([]);
      }
    } catch {
      setCommEntries([]);
    }
    setNotesSavedAt(null);
    setCommDraft("");
  }, [rid]);

  useEffect(() => {
    if (!Number.isFinite(rid) || rid <= 0 || !data) return;
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await getOfficeReturnModuleConfig({
          tenantId: DAMAGE_TENANT_ID,
          warehouseId: data.warehouse_id,
        });
        if (!cancelled) setModuleCfg(cfg);
      } catch {
        if (!cancelled) setModuleCfg(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rid, data?.id, data?.warehouse_id]);

  const itemByOrderItemId = useMemo(() => {
    const m = new Map<number, OrderItemRow>();
    for (const it of orderLite?.items ?? []) m.set(it.id, it);
    return m;
  }, [orderLite]);

  const refundProposal = useMemo(() => {
    if (!data) {
      return { acceptedValue: 0, damagedValue: 0, productsValue: 0, unresolvedDamagedBlocks: 0 };
    }
    let acceptedValue = 0;
    let damagedValue = 0;
    let unresolvedDamagedBlocks = 0;
    for (const ln of data.lines) {
      const it = itemByOrderItemId.get(ln.order_item_id);
      const unit = parseOrderItemUnitPrice(it);
      const acceptedQty = Math.max(0, Number(ln.accepted_qty) || 0);
      acceptedValue += acceptedQty * unit;
      const db = Math.max(0, Number(ln.damaged_b_qty) || 0);
      const dc = Math.max(0, Number(ln.damaged_c_qty) || 0);
      if (db > 0) {
        const key = `${ln.order_item_id}:B`;
        const v = parseMoneyInput(damagedRefundByKey[key]);
        if (v == null) unresolvedDamagedBlocks += 1;
        else damagedValue += v;
      }
      if (dc > 0) {
        const key = `${ln.order_item_id}:C`;
        const v = parseMoneyInput(damagedRefundByKey[key]);
        if (v == null) unresolvedDamagedBlocks += 1;
        else damagedValue += v;
      }
    }
    return {
      acceptedValue,
      damagedValue,
      productsValue: acceptedValue + damagedValue,
      unresolvedDamagedBlocks,
    };
  }, [data, itemByOrderItemId, damagedRefundByKey]);

  const bankTransfer = useMemo(
    () => bankTransferFromAddressesJson(orderLite?.addresses_json),
    [orderLite?.addresses_json],
  );

  const activityEntries = useMemo(() => {
    if (!data) return [];
    const rows: { at: string; msg: string }[] = [];
    if (data.created_at) {
      rows.push({ at: data.created_at, msg: "Utworzono dokument RMZ" });
    }
    for (const ln of data.lines) {
      if (ln.processed_at) {
        rows.push({
          at: ln.processed_at,
          msg: `Pozycja #${ln.order_item_id}: ${decisionLabelPl(ln.decision)}`,
        });
      }
    }
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [data]);

  const panelCorrectionFileRaw = useMemo(() => {
    try {
      const v = localStorage.getItem(`panel.rmz.correctionFile.${rid}`);
      return v != null && v !== "" ? v : null;
    } catch {
      return null;
    }
  }, [rid]);

  const fi = data ? financialBreakdown(data) : null;

  const partition = useMemo(() => {
    const n = normalizeReturnDetailLayout(moduleCfg?.detail_layout);
    return { left: n.left, right: n.right };
  }, [moduleCfg?.detail_layout]);

  const allLinesReady = useMemo(() => {
    if (!data) return false;
    return (
      data.lines.length > 0 &&
      data.lines.every((ln) => {
        const draft = lineDrafts[ln.order_item_id];
        return draft != null && isFinalizeLineComplete(draft, Number(ln.quantity) || 0);
      }) &&
      refundProposal.unresolvedDamagedBlocks === 0
    );
  }, [data, lineDrafts, refundProposal.unresolvedDamagedBlocks]);

  const runFinalizeReturn = useCallback(
    async (refundOpts?: {
      refundShipping: boolean;
      refundShippingAmount: number;
      productsValue: number;
    }) => {
      if (!data || finalizeSaving) return;
      const whId = data.warehouse_id;
      const lines = data.lines.map((ln) => {
        const draft = lineDrafts[ln.order_item_id];
        if (!draft) throw new Error("Brak draftu linii");
        return draft;
      });
      const enableRefund = Boolean(wmsSettings?.enable_refund);
      const shipAmt = refundOpts?.refundShipping ? refundOpts.refundShippingAmount : 0;
      const amt = refundOpts?.productsValue ?? refundProposal.productsValue;
      setFinalizeSaving(true);
      setErr(null);
      setLineErr(null);
      try {
        const updated = await finalizeWmsReturn(
          rid,
          DAMAGE_TENANT_ID,
          {
            lines,
            process_refund: enableRefund,
            refund: enableRefund
              ? {
                  refund_type: amt > 0 || shipAmt > 0 ? "PARTIAL" : "NONE",
                  refund_amount: Number.isFinite(amt) && amt > 0 ? amt : null,
                  refund_shipping: Boolean(refundOpts?.refundShipping),
                  refund_shipping_amount: shipAmt > 0 ? shipAmt : null,
                  decided_by: "panel",
                }
              : null,
          },
          whId != null && Number.isFinite(Number(whId)) ? Number(whId) : null,
        );
        setData(updated);
        const docNo = (updated.warehouse_document_number || "").trim();
        setFinalizeSuccessMsg(
          docNo ? `Zwrot zakończony. Utworzono dokument ${docNo}` : "Zwrot zakończony",
        );
        setRefundOpen(false);
      } catch (e: unknown) {
        const msg =
          e && typeof e === "object" && "response" in e && e.response && typeof e.response === "object" && "data" in e.response && e.response.data && typeof e.response.data === "object" && "detail" in e.response.data
            ? String((e.response as { data: { detail?: string } }).data.detail)
            : "Nie udało się sfinalizować zwrotu.";
        setErr(msg);
      } finally {
        setFinalizeSaving(false);
      }
    },
    [data, finalizeSaving, lineDrafts, refundProposal.productsValue, rid, wmsSettings?.enable_refund],
  );

  if (loading) {
    return (
      <div className="flex min-h-[30vh] items-center gap-2 text-sm text-slate-500">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
        Ładowanie…
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-red-700">{err ?? "Brak danych."}</p>
        <button
          type="button"
          className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
          onClick={() => navigate("/orders/returns")}
        >
          ← Powrót do listy zwrotów
        </button>
      </div>
    );
  }

  const refund = data.refund;
  const orderDeliveryAmount = Math.max(0, Number(data.shipping_cost) || 0);
  const terminal = isRmzTerminal(data.status) || data.warehouse_document_id != null;
  const rel = formatRelativeAgo(data.created_at);
  const cust = [data.first_name?.trim(), data.last_name?.trim()].filter(Boolean).join(" ") || "—";
  const srcDisp = normalizeOrderSourceDisplay(data.source);
  const salesDocRaw = (data.sales_document_number ?? "").trim();
  const bankRecipient = bankTransfer.recipientName?.trim() || cust;

  const linesSection = (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm ring-1 ring-slate-900/5">
      <header className="border-b border-slate-200 bg-slate-50/80 px-3 py-2.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-800">Produkty w zwrocie</h2>
            <p className="mt-0.5 text-[11px] text-slate-600">
              Rozstrzygnij pozycje lokalnie, potem zapisz cały zwrot jednym krokiem (Z-PZ + status).
            </p>
          </div>
          {!terminal && allLinesReady ? (
            <button
              type="button"
              disabled={finalizeSaving}
              onClick={() => {
                if (wmsSettings?.enable_refund) {
                  openRefundModal();
                } else {
                  void runFinalizeReturn();
                }
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {finalizeSaving ? "Zapisywanie…" : "Zapisz zwrot"}
            </button>
          ) : null}
        </div>
      </header>
      {lineErr ? <div className="border-b border-gray-200 bg-red-50 px-3 py-1.5 text-sm text-red-800">{lineErr}</div> : null}
      <div>
        {data.lines.map((ln, rowIdx) => (
          (() => {
            const keyB = `${ln.order_item_id}:B`;
            const keyC = `${ln.order_item_id}:C`;
            return (
          <LineOperationsCard
            key={ln.id != null && Number(ln.id) > 0 ? `rmzl-${ln.id}` : `ln-oi-${ln.order_item_id}-r${rowIdx}`}
            line={ln}
            orderItem={itemByOrderItemId.get(ln.order_item_id)}
            terminal={terminal}
            saving={lineSavingOi === ln.order_item_id}
            wmsSettings={wmsSettings}
            warehouseId={data.warehouse_id}
            returnType={data.return_type ?? "RMA"}
            setLineErr={setLineErr}
            onSaveSimple={async (payload) => {
              setLineErr(null);
              setLineSavingOi(ln.order_item_id);
              try {
                const lineQty = Math.max(1, Math.floor(Number(ln.quantity) || 1));
                applyLineDraft(finalizeLineFromProcess(ln.order_item_id, ln.product_id, lineQty, payload));
              } finally {
                setLineSavingOi(null);
              }
            }}
            onSaveSplit={async (payload) => {
              setLineErr(null);
              setLineSavingOi(ln.order_item_id);
              try {
                applyLineDraft(finalizeLineFromSplit(ln.order_item_id, payload));
              } finally {
                setLineSavingOi(null);
              }
            }}
            damagedRefundB={damagedRefundByKey[keyB] ?? ""}
            damagedRefundC={damagedRefundByKey[keyC] ?? ""}
            onChangeDamagedRefundB={(val) => setDamagedRefundByKey((prev) => ({ ...prev, [keyB]: val }))}
            onChangeDamagedRefundC={(val) => setDamagedRefundByKey((prev) => ({ ...prev, [keyC]: val }))}
          />
            );
          })()
        ))}
      </div>
    </div>
  );

  const openRefundModal = () => {
    setErr(null);
    setRefundOpen(true);
    setRefundAmount(refund?.refund_amount != null ? String(refund.refund_amount) : String(refundProposal.productsValue.toFixed(2)));
    const hasExistingShipping = !!refund?.refund_shipping;
    const defaultShipping = refund?.refund_shipping_amount != null
      ? Math.max(0, Number(refund.refund_shipping_amount) || 0)
      : orderDeliveryAmount;
    setRefundShipping(hasExistingShipping || defaultShipping > 0);
    setRefundShippingAmount(defaultShipping > 0 ? String(defaultShipping.toFixed(2)) : "0");
    setRefundShippingManualEdit(false);
  };

  const sectionCtx: RmzDetailSectionRenderCtx = {
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
    detailGroupLabels: DETAIL_GROUP_LABELS,
    linesSection,
  };

  return (
    <>
      <nav className="mb-2.5 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Ścieżka nawigacji">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 font-medium text-slate-500 transition hover:text-slate-800"
          aria-label="Panel"
        >
          <Home className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
        <Link to="/orders/list" className="font-medium text-slate-500 transition hover:text-slate-800">
          Zamówienia
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
        <Link to="/orders/returns" className="font-medium text-slate-500 transition hover:text-slate-800">
          Zwroty
        </Link>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
        <span className="font-medium text-slate-600">{data.rmz_number}</span>
      </nav>

      <div className={panelDetailPageSectionSpacingClass}>
        {err ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
        ) : null}
        {finalizeSuccessMsg ? (
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900">
            {finalizeSuccessMsg}
          </div>
        ) : null}

        <PanelDetailEntityHeader
          title={<>Zwrot {data.rmz_number}</>}
          status={data.ui_status ?? null}
          meta={
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-slate-500">
              <span>
                {formatWhen(data.created_at)}
                {rel ? <span className="text-slate-400"> · {rel}</span> : null}
              </span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span className="font-medium text-slate-700">{cust}</span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>{srcDisp === "—" ? "Źródło —" : `Źródło: ${srcDisp}`}</span>
              <span className="text-slate-300" aria-hidden>
                ·
              </span>
              <span>
                Zamówienie{" "}
                <Link to={`/orders/${data.order_id}`} className="font-medium text-slate-600 hover:text-slate-900 hover:underline">
                  #{data.order_id}
                </Link>
              </span>
              {data.warehouse_document_id != null && data.warehouse_document_number ? (
                <>
                  <span className="text-slate-300" aria-hidden>
                    ·
                  </span>
                  <Link
                    to={WMS_ROUTES.putawayPz(data.warehouse_document_id)}
                    className="font-medium text-[#41546a] hover:underline"
                  >
                    {data.warehouse_document_number}
                  </Link>
                </>
              ) : null}
            </p>
          }
          actions={
            <>
              <Link
                to="/orders/returns"
                className={listSellasistToolbarSquareBtn}
                title="Lista zwrotów"
                aria-label="Lista zwrotów"
              >
                <List className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              </Link>
              <Link
                to={WMS_ROUTES.returnsProcess(data.id)}
                className="inline-flex h-10 shrink-0 items-center rounded-md border border-slate-800 bg-slate-900 px-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Terminal WMS
              </Link>
            </>
          }
        />

        {terminal ? (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
            Zwrot zakończony w WMS — edycja decyzji pozycji jest zablokowana.
          </p>
        ) : null}

        <div className={`${panelDetailMainGridClass} mt-5`}>
          <div className={`${panelDetailMainColClass} flex min-w-0 flex-col gap-4`}>
            {partition.left.map((sid) => (
              <Fragment key={sid}>{renderRmzDetailSection(sid as ReturnDetailSectionId, sectionCtx)}</Fragment>
            ))}
          </div>
          <aside
            className={`${panelDetailAsideColClass} flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start`}
          >
            {partition.right.map((sid) => (
              <Fragment key={sid}>{renderRmzDetailSection(sid as ReturnDetailSectionId, sectionCtx)}</Fragment>
            ))}
          </aside>
        </div>
      </div>

      {refundOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
        >
          <div className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Zapis zwrotu</h3>
            <p className="mt-1 text-sm text-gray-600">System wylicza propozycję z decyzji WMS; korekta dotyczy tylko uszkodzeń.</p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p>Przyjęte (auto): <span className="font-semibold tabular-nums">{formatMoneyPln(refundProposal.acceptedValue)}</span></p>
              <p>Uszkodzone (operator): <span className="font-semibold tabular-nums">{formatMoneyPln(refundProposal.damagedValue)}</span></p>
              <p>Odrzucone: <span className="font-semibold tabular-nums">0,00 PLN</span></p>
              <p>Dostawa: <span className="font-semibold tabular-nums">{refundShipping ? formatMoneyPln(parseMoneyInput(refundShippingAmount) ?? 0) : "0,00 PLN"}</span></p>
              <p className="mt-1 border-t border-slate-200 pt-1">
                Łącznie: <span className="font-semibold tabular-nums">{formatMoneyPln(refundProposal.productsValue + (refundShipping ? (parseMoneyInput(refundShippingAmount) ?? 0) : 0))}</span>
              </p>
            </div>
            {refundProposal.unresolvedDamagedBlocks > 0 ? (
              <p className="mt-2 text-xs font-semibold text-amber-700">
                Uzupełnij kwoty dla uszkodzeń ({refundProposal.unresolvedDamagedBlocks}) przed zapisem refundacji.
              </p>
            ) : null}
            <label className="mt-4 block text-sm">
              <span className="text-gray-600">Kwota produktów (PLN, auto)</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={refundProposal.productsValue.toFixed(2)}
                disabled
                className="mt-1 w-full rounded-lg border border-gray-200 bg-slate-100 px-3 py-2 text-sm text-slate-700"
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={refundShipping}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setRefundShipping(checked);
                  if (!checked) {
                    setRefundShippingAmount("0");
                    setRefundShippingManualEdit(false);
                  } else {
                    setRefundShippingAmount(orderDeliveryAmount > 0 ? String(orderDeliveryAmount.toFixed(2)) : "0");
                    setRefundShippingManualEdit(false);
                  }
                }}
              />
              <span>Zwrot kosztu dostawy</span>
            </label>
            {refundShipping ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <p className="text-slate-600">
                  Dostawa z zamówienia: <span className="font-semibold tabular-nums text-slate-800">{formatMoneyPln(orderDeliveryAmount)}</span>
                </p>
                {!refundShippingManualEdit ? (
                  <button
                    type="button"
                    className="mt-2 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setRefundShippingManualEdit(true)}
                  >
                    Edytuj ręcznie
                  </button>
                ) : (
                  <label className="mt-2 block text-sm">
                    <span className="text-gray-600">Kwota dostawy (PLN)</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={refundShippingAmount}
                      onChange={(e) => setRefundShippingAmount(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      className="mt-2 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      onClick={() => {
                        setRefundShippingAmount(orderDeliveryAmount > 0 ? String(orderDeliveryAmount.toFixed(2)) : "0");
                        setRefundShippingManualEdit(false);
                      }}
                    >
                      Użyj kwoty z zamówienia
                    </button>
                  </label>
                )}
              </div>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border px-4 py-2 text-sm"
                onClick={() => setRefundOpen(false)}
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={refundSubmitting || refundProposal.unresolvedDamagedBlocks > 0}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={() => {
                  void (async () => {
                    setRefundSubmitting(true);
                    setErr(null);
                    try {
                      const amt = refundProposal.productsValue;
                      const shipAmt = refundShipping ? parseFloat(refundShippingAmount.replace(",", ".")) : 0;
                      await runFinalizeReturn({
                        productsValue: amt,
                        refundShipping,
                        refundShippingAmount: Number.isFinite(shipAmt) ? shipAmt : 0,
                      });
                    } finally {
                      setRefundSubmitting(false);
                    }
                  })();
                }}
              >
                {refundSubmitting ? "Zapisywanie…" : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function LineOperationsCard({
  line,
  orderItem,
  terminal,
  saving,
  wmsSettings,
  warehouseId,
  returnType,
  setLineErr,
  onSaveSimple,
  onSaveSplit,
  damagedRefundB,
  damagedRefundC,
  onChangeDamagedRefundB,
  onChangeDamagedRefundC,
}: {
  line: WmsReturnLineRead;
  orderItem?: OrderItemRow;
  terminal: boolean;
  saving: boolean;
  wmsSettings: WmsSettingsRead | null;
  warehouseId: number;
  returnType: "RMA" | "UNCLAIMED";
  setLineErr: Dispatch<SetStateAction<string | null>>;
  onSaveSimple: (p: import("../../types/wmsReturn").WmsReturnLineProcess) => Promise<void>;
  onSaveSplit: (p: import("../../types/wmsReturn").WmsReturnLineSplitProcess) => Promise<void>;
  damagedRefundB: string;
  damagedRefundC: string;
  onChangeDamagedRefundB: (value: string) => void;
  onChangeDamagedRefundC: (value: string) => void;
}) {
  const name = orderItem?.product?.name ?? `Produkt #${line.product_id}`;
  const img = firstImageUrl(orderItem?.product?.image_url ?? null);
  const unit = orderItem?.unit_price != null ? Number(orderItem.unit_price) : null;
  const lineQty = Number(line.quantity) || 0;
  const extPrice = unit != null && Number.isFinite(unit) ? unit * lineQty : null;
  const skuMain = orderItem?.product?.sku || orderItem?.product?.symbol || "—";
  const ean = orderItem?.product?.ean?.trim();

  const photoInputRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<null | "damage" | "reject">(null);
  const [damageClass, setDamageClass] = useState<"B" | "C">("C");
  const [damageTypeIds, setDamageTypeIds] = useState<string[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [noteDamage, setNoteDamage] = useState("");
  const [rejectReasonId, setRejectReasonId] = useState("");
  const [rejectOtherText, setRejectOtherText] = useState("");
  const [noteReject, setNoteReject] = useState("");
  const [localSheetErr, setLocalSheetErr] = useState<string | null>(null);
  const [sheetSaving, setSheetSaving] = useState(false);

  const [acc, setAcc] = useState(String(line.accepted_qty ?? 0));
  const [dmgB, setDmgB] = useState(String(line.damaged_b_qty ?? 0));
  const [dmgC, setDmgC] = useState(String(line.damaged_c_qty ?? 0));
  const [rej, setRej] = useState(String(line.rejected_qty ?? 0));
  /** Natychmiastowy feedback po „Przyjęte” zanim wróci odpowiedź API. */
  const [optimisticDecision, setOptimisticDecision] = useState<"OK" | "DAMAGED" | "REJECTED" | null>(null);
  const [lineSaveToast, setLineSaveToast] = useState<string | null>(null);

  useEffect(() => {
    setAcc(String(line.accepted_qty ?? 0));
    setDmgB(String(line.damaged_b_qty ?? 0));
    setDmgC(String(line.damaged_c_qty ?? 0));
    setRej(String(line.rejected_qty ?? 0));
  }, [line]);

  useEffect(() => {
    if (optimisticDecision != null && line.decision === optimisticDecision) {
      setOptimisticDecision(null);
    }
  }, [line.decision, optimisticDecision]);

  useEffect(() => {
    if (!lineSaveToast) return;
    const t = window.setTimeout(() => setLineSaveToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [lineSaveToast]);

  const multiQty = lineQty > 1;

  const decodedDamageIds = useMemo(() => decodeRmzDamageTypePayload(line.damage_type), [line.damage_type]);
  const damageReasonLabelsB = useMemo(
    () => decodedDamageIds.filter((id) => id.startsWith("b_")).map((id) => rmzDamageTypeLabel(id)),
    [decodedDamageIds],
  );
  const lineForShell = useMemo(
    () => (optimisticDecision ? { ...line, decision: optimisticDecision } : line),
    [line, optimisticDecision],
  );

  const damageReasonLabelsC = useMemo(
    () => decodedDamageIds.filter((id) => id.startsWith("c_")).map((id) => rmzDamageTypeLabel(id)),
    [decodedDamageIds],
  );

  const wmsLineGalleryUrls = useMemo(() => {
    const raw = line.photo_urls;
    if (!Array.isArray(raw)) return [];
    return [...new Set(raw.map((u) => String(u).trim()).filter(Boolean))];
  }, [line.photo_urls]);

  const rowTone = useMemo((): "OK" | "DAMAGED" | "REJECTED" | null => {
    if (multiQty) {
      if (line.processed_at) return advancedLineToneFromSaved(lineForShell, lineQty);
      return advancedLineToneFromQtys(lineQty, acc, dmgB, dmgC, rej);
    }
    return (optimisticDecision ?? line.decision) ?? null;
  }, [multiQty, line, lineForShell, lineQty, acc, dmgB, dmgC, rej, optimisticDecision]);

  const splitParsed = useMemo(() => {
    const a = Math.max(0, parseInt(acc, 10) || 0);
    const db = Math.max(0, parseInt(dmgB, 10) || 0);
    const dc = Math.max(0, parseInt(dmgC, 10) || 0);
    const r = Math.max(0, parseInt(rej, 10) || 0);
    return { a, db, dc, r, sum: a + db + dc + r };
  }, [acc, dmgB, dmgC, rej]);

  const persistedDamageEntries = useMemo(
    () => (Array.isArray(line.damage_entries) ? line.damage_entries : []),
    [line.damage_entries],
  );
  const hasPersistedDamageEntries = persistedDamageEntries.length > 0;
  const damageEntriesB = useMemo(
    () => persistedDamageEntries.filter((e) => e.condition === "B"),
    [persistedDamageEntries],
  );
  const damageEntriesC = useMemo(
    () => persistedDamageEntries.filter((e) => e.condition === "C"),
    [persistedDamageEntries],
  );
  const rejectedEvidenceUnits = useMemo(() => {
    if (multiQty) return Math.max(splitParsed.r, line.rejected_qty ?? 0);
    if (line.decision === "REJECTED") return Math.max(line.rejected_qty ?? 0, lineQty);
    return 0;
  }, [multiQty, splitParsed.r, line.rejected_qty, line.decision, lineQty]);
  const activeAccepted = splitParsed.a > 0;
  const activeDamageB = splitParsed.db > 0;
  const activeDamageC = splitParsed.dc > 0;
  const activeRejected = splitParsed.r > 0;
  const lineFinancialResolved =
    (!activeDamageB || parseMoneyInput(damagedRefundB) != null) &&
    (!activeDamageC || parseMoneyInput(damagedRefundC) != null);

  const rowShellClass = rmzLineRowShellClass(rowTone);

  const disable = terminal || saving;
  /** Po sfinalizowaniu RMZ (Z-PZ) — tylko podgląd. */
  const splitInputsLocked = multiQty && terminal;
  const btnOnOk = "bg-emerald-600 text-white ring-1 ring-emerald-700";
  const btnOnDmg = "bg-amber-600 text-white ring-1 ring-amber-700";
  const btnOnRej = "bg-red-600 text-white ring-1 ring-red-700";
  const btnOff = "border border-slate-200 bg-slate-100 text-slate-500";

  const skuAndEan =
    `${skuMain}${ean ? ` · EAN ${ean}` : ""}`.trim();

  const PANEL_RMZ_MAX_PHOTOS = 15;

  const closeSheet = () => {
    if (sheetSaving) return;
    setSheet(null);
    setLocalSheetErr(null);
  };

  const openDamageSheet = () => {
    setLocalSheetErr(null);
    const cls: "B" | "C" = line.condition === "B" ? "B" : "C";
    setDamageClass(cls);
    const decoded = decodeRmzDamageTypePayload(line.damage_type);
    setDamageTypeIds(filterRmzDamageTypeIdsForClass(cls, decoded));
    const pu = line.photo_urls;
    setPhotoUrls(Array.isArray(pu) ? [...pu] : []);
    setNoteDamage("");
    setSheet("damage");
  };

  const openRejectSheet = () => {
    setLocalSheetErr(null);
    setRejectReasonId("");
    setRejectOtherText("");
    setNoteReject("");
    setSheet("reject");
  };

  const saveDamageSheet = async () => {
    setLocalSheetErr(null);
    if (!Number.isFinite(warehouseId) || warehouseId < 1) {
      setLocalSheetErr("Brak magazynu dla zapisu — odśwież stronę.");
      return;
    }
    const types = filterRmzDamageTypeIdsForClass(damageClass, damageTypeIds);
    if (types.length < 1) {
      setLocalSheetErr("Wybierz co najmniej jeden typ uszkodzenia.");
      return;
    }
    const rawUrls = photoUrls.map((u) => coercePhotoUrlForDamageEntry(u)).filter((x): x is string => x != null);
    const urls = [...new Set(rawUrls)].slice(0, PANEL_RMZ_MAX_PHOTOS);
    if (wmsSettings?.require_photos && urls.length < 1) {
      setLocalSheetErr("Dodaj co najmniej jedno zdjęcie uszkodzenia.");
      return;
    }
    const encoded = encodeRmzDamageTypePayload(types) || "other";
    setSheetSaving(true);
    try {
      if (urls.length > 0) {
        await createDamageEntry({
          tenant_id: DAMAGE_TENANT_ID,
          warehouse_id: warehouseId,
          product_id: line.product_id,
          quantity: Math.max(1, lineQty),
          photo_urls: urls,
          damage_type: encoded,
        });
      }
      await onSaveSimple({
        decision: "DAMAGED",
        condition: damageClass,
        photo_urls: urls.length ? urls : undefined,
        damage_type: encoded,
        ...(noteDamage.trim() ? { note: noteDamage.trim() } : {}),
      });
      setSheet(null);
    } catch {
      setLocalSheetErr("Nie udało się zapisać. Sprawdź dane i spróbuj ponownie.");
    } finally {
      setSheetSaving(false);
    }
  };

  const saveRejectSheet = async () => {
    setLocalSheetErr(null);
    const rid = rejectReasonId.trim();
    if (!rid) {
      setLocalSheetErr("Wybierz powód odrzucenia.");
      return;
    }
    if (rid === WMS_REJECT_OTHER_ID && !rejectOtherText.trim()) {
      setLocalSheetErr("Uzupełnij uzasadnienie (wymagane przy „Inny powód”).");
      return;
    }
    setSheetSaving(true);
    try {
      await onSaveSimple({
        decision: "REJECTED",
        damage_type: rid,
        ...(rid === WMS_REJECT_OTHER_ID
          ? { note: rejectOtherText.trim() }
          : noteReject.trim()
            ? { note: noteReject.trim() }
            : {}),
      });
      setSheet(null);
    } catch {
      setLocalSheetErr("Nie udało się zapisać odrzucenia.");
    } finally {
      setSheetSaving(false);
    }
  };

  const onPickDamagePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setLocalSheetErr(null);
    setPhotoUploading(true);
    try {
      const next: string[] = [...photoUrls];
      for (let i = 0; i < files.length; i += 1) {
        if (next.length >= PANEL_RMZ_MAX_PHOTOS) break;
        const f = files.item(i);
        if (!f) continue;
        const url = await uploadDamageImageFile(f);
        next.push(url);
      }
      setPhotoUrls([...new Set(next)].slice(0, PANEL_RMZ_MAX_PHOTOS));
    } catch {
      setLocalSheetErr("Nie udało się wgrać zdjęcia.");
    } finally {
      setPhotoUploading(false);
    }
  };

  const imageCell = (
    <div className="flex h-full w-[72px] shrink-0 items-center justify-center">
      {img ? (
        <img
          src={img}
          alt=""
          className="h-[68px] w-[68px] max-h-[72px] max-w-[72px] rounded border border-gray-100 bg-white object-contain sm:h-[72px] sm:w-[72px]"
        />
      ) : (
        <div className="flex h-[68px] w-[68px] max-h-[72px] max-w-[72px] items-center justify-center rounded border border-gray-100 bg-gray-100 text-xs text-gray-400 sm:h-[72px] sm:w-[72px]">
          —
        </div>
      )}
    </div>
  );

  const acceptedChosen = line.decision === "OK" || optimisticDecision === "OK";

  return (
    <div className={`${rowShellClass} relative`}>
      {lineSaveToast ? (
        <div
          className="pointer-events-none absolute right-3 top-2 z-30 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 shadow-sm"
          role="status"
        >
          {lineSaveToast}
        </div>
      ) : null}
      <div className="min-w-0 px-3 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            {imageCell}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold leading-snug text-gray-900">{name}</p>
              <p className="mt-0.5 text-xs text-gray-600">
                SKU {skuAndEan}
                <span className="mx-1.5 text-gray-300">·</span>
                <span className="font-semibold tabular-nums text-gray-900">{lineQty} szt.</span>
                {unit != null ? (
                  <>
                    <span className="mx-1.5 text-gray-300">·</span>
                    <span className="tabular-nums text-gray-600">{formatMoneyPln(unit)}</span>
                    {extPrice != null ? (
                      <span className="tabular-nums text-gray-800">
                        {" "}
                        → <span className="font-semibold">{formatMoneyPln(extPrice)}</span>
                      </span>
                    ) : null}
                  </>
                ) : null}
              </p>
            </div>
          </div>
          {!multiQty ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                disabled={disable}
                onClick={() => {
                  if (disable) return;
                  setOptimisticDecision("OK");
                  void (async () => {
                    try {
                      await onSaveSimple({ decision: "OK" });
                      setLineSaveToast("Zapisano");
                    } catch {
                      setOptimisticDecision(null);
                      /* błąd w pasie nad listą */
                    }
                  })();
                }}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${acceptedChosen ? btnOnOk : btnOff}`}
              >
                {acceptedChosen ? "✓ PRZYJĘTY" : "Przyjęte"}
              </button>
              <button
                type="button"
                disabled={disable}
                onClick={openDamageSheet}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${line.decision === "DAMAGED" ? btnOnDmg : btnOff}`}
              >
                Uszkodzone
              </button>
              {returnType !== "UNCLAIMED" ? (
                <button
                  type="button"
                  disabled={disable}
                  onClick={openRejectSheet}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${line.decision === "REJECTED" ? btnOnRej : btnOff}`}
                >
                  Odrzucone
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        {!multiQty && hasPersistedDamageEntries ? (
          <div className="mt-3 space-y-2 border-t border-slate-200/90 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Uszkodzenia — zapis operacyjny</p>
            {persistedDamageEntries.map((ent, i) => (
              <DamageEntryEvidenceCard key={`${ent.id}-sq-${i}`} ent={ent} />
            ))}
          </div>
        ) : null}
        {!multiQty && line.decision === "DAMAGED" && !hasPersistedDamageEntries && decodedDamageIds.length > 0 ? (
          <div className="mt-3 border-t border-slate-200/90 pt-3">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-600">Powody (zapis zbiorczy)</p>
            <ul className="mt-1 list-inside list-disc text-xs text-slate-700">
              {decodedDamageIds.map((id) => (
                <li key={id}>{rmzDamageTypeLabel(id)}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {!multiQty && rejectedEvidenceUnits > 0 ? (
          <div className="mt-2 border-t border-slate-200/90 pt-3">
            <RejectionEvidencePanel line={line} rejectedUnits={rejectedEvidenceUnits} />
          </div>
        ) : null}

        {multiQty ? (
          <div className="mt-4 space-y-3 border-t border-dashed border-gray-200 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Rozdzielenie ilości</span>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-800">
                Łącznie na linii: {lineQty} szt.
              </span>
              {splitInputsLocked ? (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
                    Operacyjnie rozliczona
                  </span>
                  {lineFinancialResolved ? (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                      Finansowo rozliczona
                    </span>
                  ) : (
                    <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                      Finansowo: do wyceny uszkodzeń
                    </span>
                  )}
                </div>
              ) : null}
            </div>

            <div className="space-y-2 sm:ml-[84px]">
              {/* Przyjęte */}
              {activeAccepted ? (
              <div className="rounded-lg border border-gray-200 border-l-4 border-l-emerald-500 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                        ✓ Przyjęte
                      </span>
                      <span className="text-xs text-gray-500">→ odłożenie / restock</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold tabular-nums text-slate-700">
                      Zwrot auto: {formatMoneyPln(splitParsed.a * (unit ?? 0))}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <input
                      type="number"
                      min={0}
                      max={lineQty}
                      value={acc}
                      disabled={disable || splitInputsLocked}
                      onChange={(e) => setAcc(e.target.value)}
                      className="[&::-webkit-inner-spin-button]:appearance-none w-16 rounded-md border border-gray-200 px-2 py-1.5 text-center text-sm tabular-nums disabled:bg-gray-50"
                      aria-label="Ilość przyjęta"
                    />
                    <span className="text-xs font-medium text-gray-600">szt.</span>
                  </label>
                </div>
              </div>
              ) : null}

              {/* Uszkodzone klasa B */}
              {activeDamageB ? (
              <div className="rounded-lg border border-gray-200 border-l-4 border-l-amber-500 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-amber-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                        ⚠ Uszkodzone — klasa B
                      </span>
                      <span className="text-xs text-gray-600">→ outlet / upłynnienie</span>
                    </div>
                    {!hasPersistedDamageEntries &&
                    damageReasonLabelsB.length > 0 &&
                    (splitParsed.db > 0 || splitInputsLocked) ? (
                      <ul className="mt-2 list-inside list-disc text-xs text-gray-700">
                        {damageReasonLabelsB.map((label, i) => (
                          <li key={`b-${i}-${label}`}>{label}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <input
                      type="number"
                      min={0}
                      max={lineQty}
                      value={dmgB}
                      disabled={disable || splitInputsLocked}
                      onChange={(e) => setDmgB(e.target.value)}
                      className="[&::-webkit-inner-spin-button]:appearance-none w-16 rounded-md border border-amber-200 bg-white px-2 py-1.5 text-center text-sm tabular-nums disabled:bg-slate-50"
                      aria-label="Ilość uszkodzona klasa B"
                    />
                    <span className="text-xs font-medium text-gray-600">szt.</span>
                  </label>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                  <span className="font-semibold uppercase tracking-wide text-slate-500">Kwota operatora</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={damagedRefundB}
                    onChange={(e) => onChangeDamagedRefundB(e.target.value)}
                    className="w-32 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums"
                    placeholder="0,00"
                    aria-label="Kwota zwrotu dla uszkodzeń klasy B"
                  />
                  <span className="text-slate-500">PLN</span>
                </div>
                {damageEntriesB.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-dashed border-slate-200/90 pt-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Zapisane uszkodzenia (klasa B)
                    </p>
                    {damageEntriesB.map((ent, i) => (
                      <DamageEntryEvidenceCard key={`${ent.id}-b-${i}`} ent={ent} />
                    ))}
                  </div>
                ) : null}
              </div>
              ) : null}

              {/* Uszkodzone klasa C */}
              {activeDamageC ? (
              <div className="rounded-lg border border-gray-200 border-l-4 border-l-orange-600 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-orange-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                        ⚠ Uszkodzone — klasa C
                      </span>
                      <span className="text-xs text-gray-600">→ naprawa / utylizacja</span>
                    </div>
                    {!hasPersistedDamageEntries &&
                    damageReasonLabelsC.length > 0 &&
                    (splitParsed.dc > 0 || splitInputsLocked) ? (
                      <ul className="mt-2 list-inside list-disc text-xs text-gray-700">
                        {damageReasonLabelsC.map((label, i) => (
                          <li key={`c-${i}-${label}`}>{label}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <input
                      type="number"
                      min={0}
                      max={lineQty}
                      value={dmgC}
                      disabled={disable || splitInputsLocked}
                      onChange={(e) => setDmgC(e.target.value)}
                      className="[&::-webkit-inner-spin-button]:appearance-none w-16 rounded-md border border-orange-200 bg-white px-2 py-1.5 text-center text-sm tabular-nums disabled:bg-slate-50"
                      aria-label="Ilość uszkodzona klasa C"
                    />
                    <span className="text-xs font-medium text-gray-600">szt.</span>
                  </label>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-700">
                  <span className="font-semibold uppercase tracking-wide text-slate-500">Kwota operatora</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={damagedRefundC}
                    onChange={(e) => onChangeDamagedRefundC(e.target.value)}
                    className="w-32 rounded-md border border-slate-200 bg-white px-2 py-1 text-right text-sm tabular-nums"
                    placeholder="0,00"
                    aria-label="Kwota zwrotu dla uszkodzeń klasy C"
                  />
                  <span className="text-slate-500">PLN</span>
                </div>
                {damageEntriesC.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-dashed border-slate-200/90 pt-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                      Zapisane uszkodzenia (klasa C)
                    </p>
                    {damageEntriesC.map((ent, i) => (
                      <DamageEntryEvidenceCard key={`${ent.id}-c-${i}`} ent={ent} />
                    ))}
                  </div>
                ) : null}
              </div>
              ) : null}

              {/* Odrzucone */}
              {activeRejected ? (
              <div className="rounded-lg border border-gray-200 border-l-4 border-l-rose-600 bg-white p-3 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-rose-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
                        ⊘ Odrzucone
                      </span>
                      <span className="text-xs text-gray-600">→ zwrot do klienta / separacja</span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <input
                      type="number"
                      min={0}
                      max={lineQty}
                      value={rej}
                      disabled={disable || splitInputsLocked || returnType === "UNCLAIMED"}
                      onChange={(e) => setRej(e.target.value)}
                      className="[&::-webkit-inner-spin-button]:appearance-none w-16 rounded-md border border-rose-200 bg-white px-2 py-1.5 text-center text-sm tabular-nums disabled:bg-slate-50"
                      aria-label="Ilość odrzucona"
                    />
                    <span className="text-xs font-medium text-gray-600">szt.</span>
                  </label>
                </div>
                <RejectionEvidencePanel line={line} rejectedUnits={rejectedEvidenceUnits} />
                <p className="mt-2 text-xs font-semibold tabular-nums text-slate-700">Zwrot: 0,00 PLN</p>
              </div>
              ) : null}

              {multiQty && wmsLineGalleryUrls.length > 0 ? (
                <div className="rounded-lg border border-amber-200/60 bg-white p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900/90">Zdjęcia uszkodzeń (linia)</p>
                  <p className="mt-0.5 text-[11px] text-gray-600">
                    Jedna dokumentacja przypisana do linii — dotyczy wszystkich sztuk uszkodzonych.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {wmsLineGalleryUrls.map((u, i) => (
                      <a
                        key={`${u}-${i}`}
                        href={resolveDamageMediaUrl(u)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block shrink-0"
                      >
                        <img
                          src={resolveDamageMediaUrl(u)}
                          alt=""
                          className="h-14 w-14 rounded-md border border-amber-200/80 object-cover shadow-sm"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 sm:ml-[84px]">
              <p
                className={`text-xs font-semibold tabular-nums ${
                  splitParsed.sum === lineQty ? "text-gray-700" : "text-rose-600"
                }`}
              >
                Suma rozdziału: {splitParsed.sum} / {lineQty} szt.
                {splitParsed.sum !== lineQty ? " — wpisz ilości tak, by zgadzały się z linią." : null}
              </p>
              {!splitInputsLocked ? (
                <button
                  type="button"
                  disabled={disable || splitParsed.sum !== lineQty}
                  onClick={() => {
                    const { a, db, dc, r } = splitParsed;
                    if (a + db + dc + r !== lineQty) {
                      setLineErr(`Łącznie musi być ${lineQty} szt. (przyjęte + uszkodzone B + uszkodzone C + odrzucone).`);
                      return;
                    }
                    setLineErr(null);
                    const d = db + dc;
                    void onSaveSplit({
                      product_id: line.product_id,
                      accepted_qty: a,
                      damaged_qty: d,
                      damaged_b_qty: db,
                      damaged_c_qty: dc,
                      rejected_qty: r,
                      condition: d > 0 ? (db > 0 ? "B" : "C") : null,
                    });
                  }}
                  className="rounded-md bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? "Zapisywanie…" : "Zapisz podział"}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {!multiQty && wmsLineGalleryUrls.length > 0 ? (
          <div className="mt-3 border-t border-gray-100 pt-2">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Zdjęcia (WMS / panel)
            </p>
            <div className="flex flex-wrap gap-1.5">
              {wmsLineGalleryUrls.map((u, i) => (
                <a
                  key={`${u}-${i}`}
                  href={resolveDamageMediaUrl(u)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block shrink-0"
                >
                  <img
                    src={resolveDamageMediaUrl(u)}
                    alt=""
                    className="h-14 w-14 rounded-md border border-gray-200 object-cover shadow-sm"
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {sheet ? (
        <div
          className="fixed inset-0 z-[80] flex justify-end bg-black/40"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !sheetSaving) closeSheet();
          }}
        >
          <div
            className="flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-gray-200 bg-white p-4 shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {sheet === "damage" ? (
              <>
                <h3 className="text-sm font-bold text-gray-900">Uszkodzony — {name}</h3>
                <p className="mt-1 text-xs text-gray-600">Klasa B / C oraz typ uszkodzenia. {wmsSettings?.require_photos ? "Zdjęcia są wymagane." : "Zdjęcia zalecane."}</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={sheetSaving}
                    onClick={() => {
                      setDamageClass("B");
                      setDamageTypeIds((prev) => filterRmzDamageTypeIdsForClass("B", prev));
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${damageClass === "B" ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-800"}`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    disabled={sheetSaving}
                    onClick={() => {
                      setDamageClass("C");
                      setDamageTypeIds((prev) => filterRmzDamageTypeIdsForClass("C", prev));
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${damageClass === "C" ? "bg-amber-600 text-white" : "bg-gray-100 text-gray-800"}`}
                  >
                    C
                  </button>
                </div>
                <div className="mt-3">
                  <RmzDamageTypeChips
                    damageClass={damageClass}
                    selectedIds={filterRmzDamageTypeIdsForClass(damageClass, damageTypeIds)}
                    disabled={sheetSaving}
                    onToggle={(id) => {
                      setDamageTypeIds((prev) => {
                        const s = new Set(prev);
                        if (s.has(id)) s.delete(id);
                        else s.add(id);
                        return [...s];
                      });
                    }}
                  />
                </div>
                <div className="mt-4">
                  <p className="text-[11px] font-semibold text-gray-700">Zdjęcia</p>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    disabled={sheetSaving || photoUploading}
                    onChange={(e) => {
                      void onPickDamagePhotos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    disabled={sheetSaving || photoUploading || photoUrls.length >= PANEL_RMZ_MAX_PHOTOS}
                    onClick={() => photoInputRef.current?.click()}
                    className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {photoUploading ? "Wgrywanie…" : "Dodaj zdjęcia"}
                  </button>
                  {photoUrls.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {photoUrls.map((u, i) => (
                        <div key={`${u}-${i}`} className="relative inline-block">
                          <img src={resolveDamageMediaUrl(u)} alt="" className="h-16 w-16 rounded border border-gray-200 object-cover" />
                          <button
                            type="button"
                            disabled={sheetSaving}
                            className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white shadow hover:bg-rose-500 disabled:opacity-50"
                            title="Usuń"
                            onClick={() => setPhotoUrls((prev) => prev.filter((_, j) => j !== i))}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <label className="mt-4 block text-xs font-semibold text-gray-700">
                  Notatka (opcjonalnie)
                  <textarea
                    value={noteDamage}
                    disabled={sheetSaving}
                    onChange={(e) => setNoteDamage(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                  />
                </label>
              </>
            ) : (
              <>
                <h3 className="text-sm font-bold text-gray-900">Odrzuć — {name}</h3>
                <p className="mt-1 text-xs text-gray-600">Wybierz powód odrzucenia zwrotu.</p>
                <label className="mt-3 block text-xs font-semibold text-gray-700">
                  Powód (wymagane)
                  <select
                    value={rejectReasonId}
                    disabled={sheetSaving}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRejectReasonId(v);
                      if (v !== WMS_REJECT_OTHER_ID) setRejectOtherText("");
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-sm"
                  >
                    <option value="">— wybierz —</option>
                    {wmsRejectReasonSelectOptions()}
                  </select>
                </label>
                {rejectReasonId === WMS_REJECT_OTHER_ID ? (
                  <label className="mt-3 block text-xs font-semibold text-gray-700">
                    Uzasadnienie (wymagane)
                    <textarea
                      value={rejectOtherText}
                      disabled={sheetSaving}
                      onChange={(e) => setRejectOtherText(e.target.value)}
                      rows={4}
                      className="mt-1 w-full rounded-lg border border-rose-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                ) : (
                  <label className="mt-3 block text-xs font-semibold text-gray-700">
                    Notatka (opcjonalnie)
                    <textarea
                      value={noteReject}
                      disabled={sheetSaving}
                      onChange={(e) => setNoteReject(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  </label>
                )}
              </>
            )}
            {localSheetErr ? <p className="mt-3 text-sm font-semibold text-rose-700">{localSheetErr}</p> : null}
            <div className="mt-auto flex shrink-0 gap-2 border-t border-gray-100 pt-4">
              <button
                type="button"
                disabled={sheetSaving}
                onClick={closeSheet}
                className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                disabled={sheetSaving || saving}
                onClick={() => void (sheet === "damage" ? saveDamageSheet() : saveRejectSheet())}
                className="flex-1 rounded-lg bg-gray-900 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-50"
              >
                {sheetSaving || saving ? "Zapisywanie…" : "Zapisz"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
