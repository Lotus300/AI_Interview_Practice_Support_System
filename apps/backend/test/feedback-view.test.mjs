import test from "node:test";
import assert from "node:assert/strict";
import { state } from "../../frontend/src/core/state.mjs";
import { renderFeedback } from "../../frontend/src/views/interview.mjs";

test("無回答フィードバック画面は評価不能と表示し良かった点を表示しない", () => {
  state.feedback = {
    assessmentStatus: "not_assessable",
    summary: "回答がないため評価はできません。",
    abstractPoints: ["1問以上回答してください。"],
    improvementExample: "実際の回答がないため生成していません。"
  };
  const html = renderFeedback();
  assert.match(html, /今回は評価できませんでした/);
  assert.doesNotMatch(html, /GOOD POINTS/);
});

test("回答ありフィードバック画面は評価根拠の質問と回答を表示する", () => {
  state.feedback = {
    assessmentStatus: "assessed",
    evaluatedAnswerCount: 1,
    summary: "1件の回答を評価しました。",
    goodPoints: ["数値を含めています。"],
    abstractPoints: [],
    contradictionCandidates: [],
    improvementExample: "改善例",
    evidence: [{ questionText: "成果を教えてください。", answerText: "月6時間削減しました。" }]
  };
  const html = renderFeedback();
  assert.match(html, /評価対象：1件の回答/);
  assert.match(html, /成果を教えてください。/);
  assert.match(html, /月6時間削減しました。/);
});

test("ジョブ開始失敗時も履歴確認と分析再試行を選べる", () => {
  Object.assign(state, { feedback: null, feedbackStatus: "failed", busy: false });

  const html = renderFeedback();

  assert.match(html, /フィードバックを開始できませんでした/);
  assert.match(html, /data-screen="history"/);
  assert.match(html, /data-action="retry-feedback"/);
});
