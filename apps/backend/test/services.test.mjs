import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAnswer,
  appendUtterance,
  createFeedback,
  createInitialQuestion,
  createNextQuestion,
  finishFeedbackJob
} from "../src/services.mjs";
import { db, getDataStore, resetDb, seedInterviewSession } from "../src/store.mjs";
import { feedbackStatuses } from "../../../packages/shared/src/constants.mjs";

test.beforeEach(() => resetDb());

test("初回質問はプロフィールと職種を反映する", async () => {
  const session = await seedInterviewSession("usr_test", { jobRole: "データエンジニア" });
  const question = createInitialQuestion({ fullName: "山田 花子" }, session);
  assert.match(question.text, /山田 花子さん/);
  assert.match(question.text, /データエンジニア/);
  assert.equal(question.type, "fixed_profile_check");
});

test("短く数値のない回答は深掘り対象になる", () => {
  const analysis = analyzeAnswer({}, {}, "チームで改善しました。");
  assert.equal(analysis.needsDeepDive, true);
  assert.equal(analysis.abstractionLevel, "high");
  assert.equal(analysis.abstractHints.length, 2);
  assert.equal(createNextQuestion(analysis, { condition: {} }).type, "deep_dive");
});

test("具体的な回答からフィードバックを生成できる", async () => {
  const session = await seedInterviewSession("usr_test", { theme: "総合面接" });
  const analysis = analyzeAnswer({}, session, "問い合わせ集計を自動化し、月6時間の削減を実現しました。関係者3名と手順を整理して導入しました。");
  session.answers.push({ analysis });
  appendUtterance(session, "user", "回答", "answer");
  const feedback = createFeedback(session);
  assert.equal(feedback.sessionId, session.id);
  assert.ok(feedback.goodPoints.length >= 1);
  assert.equal(session.utterances[0].sequenceNo, 1);
});

test("フィードバックジョブは完了状態と結果を保存する", async () => {
  const session = await seedInterviewSession("usr_test", { theme: "総合面接" });
  session.answers.push({ analysis: { abstractHints: [], contradictionCandidates: [] } });
  db.jobs.set("job_test", { id: "job_test", sessionId: session.id, status: feedbackStatuses.QUEUED });
  const job = await finishFeedbackJob("job_test");
  assert.equal(job.status, feedbackStatuses.SUCCEEDED);
  const store = await getDataStore();
  assert.equal((await store.getSession(session.id)).feedbackStatus, feedbackStatuses.SUCCEEDED);
  assert.equal((await store.getFeedback(session.id)).sessionId, session.id);
});
