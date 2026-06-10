import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import { useWmsScanner } from "../../../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../../../../constants/panelTenant";
import {
  classifyAxiosOperationalError,
  handleOperationalApiError,
  isOperationalUnavailableStatus,
  OPERATIONAL_ENDPOINTS,
} from "../../../../services/operational/operationalFeatureGuard";
import { safeTrim } from "../../../../utils/safeStrings";
import type { DirectSaleCompleteResult } from "../services/directSalesApi";
import { lineTotal } from "../utils/lineTotal";
import {
  addProductToDirectSaleSession,
  completeDirectSaleSession,
  createDirectSaleSession,
  deleteDirectSaleLine,
  getDirectSaleSession,
  patchDirectSaleLine,
  scanDirectSaleSession,
  startDirectSalePayment,
  suspendDirectSaleSession,
  type DirectSaleSession,
} from "../services/directSalesApi";

export type DocumentSubtype = "RECEIPT" | "INVOICE";

type UseDirectSalesSessionArgs = {
  warehouseId: number | null;
  onProductAdded: (productId: number) => void;
  enabled?: boolean;
};

function friendlyError(err: unknown): string {
  const status = classifyAxiosOperationalError(err);
  if (isOperationalUnavailableStatus(status)) {
    return "Sprzedaż bezpośrednia jest obecnie niedostępna.";
  }
  return extractApiErrorMessage(err);
}

export function useDirectSalesSession({
  warehouseId,
  onProductAdded,
  enabled = true,
}: UseDirectSalesSessionArgs) {
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
  const [documentSubtype, setDocumentSubtype] = useState<DocumentSubtype>("RECEIPT");
  const [lastComplete, setLastComplete] = useState<DirectSaleCompleteResult | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const scanBusyRef = useRef(false);
  const initRef = useRef(false);

  const total = useMemo(
    () => (session?.lines ?? []).reduce((sum, ln) => sum + lineTotal(ln), 0),
    [session?.lines],
  );

  const refreshSession = useCallback(async (sessionId: number) => {
    const fresh = await getDirectSaleSession({ tenantId: DAMAGE_TENANT_ID, sessionId });
    setSession(fresh);
    return fresh;
  }, []);

  const ensureSession = useCallback(async () => {
    if (session || warehouseId == null) return session;
    const created = await createDirectSaleSession({
      tenantId: DAMAGE_TENANT_ID,
      warehouseId,
    });
    setSession(created);
    return created;
  }, [session, warehouseId]);

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
        if (!sess) return;
        const result = await scanDirectSaleSession({
          tenantId: DAMAGE_TENANT_ID,
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
    [warehouseId, ensureSession, refreshSession, onProductAdded, showScannerToast, refocusScannerInput],
  );

  const addByProductId = useCallback(
    async (productId: number, sourceLocationId?: number | null) => {
      if (warehouseId == null) return;
      setBusy(true);
      setError(null);
      try {
        const sess = await ensureSession();
        if (!sess) return;
        const result = await addProductToDirectSaleSession({
          tenantId: DAMAGE_TENANT_ID,
          sessionId: sess.id,
          productId,
          sourceLocationId,
        });
        await refreshSession(sess.id);
        onProductAdded(result.product_id);
        showScannerToast("Dodano pozycję", "success");
      } catch (e) {
        const msg = extractApiErrorMessage(e);
        setError(msg);
        showScannerToast(msg, "error");
      } finally {
        setBusy(false);
      }
    },
    [warehouseId, ensureSession, refreshSession, onProductAdded, showScannerToast],
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
      if (!session) return;
      setBusy(true);
      try {
        const fresh = await patchDirectSaleLine({
          tenantId: DAMAGE_TENANT_ID,
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
    [session],
  );

  const changeLineLocation = useCallback(
    async (lineId: number, sourceLocationId: number | null) => {
      if (!session) return;
      setBusy(true);
      try {
        const fresh = await patchDirectSaleLine({
          tenantId: DAMAGE_TENANT_ID,
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
    [session],
  );

  const removeLine = useCallback(
    async (lineId: number) => {
      if (!session) return;
      setBusy(true);
      try {
        const fresh = await deleteDirectSaleLine({
          tenantId: DAMAGE_TENANT_ID,
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
    [session],
  );

  const onCustomerAttached = useCallback(
    (session: DirectSaleSession) => {
      setSession(session);
    },
    [],
  );

  const suspend = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const s = await suspendDirectSaleSession({ tenantId: DAMAGE_TENANT_ID, sessionId: session.id });
      setSession(s);
      showScannerToast("Sesja zawieszona", "success");
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [session, showScannerToast]);

  const checkout = useCallback(async () => {
    if (!session || session.lines.length === 0) return;
    setBusy(true);
    try {
      const s = await startDirectSalePayment({
        tenantId: DAMAGE_TENANT_ID,
        sessionId: session.id,
        paymentMethod,
      });
      setSession(s);
    } catch (e) {
      setError(extractApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [session, paymentMethod]);

  const startNewSession = useCallback(async () => {
    if (warehouseId == null) return;
    setLastComplete(null);
    setError(null);
    const created = await createDirectSaleSession({
      tenantId: DAMAGE_TENANT_ID,
      warehouseId,
    });
    setSession(created);
    return created;
  }, [warehouseId]);

  const complete = useCallback(async () => {
    if (!session || warehouseId == null) return null;
    setBusy(true);
    try {
      if (session.status === "ACTIVE" || session.status === "SUSPENDED") await checkout();
      const result = await completeDirectSaleSession({
        tenantId: DAMAGE_TENANT_ID,
        sessionId: session.id,
        paymentMethod,
        documentSubtype,
      });
      setLastComplete(result);
      showScannerToast(`Zakończono #${result.order_id}`, "success");
      const created = await createDirectSaleSession({
        tenantId: DAMAGE_TENANT_ID,
        warehouseId,
      });
      setSession(created);
      return result;
    } catch (e) {
      setError(extractApiErrorMessage(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [session, warehouseId, paymentMethod, documentSubtype, checkout, showScannerToast]);

  return {
    session,
    busy,
    unavailable,
    error,
    total,
    paymentMethod,
    setPaymentMethod,
    documentSubtype,
    setDocumentSubtype,
    lastComplete,
    addByCode,
    addByProductId,
    changeLineQty,
    changeLineLocation,
    removeLine,
    onCustomerAttached,
    checkout,
    complete,
    suspend,
    startNewSession,
    clearLastComplete: () => setLastComplete(null),
    resetAvailability: () => {
      setUnavailable(false);
      initRef.current = false;
      setError(null);
    },
  };
}
