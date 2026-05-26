import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMergedPickingSession } from "../../context/WmsPickingCartContext";
import { useWarehouse } from "../../context/WarehouseContext";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../damage/damageShared";
import { playScanBeep } from "../../utils/playScanBeep";
import { normalizeScanEan } from "../../utils/wmsScanNormalize";
import type { LocationPickListRow } from "./locationPickingTypes";
import type { WmsPickingLocationNavState } from "./wmsPickingFlowTypes";
import { WMS_ROUTES } from "./wmsRoutes";

type FlowStep = "scan_location" | "scan_product" | "confirm_qty";

const DEMO_LOCATION_PICK_LIST: LocationPickListRow[] = [
  {
    location_id: 1,
    location_code: "A-01-01",
    product_id: 101,
    total_quantity: 5,
    product_name: "Kabel USB-C 1 m",
    product_ean: "5901234567890",
    product_eans: ["5901234567890", "5909876543210"],
    baskets: [
      { basket_id: 1, quantity: 2 },
      { basket_id: 2, quantity: 3 },
    ],
  },
  {
    location_id: 2,
    location_code: "A-02-03",
    product_id: 102,
    total_quantity: 12,
    product_name: "Żarówka LED E27",
    product_ean: "4008321234567",
    baskets: [{ basket_id: null, quantity: 12 }],
  },
  {
    location_id: 3,
    location_code: "B-00-01",
    product_id: 103,
    total_quantity: 4,
    product_name: "Taśma pakowa 48 mm",
    product_ean: "5900001122334",
    baskets: [],
  },
];

function fmtQty(n: number): string {
  return new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 4 }).format(n);
}

function codeMatchesScan(expected: string, scan: string): boolean {
  const a = normalizeScanEan(expected).toUpperCase();
  const b = normalizeScanEan(scan).toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  return b.endsWith(a) || a.endsWith(b);
}

function productMatchesScan(row: LocationPickListRow, scan: string): boolean {
  const b = normalizeScanEan(scan).toUpperCase();
  if (!b) return false;
  const cands = [
    row.product_ean,
    ...(row.product_eans ?? []),
    String(row.product_id),
  ]
    .filter(Boolean)
    .map((x) => normalizeScanEan(String(x)).toUpperCase())
    .filter((x) => x.length > 0);
  return cands.some((c) => c === b || b.endsWith(c) || c.endsWith(b));
}

function basketDisplayLines(row: LocationPickListRow): { label: string; qty: number }[] {
  if (!row.baskets.length) {
    return [{ label: "Wózek", qty: row.total_quantity }];
  }
  return row.baskets.map((b) => ({
    label: b.basket_id == null ? "Wózek" : `B${b.basket_id}`,
    qty: b.quantity,
  }));
}


