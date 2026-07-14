import test from "node:test";
import assert from "node:assert/strict";
import { configurePreviewPlayback } from "../../frontend/src/features/voice-playback.mjs";

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
