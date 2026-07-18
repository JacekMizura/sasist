import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { extractApiErrorMessage } from "../../api/apiErrorMessage";
import {
  extractWmsUserMessage,
  fallbackWmsUserMessage,
  type WmsUserMessage,
} from "../../types/wmsUserMessage";
import WmsMessageModal from "./WmsMessageModal";

type WmsMessageContextValue = {
  showWmsMessage: (message: WmsUserMessage) => void;
  showWmsError: (err: unknown) => void;
  clearWmsMessage: () => void;
};

const WmsMessageContext = createContext<WmsMessageContextValue | null>(null);

export function WmsMessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<WmsUserMessage | null>(null);

  const showWmsMessage = useCallback((msg: WmsUserMessage) => {
    setMessage(msg);
  }, []);

  const showWmsError = useCallback((err: unknown) => {
    const structured = extractWmsUserMessage(err);
    if (structured) {
      setMessage(structured);
      return;
    }
    setMessage(fallbackWmsUserMessage(extractApiErrorMessage(err, "")));
  }, []);

  const clearWmsMessage = useCallback(() => setMessage(null), []);

  const value = useMemo(
    () => ({ showWmsMessage, showWmsError, clearWmsMessage }),
    [showWmsMessage, showWmsError, clearWmsMessage],
  );

  return (
    <WmsMessageContext.Provider value={value}>
      {children}
      <WmsMessageModal open={message != null} message={message} onClose={clearWmsMessage} />
    </WmsMessageContext.Provider>
  );
}

export function useWmsMessage(): WmsMessageContextValue {
  const ctx = useContext(WmsMessageContext);
  if (!ctx) {
    return {
      showWmsMessage: () => undefined,
      showWmsError: () => undefined,
      clearWmsMessage: () => undefined,
    };
  }
  return ctx;
}
