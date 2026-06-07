import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import { formatDirectSalesMutationError } from "../../modules/directSales/errors/directSalesMutationErrors";
import {
  addProductToDirectSaleSession,
  completeDirectSaleSession,
  createDirectSaleSession,
  deleteDirectSaleLine,
  fetchDirectSaleCompletion,
  getDirectSaleSession,
  patchDirectSaleLine,
  resumeDirectSaleSession,
  scanDirectSaleSession,
  startDirectSalePayment,
  suspendDirectSaleSession,
  type DirectSaleCompleteResult,
  type DirectSaleSession,
} from "../../api/directSalesApi";
import type { DirectSaleCompleteError, DirectSaleCompletion } from "../../types/directSalesCompletion";
import { parseCompleteError } from "../../utils/normalizeDirectSalesCompletion";
import { useWmsScanner } from "../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../../constants/panelTenant";
import {
  classifyAxiosOperationalError,
  handleOperationalApiError,
  isOperationalUnavailableStatus,
  OPERATIONAL_ENDPOINTS,
} from "../../services/operational/operationalFeatureGuard";
import { allocationStrategyToIssueStrategy } from "../../utils/directSales/allocationStrategy";
import { lineTotal } from "../../utils/directSales/lineTotal";
import { safeTrim } from "../../utils/safeStrings";
import { STATIONARY_SALE_UNAVAILABLE } from "../../components/directSales/directSalesTerminology";
import { useResolvedDirectSalesSettings } from "../../modules/directSales/settings/resolvedDirectSalesSettings";

export type DocumentSubtype = "RECEIPT" | "INVOICE";

type Args = {
  warehouseId: number | null;
  onProductAdded: (productId: number) => void;
  enabled?: boolean;
  onSuspended?: () => void;
};

function friendlyError(err: unknown): string {
  const status = classifyAxiosOperationalError(err);
  if (isOperationalUnavailableStatus(status)) {
    return STATIONARY_SALE_UNAVAILABLE;
  }
  return extractApiErrorMessage(err);
}

