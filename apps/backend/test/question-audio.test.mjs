import test from "node:test";
import assert from "node:assert/strict";
import { readQuestionAutomatically, shouldPrepareNextQuestion } from "../../frontend/src/features/question-audio.mjs";

test("次の質問がある場合だけ自動再生用Audioを準備する", () => {
  assert.equal(shouldPrepareNextQuestion({ answers: [], condition: { questionCount: 3 } }), true);
  assert.equal(shouldPrepareNextQuestion({ answers: [{}, {}], condition: { questionCount: 3 } }), false);
  assert.equal(shouldPrepareNextQuestion({ answers: [], condition: { questionCount: 0 } }), false);
});

test("質問文と音声設定を自動読み上げ処理へ渡す", async () => {
  const calls = [];
  const preparedPlayback = { audio: {} };
  const result = await readQuestionAutomatically({
    question: { text: "自己紹介をしてください。" },
    settings: { speaker: "No.7", speedScale: 1.2, volumeScale: 0.9 },
    preparedPlayback,
    synthesize: async (...args) => calls.push(args)
  });
  assert.equal(result, true);
  assert.equal(calls[0][0], "自己紹介をしてください。");
  assert.equal(calls[0][1].speaker, "No.7");
  assert.equal(calls[0][2].preparedPlayback, preparedPlayback);
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
