import test from "node:test";
import assert from "node:assert/strict";
import { createVoicevoxClient } from "../src/features/media/voicevox-client.mjs";

test("VOICEVOX Engine APIへ正しいクエリとJSONを送る", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, options });
    return requests.length === 1
      ? new Response(JSON.stringify({ speedScale: 1, volumeScale: 1 }), { status: 200, headers: { "content-type": "application/json" } })
      : new Response(Buffer.from("wav"), { status: 200 });
  };
  const client = createVoicevoxClient({ baseUrl: "http://127.0.0.1:50021/", fetchImpl });
  const query = await client.createAudioQuery({ text: "速度を調整しています。", speakerId: 13 });
  const audio = await client.synthesize({ audioQuery: query, speakerId: 13 });

  assert.match(requests[0].url, /^http:\/\/127\.0\.0\.1:50021\/audio_query\?/);
  assert.equal(new URL(requests[0].url).searchParams.get("speaker"), "13");
  assert.equal(new URL(requests[0].url).searchParams.get("text"), "速度を調整しています。");
  assert.equal(requests[1].options.headers["content-type"], "application/json");
  assert.equal(audio.toString(), "wav");
});

test("Google認証モードではCloud Run向けIDトークンクライアントを使う", async () => {
  const calls = [];
  const googleAuth = {
    async getIdTokenClient(audience) {
      calls.push({ audience });
      return {
        async request(options) {
          calls.push(options);
          return { data: { speedScale: 1 } };
        }
      };
    }
  };
  const client = createVoicevoxClient({ baseUrl: "https://voicevox.example", authMode: "google", googleAuth });
  await client.createAudioQuery({ text: "質問", speakerId: 21 });
  assert.equal(calls[0].audience, "https://voicevox.example");
  assert.match(calls[1].url, /\/audio_query\?/);
});

test("warmupは軽量なversion APIをGETする", async () => {
  const requests = [];
  const client = createVoicevoxClient({
    baseUrl: "https://voicevox.example",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return new Response(JSON.stringify("0.25.1"), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  await client.warmup();

  assert.equal(requests[0].url, "https://voicevox.example/version");
  assert.equal(requests[0].options.method, "GET");
});
