import { ApiError } from "../../core/errors.mjs";

async function readLimited(req, maxBytes) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBytes) throw new ApiError(413, "AUDIO_TOO_LARGE", "音声データが大きすぎます");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readSpeechInput(req, maxAudioBytes) {
  const contentType = String(req.headers["content-type"] || "");
  if (contentType.includes("application/json")) {
    const body = JSON.parse((await readLimited(req, Math.ceil(maxAudioBytes * 1.5))).toString("utf8") || "{}");
    if (!body.audioBase64) throw new ApiError(400, "VALIDATION_ERROR", "音声データは必須です");
    return { audio: Buffer.from(body.audioBase64, "base64"), mimeType: body.mimeType || "audio/webm", sessionId: body.sessionId };
  }
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)?.slice(1).find(Boolean)?.trim();
  if (!boundary) throw new ApiError(400, "VALIDATION_ERROR", "multipart/form-dataが必要です");
  const raw = await readLimited(req, maxAudioBytes + 65536);
  const marker = Buffer.from(`--${boundary}`);
  const fields = {};
  let offset = raw.indexOf(marker);
  while (offset >= 0) {
    const next = raw.indexOf(marker, offset + marker.length);
    if (next < 0) break;
    const part = raw.subarray(offset + marker.length + 2, next - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd > 0) {
      const headers = part.subarray(0, headerEnd).toString("utf8");
      const name = /name="([^"]+)"/i.exec(headers)?.[1];
      const value = part.subarray(headerEnd + 4);
      if (name === "audio") fields.audio = value;
      else if (name) fields[name] = value.toString("utf8");
      if (name === "audio") fields.mimeType = /content-type:\s*([^\r\n]+)/i.exec(headers)?.[1]?.trim() || "audio/webm";
    }
    offset = next;
  }
  if (!fields.audio?.length) throw new ApiError(400, "VALIDATION_ERROR", "音声データは必須です");
  if (fields.audio.length > maxAudioBytes) throw new ApiError(413, "AUDIO_TOO_LARGE", "音声データが大きすぎます");
  return fields;
}
