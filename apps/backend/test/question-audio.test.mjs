import test from "node:test";
import assert from "node:assert/strict";
import { createQuestionVoicePreloader, readQuestionAutomatically, shouldPrepareNextQuestion } from "../../frontend/src/features/question-audio.mjs";

test("次の質問がある場合だけ自動再生用Audioを準備する", () => {
  assert.equal(shouldPrepareNextQuestion({ answers: [], condition: { questionCount: 3 } }), true);
  assert.equal(shouldPrepareNextQuestion({ answers: [{}, {}], condition: { questionCount: 3 } }), false);
  assert.equal(shouldPrepareNextQuestion({ answers: [], condition: { questionCount: 0 } }), false);
});

test("質問文と音声設定を自動読み上げ処理へ渡す", async () => {
  const calls = [];
  const preparedPlayback = { audio: {} };
  const preparedVoice = { promise: Promise.resolve({}) };
  const result = await readQuestionAutomatically({
    question: { text: "自己紹介をしてください。" },
    settings: { speaker: "No.7", speedScale: 1.2, volumeScale: 0.9 },
    preparedPlayback,
    preparedVoice,
    synthesize: async (...args) => calls.push(args)
  });
  assert.equal(result, true);
  assert.equal(calls[0][0], "自己紹介をしてください。");
  assert.equal(calls[0][1].speaker, "No.7");
  assert.equal(calls[0][2].preparedPlayback, preparedPlayback);
  assert.equal(calls[0][2].preparedVoice, preparedVoice);
});

test("確定した質問音声を先読みし同じ質問では生成要求を再利用する", async () => {
  let requests = 0;
  let timestamp = 100;
  const preloader = createQuestionVoicePreloader({
    now: () => timestamp,
    request: async text => { requests += 1; return { text, voice: { playbackUrl: "/voice/1" } }; }
  });
  const settings = { speaker: "No.7", speedScale: 1.2, volumeScale: 1 };

  const first = preloader.prepare("質問です。", settings);
  timestamp = 350;
  const second = preloader.prepare("質問です。", settings);

  assert.equal(first, second);
  assert.deepEqual(await second.promise, { text: "質問です。", voice: { playbackUrl: "/voice/1" } });
  assert.equal(requests, 1);
  assert.equal(preloader.matches(second, "質問です。", settings), true);
  assert.equal(preloader.elapsedMs(second), 250);
});

test("音声設定または質問が変わった場合は別の先読みを開始する", async () => {
  let requests = 0;
  const preloader = createQuestionVoicePreloader({ request: async () => { requests += 1; return {}; }, now: () => 0 });
  preloader.prepare("質問1", { speaker: "No.7", speedScale: 1, volumeScale: 1 });
  preloader.prepare("質問2", { speaker: "No.7", speedScale: 1, volumeScale: 1 });
  preloader.prepare("質問2", { speaker: "青山龍星", speedScale: 1, volumeScale: 1 });
  await Promise.resolve();
  assert.equal(requests, 3);
});

test("自動再生失敗時は面接を止めず手動再生へフォールバックする", async () => {
  let failure;
  const result = await readQuestionAutomatically({
    question: { text: "質問" },
    synthesize: async () => { throw new Error("autoplay blocked"); },
    onFailure: error => { failure = error; }
  });
  assert.equal(result, false);
  assert.equal(failure.message, "autoplay blocked");
});
