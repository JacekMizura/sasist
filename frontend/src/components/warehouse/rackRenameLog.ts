import { logLayoutRackRename } from "./layoutRackLog";

/** Dev/staging log for rack rename persistence (layout designer). */
export function logRackRename(payload: {
  rack_id: number | string;
  old_name: string | null;
  new_name: string | null;
  persisted: boolean;
}): void {
  logLayoutRackRename({ ...payload, persisted: payload.persisted });
}