export default function WmsPickingPage() {
  const routerLocation = useLocation();
  const { warehouse } = useWarehouse();
  const warehouseId = warehouse?.id ?? null;
  const {
    registerScanHandler,
    setActiveDocument,
    showScannerToast,
    setScannerInputPlaceholder,
    appendScanToHistory,
    refocusScannerInput,
  } = useWmsScanner();

  const pickList = useMemo(() => {
    const st = routerLocation.state as WmsPickingLocationNavState | null;
    if (Array.isArray(st?.pickList) && st!.pickList!.length > 0) {
      return st!.pickList!;
    }
    return DEMO_LOCATION_PICK_LIST;
  }, [routerLocation.state]);

  const pickingSessionRaw = (routerLocation.state as WmsPickingLocationNavState | null)?.pickingSession ?? null;
  const pickingSession = useMergedPickingSession(pickingSessionRaw, DAMAGE_TENANT_ID, warehouseId);

  const orderTypeLine =
    pickingSession?.orderTypeChoice === "single"
      ? "Jednoelementowe"
      : pickingSession?.orderTypeChoice === "multi"
        ? "Wieloelementowe"
        : pickingSession?.orderTypeChoice === "all"
          ? "Wszystkie zamówienia"
          : null;

  const [index, setIndex] = useState(0);
  const [step, setStep] = useState<FlowStep>("scan_location");

  useEffect(() => {
    setIndex(0);
    setStep("scan_location");
  }, [pickList]);

  const current = pickList[index];
  const done = index >= pickList.length;
  const basketLines = current ? basketDisplayLines(current) : [];

  const resetSession = useCallback(() => {
    setIndex(0);
    setStep("scan_location");
  }, []);

  useEffect(() => {
    setActiveDocument({ kind: "picking", label: "Zbieranie (lokalizacje)" });
    return () => setActiveDocument(null);
  }, [setActiveDocument]);

  useEffect(() => {
    if (step === "scan_location") {
      setScannerInputPlaceholder("Skanuj lokalizację");
    } else if (step === "scan_product") {
      setScannerInputPlaceholder("Skanuj produkt (EAN)");
    } else {
      setScannerInputPlaceholder("Potwierdź przyciskiem");
    }
    refocusScannerInput();
  }, [step, setScannerInputPlaceholder, refocusScannerInput]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter") return;
      if (step !== "confirm_qty" || done || !current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable)) {
        return;
      }
      e.preventDefault();
      playScanBeep();
      appendScanToHistory("CONFIRM");
      if (index + 1 >= pickList.length) {
        setIndex(pickList.length);
      } else {
        setIndex((i) => i + 1);
        setStep("scan_location");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [step, done, current, index, pickList.length, appendScanToHistory]);

  useEffect(() => {
    const handler = (ean: string) => {
      if (done || !current) {
        showScannerToast("Lista zakończona.");
        return;
      }
      const scan = normalizeScanEan(ean);
      if (!scan) return;

      if (step === "scan_location") {
        if (codeMatchesScan(current.location_code, scan)) {
          playScanBeep();
          appendScanToHistory(scan);
          setStep("scan_product");
          showScannerToast("Lokalizacja OK");
        } else {
          showScannerToast("Inna lokalizacja — zeskanuj: " + current.location_code);
        }
        return;
      }

      if (step === "scan_product") {
        if (productMatchesScan(current, scan)) {
          playScanBeep();
          appendScanToHistory(scan);
          setStep("confirm_qty");
          showScannerToast("Produkt OK");
        } else {
          showScannerToast("Inny produkt — sprawdź EAN");
        }
        return;
      }

      showScannerToast('Dotknij „Potwierdź" lub Enter');
    };

    registerScanHandler(handler);
    return () => registerScanHandler(null);
  }, [
    registerScanHandler,
    step,
    current,
    done,
    showScannerToast,
    appendScanToHistory,
  ]);

  const onConfirmClick = () => {
    if (done || !current || step !== "confirm_qty") return;
    playScanBeep();
    appendScanToHistory("CONFIRM");
    if (index + 1 >= pickList.length) {
      setIndex(pickList.length);
    } else {
      setIndex((i) => i + 1);
      setStep("scan_location");
    }
  };

  if (pickList.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <p className="text-2xl font-black tracking-tight text-slate-900">Brak listy zadań</p>
        <p className="mt-1 max-w-md text-base leading-relaxed text-slate-500">
          Przekaż <span className="font-mono text-slate-800">pickList</span> w stanie nawigacji lub podłącz API.
        </p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center bg-emerald-50 px-4 text-center text-slate-900">
        <p className="text-3xl font-black tracking-tight text-emerald-900">Gotowe</p>
        <p className="mt-3 text-lg text-emerald-800">Lista zakończona.</p>
        <button
          type="button"
          onClick={resetSession}
          className="mt-10 min-h-[56px] min-w-[200px] rounded-2xl border-2 border-emerald-600 bg-emerald-600 px-8 text-lg font-bold text-white shadow-md active:scale-[0.98] hover:bg-emerald-700"
        >
          Od początku
        </button>
      </div>
    );
  }

  const stepLabel =
    step === "scan_location" ? "1. Lokalizacja" : step === "scan_product" ? "2. Produkt" : "3. Potwierdzenie";

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-white text-slate-900">
      <div className="mx-auto flex max-w-lg flex-col px-4 pb-10 pt-6">
        {pickingSession ? (
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-700 shadow-sm">
            <span className="font-semibold text-slate-900">{pickingSession.orderUiStatusName}</span>
            {orderTypeLine ? <span className="text-slate-500">· {orderTypeLine}</span> : null}
            {(pickingSession.cartCode ?? "").trim() || (pickingSession.cartName ?? "").trim() ? (
              <span className="rounded-md border border-indigo-300 bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-950">
                Wózek:{" "}
                {(pickingSession.cartName ?? "").trim() || (pickingSession.cartCode ?? "").trim()}
              </span>
            ) : null}
            <Link className="ml-1 font-bold text-blue-700 underline-offset-2 hover:underline" to={WMS_ROUTES.picking}>
              Zmień status
            </Link>
          </div>
        ) : null}
        <p className="mb-3 text-center text-sm font-semibold uppercase tracking-wider text-amber-800">{stepLabel}</p>

        {/* HEADER */}
        <header className="rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
          <p className="text-center text-xs font-medium uppercase tracking-wide text-slate-500">Lokalizacja</p>
          <p className="mt-1 text-center text-4xl font-black leading-none tracking-tight text-slate-900 sm:text-5xl">
            {current.location_code}
          </p>
          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-center text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{current.product_name ?? "—"}</p>
            <p className="mt-2 text-center font-mono text-lg text-slate-600 sm:text-xl">
              EAN {current.product_ean ?? "—"}
            </p>
          </div>
        </header>

        {/* MAIN quantity */}
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Do pobrania</p>
          <p className="mt-2 text-5xl font-black tabular-nums text-slate-900 sm:text-6xl">{fmtQty(current.total_quantity)}</p>
          <p className="mt-1 text-base text-slate-500">szt.</p>
        </section>

        {/* BASKET BREAKDOWN */}
        <section className="mt-4 rounded-2xl border-2 border-amber-200 bg-amber-50/90 px-4 py-4 shadow-sm">
          <p className="text-center text-xs font-bold uppercase tracking-wider text-amber-900">Rozbicie</p>
          <ul className="mt-3 space-y-3" aria-label="Rozbicie na koszyki">
            {basketLines.map((line, i) => (
              <li
                key={`${line.label}-${i}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-white px-4 py-3 text-lg font-bold text-amber-950 sm:text-xl"
              >
                <span>
                  {line.label} → <span className="text-slate-900">{fmtQty(line.qty)} szt.</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ONE action focus */}
        <div className="mt-8 min-h-[140px] rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center shadow-sm">
          {step === "scan_location" ? (
            <p className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Zeskanuj kod lokalizacji</p>
          ) : step === "scan_product" ? (
            <p className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Zeskanuj produkt</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="text-xl font-bold text-slate-900">Potwierdź pobranie</p>
              <button
                type="button"
                onClick={onConfirmClick}
                className="min-h-[60px] w-full max-w-sm rounded-2xl bg-emerald-600 px-6 text-xl font-black uppercase tracking-wide text-white shadow-md transition-transform active:scale-[0.98] hover:bg-emerald-700 sm:text-2xl"
              >
                Potwierdź
              </button>
              <p className="text-sm text-slate-500">lub klawisz Enter</p>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          {index + 1} / {pickList.length}
        </p>
      </div>
    </div>
  );
}
