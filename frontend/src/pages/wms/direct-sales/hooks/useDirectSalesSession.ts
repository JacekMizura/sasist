import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { extractApiErrorMessage } from "../../../../api/apiErrorMessage";
import { useWmsScanner } from "../../../../context/WmsScannerContext";
import { DAMAGE_TENANT_ID } from "../../../../constants/panelTenant";
import { lineTotal } from "../utils/lineTotal";
import {
  completeDirectSaleSession,
  createDirectSaleSession,
  getDirectSaleSession,
  scanDirectSaleSession,
  startDirectSalePayment,
  suspendDirectSaleSession,
  type DirectSaleSession,
} from "../services/directSalesApi";

type UseDirectSalesSessionArgs = {
  warehouseId: number | null;
  onScanSuccess: (productId: number) => void;
};

export function useDirectSalesSession({ warehouseId, onScanSuccess }: UseDirectSalesSessionArgs) {
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
  const scanBusyRef = useRef(false);

  const total = useMemo(
    () => (session?.lines ?? []).reduce((sum, ln) => sum + lineTotal(ln), 0),
    [session?.lines],
  );

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
    setScannerInputPlaceholder("Skanuj EAN / SKU…");
    setScannerInputDisabled(busy);
    return () => {
      setScannerInputPlaceholder(null);
      setScannerInputDisabled(false);
    };
  }, [busy, setScannerInputDisabled, setScannerInputPlaceholder]);

  useEffect(() => {
    if (warehouseId == null) return;
    void ensureSession().catch((e) => setError(extractApiErrorMessage(e)));
  }, [warehouseId, ensureSession]);

  const handleScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || warehouseId == null || scanBusyRef.current) return;
      scanBusyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const sess = await ensureSession();
        if (!sess) return;
        const result = await scanDirectSaleSession({
          tenantId: DAMAGE_TENANT_ID,
          sessionId: sess.id,
          code,
        });
        const fresh = await getDirectSaleSession({
          tenantId: DAMAGE_TENANT_ID,
          sessionId: sess.id,
        });
        setSession(fresh);
        onScanSuccess(result.product_id);
        showScannerToast(`+ ${code}`, "success");
        clearScannerInput();
      } catch (e) {
        const msg = extractApiErrorMessage(e);
        setError(msg);
        showScannerToast(msg, "error");
      } finally {
        scanBusyRef.current = false;
        setBusy(false);
        refocusScannerInput();
      }
    },
    [warehouseId, ensureSession, onScanSuccess, showScannerToast, clearScannerInput, refocusScannerInput],
  );

  useEffect(() => {
    const v = scannerInputValue.trim();
    if (!v) return;
    void handleScan(v);
  }, [scannerInputValue, handleScan]);

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

  const complete = useCallback(async () => {
    if (!session || warehouseId == null) return;
    setBusy(true);
    try {
      if (session.status === "ACTIVE") await checkout();
      const result = await completeDirectSaleSession({
        tenantId: DAMAGE_TENANT_ID,
        sessionId: session.id,
        paymentMethod,
      });
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
  }, [session, warehouseId, paymentMethod, checkout, showScannerToast]);

  return {
    session,
    busy,
    error,
    total,
    paymentMethod,
    setPaymentMethod,
    checkout,
    complete,
    suspend,
  };
}
