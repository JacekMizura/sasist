import { getBackendPublicOrigin } from "./apiBase";
import type { PrinterAgentDownloadInfo } from "../types/printing";

/** Fallback when env / API do not provide a server URL (matches agent installer docs). */
export const DEFAULT_PRINTER_AGENT_SERVER_URL = "https://sasist.pl";

export type PrinterAgentDownloadSource = "github" | "env" | "fallback" | "static" | "invalid";

export type ResolvedPrinterAgentDownload = {
  downloadUrl: string | null;
  source: PrinterAgentDownloadSource;
};

export type PrinterAgentSystemConfig = {
  /** Optional build-time override for agent server URL shown in onboarding. */
  printerAgentServerUrl?: string;
  /** Optional build-time override for installer download URL. */
  printerAgentDownloadUrl?: string;
};

const BLOCKED_DOWNLOAD_HOSTS = new Set(["releases.sasist.pl"]);

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

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isValidPrinterAgentDownloadUrl(
  url: string | null | undefined,
  opts?: { isProduction?: boolean },
): boolean {
  const value = (url || "").trim();
  if (!value.startsWith("http://") && !value.startsWith("https://")) {
    return false;
  }

  const host = hostnameFromUrl(value);
  if (!host) return false;
  if (BLOCKED_DOWNLOAD_HOSTS.has(host)) return false;

  const isProduction = opts?.isProduction ?? import.meta.env.PROD;
  if (isProduction && (host === "localhost" || host === "127.0.0.1")) {
    return false;
  }

  return true;
}

export function resolvePrinterAgentDownload(
  downloadInfo?: PrinterAgentDownloadInfo | null,
): ResolvedPrinterAgentDownload {
  const isProduction = import.meta.env.PROD;

  const fromApi = downloadInfo?.download_url?.trim();
  if (fromApi && isValidPrinterAgentDownloadUrl(fromApi, { isProduction })) {
    const apiSource = downloadInfo?.source;
    const source: PrinterAgentDownloadSource =
      apiSource === "env" || apiSource === "fallback" || apiSource === "github" ? apiSource : "github";
    return { downloadUrl: fromApi, source };
  }

  const fromEnv = getPrinterAgentSystemConfig().printerAgentDownloadUrl;
  if (fromEnv && isValidPrinterAgentDownloadUrl(fromEnv, { isProduction })) {
    return { downloadUrl: fromEnv, source: "static" };
  }

  return { downloadUrl: null, source: "invalid" };
}

/** @deprecated use resolvePrinterAgentDownload — kept for backward compatibility */
export function resolvePrinterAgentDownloadUrl(
  downloadInfo?: { download_url?: string | null } | null,
): string {
  return resolvePrinterAgentDownload(downloadInfo).downloadUrl ?? "";
}

export function buildPrinterAgentConfigClipboardText(serverUrl: string, apiKey: string): string {
  return `Serwer: ${serverUrl}\nKlucz: ${apiKey}`;
}

export function openPrinterAgentDownload(url: string): void {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function logPrinterAgentDownloadDiagnostics(resolved: ResolvedPrinterAgentDownload): void {
  console.info("[printer-agent-download]", {
    source: resolved.source,
    downloadUrl: resolved.downloadUrl,
  });
}
