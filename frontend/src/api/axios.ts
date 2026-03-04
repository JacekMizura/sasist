import axios from "axios";

const api = axios.create({
  baseURL: "http://127.0.0.1:8010",
});

// Ensure all request URLs have a trailing slash before query string to avoid 307 redirects
api.interceptors.request.use((config) => {
  const url = config.url ?? "";
  const [path, query] = url.split("?");
  const qs = query ? "?" + query : "";
  if (path && path !== "/" && !path.endsWith("/")) {
    config.url = path + "/" + qs;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    if (response.status === 307) {
      console.error("[API] 307 Redirect received for", response.config.url, "- fix: use trailing slash");
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 307) {
      console.error("[API] 307 Redirect (request failed):", error.config?.url, error.message);
    }
    console.error("[API] Request failed:", error.config?.url, error.response?.status, error.message);
    return Promise.reject(error);
  }
);

export default api;
