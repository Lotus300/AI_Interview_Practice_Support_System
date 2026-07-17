import { GoogleAuth } from "google-auth-library";

const cloudPlatformScope = "https://www.googleapis.com/auth/cloud-platform";

export function createGoogleApiClient({ auth = new GoogleAuth({ scopes: [cloudPlatformScope] }), fetchImpl = globalThis.fetch } = {}) {
  return {
    async warmup() {
      await auth.getAccessToken();
    },
    async request(url, { method = "GET", body, headers = {}, signal } = {}) {
      const token = await auth.getAccessToken();
      const response = await fetchImpl(url, {
        method,
        signal,
        headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data.error?.message || `Google API request failed: ${response.status}`);
        error.statusCode = response.status >= 500 ? 503 : response.status;
        error.code = data.error?.status || "GOOGLE_API_ERROR";
        throw error;
      }
      return data;
    }
  };
}
