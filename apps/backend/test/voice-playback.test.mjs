import test from "node:test";
import assert from "node:assert/strict";
import { configurePreviewPlayback, createAudioForPlayback, prepareAutoplayPlayback } from "../../frontend/src/features/voice-playback.mjs";

test("定型音声の話速と1以下の音量をブラウザ再生へ反映する", () => {
  const audio = {};
  const context = configurePreviewPlayback(audio, { speedScale: 1.7, volumeScale: 0.6 });
  assert.equal(audio.playbackRate, 1.7);
  assert.equal(audio.preservesPitch, true);
  assert.equal(audio.volume, 0.6);
  assert.equal(context, null);
});

test("1を超える音量はWeb AudioのGainNodeで増幅する", () => {
  const connections = [];
  const source = { connect(node) { connections.push(node); return node; } };
  const gain = { gain: { value: 1 }, connect(node) { connections.push(node); return node; } };
  const context = {
    destination: {},
    createMediaElementSource() { return source; },
    createGain() { return gain; }
  };
  const audio = {};
  const result = configurePreviewPlayback(audio, { speedScale: 1.2, volumeScale: 1.8 }, { createAudioContext: () => context });
  assert.equal(result, context);
  assert.equal(gain.gain.value, 1.8);
  assert.equal(connections.at(-1), context.destination);
});

test("ユーザー操作中に無音Audioを再生して自動再生を準備する", async () => {
  const events = [];
  const audio = {
    currentTime: 1,
    play() { events.push("play"); return Promise.resolve(); },
    pause() { events.push("pause"); }
  };
  const prepared = prepareAutoplayPlayback({ createAudio: () => audio });
  assert.deepEqual(events, ["play"]);
  assert.match(audio.src, /^data:audio\/wav;base64,/);
  assert.equal(await prepared.ready, true);
  assert.deepEqual(events, ["play", "pause"]);
  assert.equal(audio.currentTime, 0);
});

test("準備済みAudio要素へ質問音声URLを設定して再利用する", async () => {
  const audio = { currentTime: 4, muted: true, pause() {} };
  const result = await createAudioForPlayback("/api/v1/voice/playback/test", { audio, ready: Promise.resolve(true) });
  assert.equal(result, audio);
  assert.equal(audio.src, "/api/v1/voice/playback/test");
  assert.equal(audio.currentTime, 0);
  assert.equal(audio.muted, false);
});
