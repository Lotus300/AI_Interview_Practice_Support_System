import { GoogleAuth } from "google-auth-library";

function normalizeBinary(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return Buffer.from(data);
}

export function createVoicevoxClient({ baseUrl, authMode = "none", timeoutMs = 60000, googleAuth = new GoogleAuth(), fetchImpl = globalThis.fetch } = {}) {
  const endpoint = String(baseUrl || "").replace(/\/+$/, "");
  let identityClientPromise;

  async function request(path, { method = "POST", body, binary = false } = {}) {
    if (!endpoint) throw new Error("VOICEVOX_BASE_URL is not configured");
    const url = `${endpoint}${path}`;
    if (authMode === "google") {
      identityClientPromise ||= googleAuth.getIdTokenClient(endpoint);
      const client = await identityClientPromise;
      const response = await client.request({
        url,
        method,
        data: body,
        headers: body ? { "content-type": "application/json" } : undefined,
        responseType: binary ? "arraybuffer" : "json",
        timeout: timeoutMs
      });
      return binary ? normalizeBinary(response.data) : response.data;
    }

    const response = await fetchImpl(url, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) throw new Error(`VOICEVOX ${response.status}: ${await response.text()}`);
    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
  }

  return {
    configured: Boolean(endpoint),
    warmup() {
      return request("/version", { method: "GET" });
    },
    createAudioQuery({ text, speakerId }) {
      return request(`/audio_query?${new URLSearchParams({ text, speaker: String(speakerId) })}`);
    },
    synthesize({ audioQuery, speakerId }) {
      return request(`/synthesis?${new URLSearchParams({ speaker: String(speakerId) })}`, { body: audioQuery, binary: true });
    }
  };
}
