import api from "./axios";

export type ResolvedLabelsResponse = {
  labels: Record<string, string>;
  defaults?: Record<string, string>;
  version: string;
};

export async function fetchResolvedLabels(): Promise<ResolvedLabelsResponse> {
  const { data } = await api.get<ResolvedLabelsResponse>("/system/labels/resolved");
  return data;
}
