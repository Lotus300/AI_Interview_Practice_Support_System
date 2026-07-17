import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceCache } from "../src/features/media/voice-cache.mjs";
import { createVoiceService, speakerIds } from "../src/features/media/voice-service.mjs";

function wavFixture(durationMs = 1000) {
  const byteRate = 48000;
  const dataSize = Math.round(byteRate * durationMs / 1000);
  const wav = Buffer.alloc(44 + dataSize);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write("WAVE", 8, "ascii");
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt32LE(dataSize, 40);
  return wav;
}

test("話者・速度・音量をVOICEVOXへ渡し、本人だけ再生できる", async () => {
  const calls = [];
  const audio = wavFixture(1500);
  const client = {
    configured: true,
    async createAudioQuery(input) {
      calls.push(["query", input]);
      return { speedScale: 1, volumeScale: 1 };
    },
    async synthesize(input) {
      calls.push(["synthesis", input]);
      return audio;
    }
  };
  const service = createVoiceService({ client, logger: { error() {} } });
  const result = await service.synthesize({
    userId: "user-1",
    text: "面接を開始します。",
    speaker: "No.7",
    speedScale: 1.4,
    volumeScale: 0.8
  });

  assert.equal(calls[0][1].speakerId, speakerIds["No.7"]);
  assert.equal(calls[1][1].audioQuery.speedScale, 1.4);
  assert.equal(calls[1][1].audioQuery.volumeScale, 0.8);
  assert.equal(calls[1][1].audioQuery.outputSamplingRate, 16000);
  assert.equal(calls[1][1].audioQuery.outputStereo, false);
  assert.equal(result.aiResponseStatus, "voice_ready");
  assert.equal(result.voice.durationMs, 1500);
  assert.equal(service.findPlayback(result.voice.id, "user-1").audio, audio);
  assert.equal(service.findPlayback(result.voice.id, "user-2"), null);
});

test("一時音声は期限後に取得できない", () => {
  let timestamp = 1000;
  const cache = createVoiceCache({ ttlMs: 100, now: () => timestamp });
  const id = cache.put({ userId: "user-1", audio: Buffer.from("wav") });
  timestamp += 101;
  assert.equal(cache.get(id, "user-1"), null);
});

test("VOICEVOX障害時はテキスト表示へフォールバックする", async () => {
  let logged;
  const client = {
    configured: true,
    async createAudioQuery() { throw new Error("unavailable"); },
    async synthesize() { throw new Error("not reached"); }
  };
  const service = createVoiceService({ client, logger: { error(message, details) { logged = { message, details }; } }, createErrorId: () => "voice-error-test" });
  const result = await service.synthesize({ userId: "user-1", text: "質問", speaker: "青山龍星", speedScale: 1, volumeScale: 1 });
  assert.equal(result.aiResponseStatus, "text_only");
  assert.equal(result.reason, "VOICEVOX_UNAVAILABLE");
  assert.equal(result.errorStage, "audio_query");
  assert.equal(result.errorId, "voice-error-test");
  assert.equal(logged.details.errorId, "voice-error-test");
});

test("定型試聴は標準設定で一度だけ合成し、速度と音量をクライアント調整にする", async () => {
  const calls = [];
  const client = {
    configured: true,
    async createAudioQuery(input) {
      calls.push(["query", input]);
      return { speedScale: 0, volumeScale: 0 };
    },
    async synthesize(input) {
      calls.push(["synthesis", input]);
      return wavFixture(1000);
    }
  };
  const service = createVoiceService({ client, logger: { error() {} } });
  const input = {
    text: "これから面接を開始します。名前と経歴または学歴をお願いします。",
    speaker: "青山龍星",
    speedScale: 1.8,
    volumeScale: 1.6,
    preview: true
  };
  const [first, second] = await Promise.all([
    service.synthesize({ ...input, userId: "user-1" }),
    service.synthesize({ ...input, userId: "user-2" })
  ]);

  assert.equal(calls.filter(([type]) => type === "query").length, 1);
  assert.equal(calls.filter(([type]) => type === "synthesis").length, 1);
  assert.equal(calls[1][1].audioQuery.speedScale, 1);
  assert.equal(calls[1][1].audioQuery.volumeScale, 1);
  assert.equal(first.playbackAdjustment, "client");
  assert.equal(second.playbackAdjustment, "client");
});

test("同じ通常質問の読み直しではVOICEVOX生成結果を再利用する", async () => {
  let synthesisCount = 0;
  const client = {
    configured: true,
    async createAudioQuery() { return {}; },
    async synthesize() { synthesisCount += 1; return wavFixture(1000); }
  };
  const service = createVoiceService({ client, logger: { error() {} } });
  const input = { text: "自己紹介をしてください。", speaker: "No.7", speedScale: 1, volumeScale: 1 };

  await service.synthesize({ ...input, userId: "user-1" });
  await service.synthesize({ ...input, userId: "user-1" });

  assert.equal(synthesisCount, 1);
});