export function useDirectSalesSession({
  warehouseId,
  onProductAdded,
  enabled = true,
  onSuspended,
}: Args) {
  const resolvedDirectSalesSettings = useResolvedDirectSalesSettings();
  const {
    scannerInputValue,
    setScannerInputPlaceholder,
    setScannerInputDisabled,
    showScannerToast,
    refocusScannerInput,
    clearScannerInput,
  } = useWmsScanner();

  const [session, setSession] = useState<DirectSaleSession | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [mixedCashAmount, setMixedCashAmount] = useState(0);
  const [mixedCardAmount, setMixedCardAmount] = useState(0);
  const [cashReceived, setCashReceived] = useState(0);
  const [documentSubtype, setDocumentSubtype] = useState<DocumentSubtype>("RECEIPT");
  const [lastComplete, setLastComplete] = useState<DirectSaleCompleteResult | null>(null);
  const [completionView, setCompletionView] = useState<DirectSaleCompletion | null>(null);
  const [completeError, setCompleteError] = useState<DirectSaleCompleteError | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const scanBusyRef = useRef(false);
  const completeInFlightRef = useRef(false);
  const initRef = useRef(false);

  const total = useMemo(
    () => (session?.lines ?? []).reduce((sum, ln) => sum + lineTotal(ln), 0),
    [session?.lines],
  );

  const issueStrategy = useMemo(
    () => allocationStrategyToIssueStrategy(resolvedDirectSalesSettings.allocation_strategy),
    [resolvedDirectSalesSettings.allocation_strategy],
  );

  useEffect(() => {
    setDocumentSubtype(resolvedDirectSalesSettings.default_document_type === "FV" ? "INVOICE" : "RECEIPT");
  }, [resolvedDirectSalesSettings.default_document_type]);

  useEffect(() => {
    setCashReceived((prev) => (prev < total ? total : prev));
    setMixedCashAmount((prev) => (prev <= 0 ? total : prev));
    setMixedCardAmount(0);
  }, [total]);

  const apiScope = useCallback((): { tenantId: number; warehouseId: number } | null => {
    const wid = warehouseId ?? session?.warehouse_id ?? null;
    if (wid == null) return null;
    return { tenantId: DAMAGE_TENANT_ID, warehouseId: wid };
  }, [warehouseId, session?.warehouse_id]);

  const refreshSession = useCallback(async (sessionId: number) => {
    const scope = apiScope();
    if (!scope) return session;
    const fresh = await getDirectSaleSession({ ...scope, sessionId });
    setSession(fresh);
    return fresh;
  }, [apiScope, session]);

  const ensureSession = useCallback(async () => {
    if (session?.status === "ACTIVE" || session?.status === "CHECKOUT") return session;
    if (session || warehouseId == null) return session;
    const created = await createDirectSaleSession({
      tenantId: DAMAGE_TENANT_ID,
      warehouseId,
      issueStrategy,
    });
    setSession(created);
    return created;
  }, [session, warehouseId, issueStrategy]);

  const startNewSession = useCallback(async () => {
    if (warehouseId == null) return null;
    setLastComplete(null);
    setCompletionView(null);
    setCompleteError(null);
    setError(null);
    const created = await createDirectSaleSession({
      tenantId: DAMAGE_TENANT_ID,
      warehouseId,
      issueStrategy,
    });
    setSession(created);
    return created;
  }, [warehouseId, issueStrategy]);

  const refreshCompletion = useCallback(async (sessionId: number) => {
    const scope = apiScope();
    if (!scope) return null;
    const fresh = await fetchDirectSaleCompletion({ ...scope, sessionId });
    if (fresh) setCompletionView(fresh);
    return fresh;
  }, [apiScope]);

  const dismissCompletion = useCallback(() => {
    setCompletionView(null);
    setLastComplete(null);
    setCompleteError(null);
    if (resolvedDirectSalesSettings.auto_start_new_session) {
      void startNewSession();
    }
  }, [resolvedDirectSalesSettings.auto_start_new_session, startNewSession]);

  useEffect(() => {
    const pm = resolvedDirectSalesSettings.payment_methods;
    const first =
      (pm.cash && "CASH") ||
      (pm.card && "CARD") ||
      (pm.blik && "BLIK") ||
      (pm.transfer && "TRANSFER") ||
      (pm.mixed && "MIXED") ||
      "CASH";
    setPaymentMethod(first);
  }, [resolvedDirectSalesSettings.payment_methods, warehouseId]);

  const dismissCompleteError = useCallback(() => setCompleteError(null), []);

  const showHistoricalCompletion = useCallback(
    async (sessionId: number) => {
      const fresh = await refreshCompletion(sessionId);
      return fresh;
    },
    [refreshCompletion],
  );

  useEffect(() => {
    setScannerInputPlaceholder("Skanuj EAN → Enter");
    setScannerInputDisabled(busy);
    return () => {
      setScannerInputPlaceholder(null);
      setScannerInputDisabled(false);
    };
  }, [busy, setScannerInputDisabled, setScannerInputPlaceholder]);

  useEffect(() => {
    if (!enabled || warehouseId == null) {
      initRef.current = false;
      return;
    }
    if (initRef.current) return;
    initRef.current = true;
    void ensureSession().catch((e) => {
      handleOperationalApiError(e, OPERATIONAL_ENDPOINTS.DIRECT_SALES_SESSION);
      setUnavailable(true);
      setError(null);
    });
  }, [enabled, warehouseId, ensureSession]);

  const addByCode = useCallback(
    async (raw: string, sourceLocationId?: number | null) => {
      const code = safeTrim(raw);
      if (!code || warehouseId == null) return;
      setBusy(true);
      setError(null);
      try {
        const sess = await ensureSession();
        const scope = apiScope();
        if (!sess || !scope) return;
        const result = await scanDirectSaleSession({
          ...scope,
          sessionId: sess.id,
          code,
          sourceLocationId,
        });
        await refreshSession(sess.id);
        onProductAdded(result.product_id);
        showScannerToast(`+ ${code}`, "success");
      } catch (e) {
        handleOperationalApiError(e, OPERATIONAL_ENDPOINTS.DIRECT_SALES_SESSION);
        const msg = friendlyError(e);
        if (isOperationalUnavailableStatus(classifyAxiosOperationalError(e))) {
          setUnavailable(true);
          setError(null);
        } else {
          setError(msg);
          showScannerToast(msg, "error");
        }
      } finally {
        setBusy(false);
        refocusScannerInput();
      }
    },
    [warehouseId, apiScope, ensureSession, refreshSession, onProductAdded, showScannerToast, refocusScannerInput],
  );

  const addByProductId = useCallback(
    async (productId: number, sourceLocationId?: number | null) => {
      if (warehouseId == null) return;
      setBusy(true);
      setError(null);
      try {
        const sess = await ensureSession();
        const scope = apiScope();
        if (!sess || !scope) return;
        const result = await addProductToDirectSaleSession({
          ...scope,
          sessionId: sess.id,
          productId,
          quantity: 1,
        });
        if (sourceLocationId != null && sourceLocationId > 0) {
          await patchDirectSaleLine({
            ...scope,
            sessionId: sess.id,
            lineId: result.line_id,
            sourceLocationId,
          });
        }
        await refreshSession(sess.id);
        onProductAdded(result.product_id);
        showScannerToast("Dodano pozycję", "success");
      } catch (e) {
        const { message, devDetail } = formatDirectSalesMutationError(e, "add-product");
        const display = devDetail ? `${message}\n${devDetail}` : message;
        setError(display);
        showScannerToast(message, "error");
      } finally {
        setBusy(false);
      }
    },
    [warehouseId, apiScope, ensureSession, refreshSession, onProductAdded, showScannerToast],
  );

  const handleScan = useCallback(
    async (raw: string) => {
      if (scanBusyRef.current) return;
      scanBusyRef.current = true;
      try {
        await addByCode(raw);
        clearScannerInput();
      } finally {
        scanBusyRef.current = false;
      }
    },
    [addByCode, clearScannerInput],
  );

  useEffect(() => {
    const v = safeTrim(scannerInputValue);
    if (!v) return;
    void handleScan(v);
  }, [scannerInputValue, handleScan]);

  const changeLineQty = useCallback(
    async (lineId: number, quantity: number) => {
      const scope = apiScope();
      if (!session || !scope) return;
      setBusy(true);
      try {
        const fresh = await patchDirectSaleLine({
          ...scope,
          sessionId: session.id,
          lineId,
          quantity,
        });
        setSession(fresh);
      } catch (e) {
        setError(extractApiErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [session, apiScope],
  );

  const changeLineLocation = useCallback(
    async (lineId: number, sourceLocationId: number | null) => {
      const scope = apiScope();
      if (!session || !scope) return;
      setBusy(true);
      try {
        const fresh = await patchDirectSaleLine({
          ...scope,
          sessionId: session.id,
          lineId,
          sourceLocationId,
        });
        setSession(fresh);
      } catch (e) {
        setError(extractApiErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [session, apiScope],
  );

  const removeLine = useCallback(
    async (lineId: number) => {
      const scope = apiScope();
      if (!session || !scope) return;
      setBusy(true);
      try {
        const fresh = await deleteDirectSaleLine({
          ...scope,
          sessionId: session.id,
          lineId,
        });
        setSession(fresh);
      } catch (e) {
        setError(extractApiErrorMessage(e));
      } finally {
        setBusy(false);
      }
    },
    [session, apiScope],
  );

  const onCustomerAttached = useCallback((customerId: number | null) => {
    setSession((s) => (s ? { ...s, customer_id: customerId } : s));
  }, []);

  const suspend = useCallback(async () => {
    const scope = apiScope();
    if (!session || !scope) return;
    setBusy(true);
    try {
      await suspendDirectSaleSession({ ...scope, sessionId: session.id });
      showScannerToast("Sesja zawieszona", "success");
      onSuspended?.();
      await startNewSession();
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [session, apiScope, showScannerToast, onSuspended, startNewSession]);

  const restoreSession = useCallback(
    async (sessionId: number) => {
      const scope = apiScope();
      if (!scope) return null;
      setBusy(true);
      setError(null);
      try {
        const fresh = await resumeDirectSaleSession({ ...scope, sessionId });
        setSession(fresh);
        showScannerToast(`Wznowiono sesję #${sessionId}`, "success");
        return fresh;
      } catch (e) {
        setError(extractApiErrorMessage(e));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [apiScope, showScannerToast],
  );

  const checkout = useCallback(async () => {
    const scope = apiScope();
    if (!session || !scope || session.lines.length === 0) return;
    setBusy(true);
    try {
      const s = await startDirectSalePayment({
        ...scope,
        sessionId: session.id,
        paymentMethod,
      });
      setSession(s);
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [session, apiScope, paymentMethod]);

  const complete = useCallback(async () => {
    const scope = apiScope();
    if (!session || !scope) return null;
    if (completeInFlightRef.current || busy) return null;
    if (session.status === "COMPLETED") return lastComplete;
    if (lastComplete && lastComplete.session_id === session.id) return lastComplete;

    completeInFlightRef.current = true;
    setBusy(true);
    setCompleteError(null);
    try {
      if (session.status === "ACTIVE" || session.status === "SUSPENDED") await checkout();
      const paymentSplits =
        paymentMethod === "MIXED"
          ? [
              ...(mixedCashAmount > 0 ? [{ method: "CASH", amount: mixedCashAmount }] : []),
              ...(mixedCardAmount > 0 ? [{ method: "CARD", amount: mixedCardAmount }] : []),
            ]
          : undefined;
      const result = await completeDirectSaleSession({
        ...scope,
        sessionId: session.id,
        paymentMethod,
        documentSubtype,
        paymentSplits,
      });
      setLastComplete(result);
      setSession((prev) =>
        prev
          ? {
              ...prev,
              status: "COMPLETED",
              order_id: result.order_id,
            }
          : prev,
      );
      const bundle = result.completion ?? (await fetchDirectSaleCompletion({
        ...scope,
        sessionId: result.session_id,
      }));
      if (bundle) setCompletionView(bundle);
      showScannerToast(`Zakończono #${result.order_id}`, "success");
      return result;
    } catch (e) {
      setCompleteError(parseCompleteError(e));
      setError(null);
      return null;
    } finally {
      completeInFlightRef.current = false;
      setBusy(false);
    }
  }, [
    session,
    apiScope,
    busy,
    lastComplete,
    paymentMethod,
    documentSubtype,
    mixedCashAmount,
    mixedCardAmount,
    checkout,
    showScannerToast,
  ]);

  return {
    session,
    busy,
    unavailable,
    error,
    total,
    paymentMethod,
    setPaymentMethod,
    cashReceived,
    setCashReceived,
    mixedCashAmount,
    setMixedCashAmount,
    mixedCardAmount,
    setMixedCardAmount,
    dismissCompleteError,
    documentSubtype,
    setDocumentSubtype,
    lastComplete,
    completionView,
    completeError,
    refreshCompletion,
    dismissCompletion,
    showHistoricalCompletion,
    addByCode,
    addByProductId,
    changeLineQty,
    changeLineLocation,
    removeLine,
    onCustomerAttached,
    checkout,
    complete,
    suspend,
    restoreSession,
    startNewSession,
    clearLastComplete: () => setLastComplete(null),
    resetAvailability: () => {
      setUnavailable(false);
      initRef.current = false;
      setError(null);
    },
  };
}
