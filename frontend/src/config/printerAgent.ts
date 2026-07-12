import { getBackendPublicOrigin } from "./apiBase";

/** Fallback when env / API do not provide a server URL (matches agent installer docs). */
export const DEFAULT_PRINTER_AGENT_SERVER_URL = "https://sasist.pl";

/** Static placeholder until a CDN or backend URL is configured. */
export const DEFAULT_PRINTER_AGENT_DOWNLOAD_PATH = "/downloads/SasistPrinterAgent-Setup.exe";

export type PrinterAgentSystemConfig = {
  /** Optional build-time override for agent server URL shown in onboarding. */
  printerAgentServerUrl?: string;
  /** Optional build-time override for installer download URL. */
  printerAgentDownloadUrl?: string;
};

function envString(key: keyof ImportMetaEnv): string {
  const raw = import.meta.env[key];
  return typeof raw === "string" ? raw.trim() : "";
}

export function getPrinterAgentSystemConfig(): PrinterAgentSystemConfig {
  return {
    printerAgentServerUrl: envString("VITE_PRINTER_AGENT_SERVER_URL") || undefined,
    printerAgentDownloadUrl: envString("VITE_PRINTER_AGENT_DOWNLOAD_URL") || undefined,
  };
}

/** Base URL the Windows agent expects (without `/api`). */
export function getPrinterAgentServerUrl(): string {
  const fromEnv = getPrinterAgentSystemConfig().printerAgentServerUrl;
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const origin = getBackendPublicOrigin().replace(/\/+$/, "");
  if (origin) return origin;

  return DEFAULT_PRINTER_AGENT_SERVER_URL;
}

export function resolvePrinterAgentDownloadUrl(
  downloadInfo?: { download_url?: string | null } | null,
): string {
  const fromApi = downloadInfo?.download_url?.trim();
  if (fromApi) {
    if (fromApi.startsWith("http://") || fromApi.startsWith("https://")) return fromApi;
    if (typeof window !== "undefined") {
      return `${window.location.origin}${fromApi.startsWith("/") ? fromApi : `/${fromApi}`}`;
    }
    const origin = getBackendPublicOrigin().replace(/\/+$/, "");
    if (origin) return `${origin}${fromApi.startsWith("/") ? fromApi : `/${fromApi}`}`;
    return fromApi;
  }

  const fromEnv = getPrinterAgentSystemConfig().printerAgentDownloadUrl;
  if (fromEnv) {
    if (fromEnv.startsWith("http://") || fromEnv.startsWith("https://")) return fromEnv;
    if (typeof window !== "undefined") {
      return `${window.location.origin}${fromEnv.startsWith("/") ? fromEnv : `/${fromEnv}`}`;
    }
  }

  if (typeof window !== "undefined") {
    return `${window.location.origin}${DEFAULT_PRINTER_AGENT_DOWNLOAD_PATH}`;
  }
  return DEFAULT_PRINTER_AGENT_DOWNLOAD_PATH;
}

export function buildPrinterAgentConfigClipboardText(serverUrl: string, apiKey: string): string {
  return `Serwer: ${serverUrl}\nKlucz: ${apiKey}`;
}
