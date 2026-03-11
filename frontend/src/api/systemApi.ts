import api from "./axios";

export type HealthResponse = { status: string; service?: string };
export type DbSizeResponse = {
  database_size_mb?: number;
  size_mb?: number;
  tables_count?: number;
  total_rows?: number;
};

export async function getSystemHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/system/health/");
  return data;
}

export async function getDbSize(): Promise<DbSizeResponse> {
  const { data } = await api.get<DbSizeResponse>("/system/db-size/");
  return data;
}

export async function getChangelog(): Promise<string> {
  const { data } = await api.get<string>("/system/changelog/", {
    responseType: "text",
  });
  return typeof data === "string" ? data : "";
}
