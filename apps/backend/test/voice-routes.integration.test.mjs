import test from "node:test";
import assert from "node:assert/strict";
import { buildRouter, createServer } from "../src/server.mjs";
import { resetDb } from "../src/store.mjs";

test("音声生成APIの結果を認証済みユーザーがWAVとして再生できる", async () => {
  resetDb();
  let requestInput;
  const audio = Buffer.from("RIFF-test-wav");
  const voiceService = {
    async synthesize(input) {
      requestInput = input;
      return {
        aiResponseStatus: "voice_ready",
        text: input.text,
        voice: { id: "voice-1", playbackUrl: "/api/v1/voice/playback/voice-1", durationMs: 1000 },
        provider: "voicevox"
      };
    },
    findPlayback(id, userId) {
      return id === "voice-1" && userId === requestInput.userId ? { audio, contentType: "audio/wav" } : null;
    }
  };
  const server = createServer({ router: buildRouter({ voiceService }) });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const loginResponse = await fetch(`${base}/auth/google/start`);
    const cookie = loginResponse.headers.get("set-cookie").split(";")[0];
    const synthesized = await fetch(`${base}/voice/synthesize`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ text: "面接を開始します。", speaker: "青山龍星", speedScale: 1.2, volumeScale: 0.9 })
    });
    assert.equal(synthesized.status, 200);
    const result = await synthesized.json();
    assert.equal(result.aiResponseStatus, "voice_ready");
    assert.equal(requestInput.speedScale, 1.2);

    const playback = await fetch(`${base}/voice/playback/voice-1`, { headers: { cookie } });
    assert.equal(playback.status, 200);
    assert.equal(playback.headers.get("content-type"), "audio/wav");
    assert.deepEqual(Buffer.from(await playback.arrayBuffer()), audio);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
