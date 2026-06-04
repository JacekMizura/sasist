import axios from "axios";

import { coerceHttpsUrl, getWmsPhotoUploadOrigin } from "../config/apiBase";

/**
 * Calls `/wms/photo-upload/...` on the FastAPI host without the `/api` prefix.
 */
export const wmsPhotoUploadClient = axios.create();

wmsPhotoUploadClient.interceptors.request.use((config) => {
  const origin = getWmsPhotoUploadOrigin();
  if (!origin) {
    return Promise.reject(new Error("[wmsPhotoUpload] missing origin — set VITE_API_URL or use dev proxy."));
  }
  config.baseURL = coerceHttpsUrl(origin.replace(/\/+$/, ""));
  return config;
});

wmsPhotoUploadClient.interceptors.response.use(
  (r) => r,
  (error) => {
    console.error("[wmsPhotoUpload]", error.config?.baseURL, error.config?.url, error.response?.status, error.message);
    return Promise.reject(error);
  }
);
