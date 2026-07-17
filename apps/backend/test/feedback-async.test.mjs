import test from "node:test";
import assert from "node:assert/strict";
import { getDataStore, resetDb, seedInterviewSession } from "../src/store.mjs";
import { createFeedback, finishFeedbackJob } from "../src/features/feedback/service.mjs";
import { feedbackStatuses } from "../../../packages/shared/src/constants.mjs";

test.beforeEach(() => resetDb());

test("同一ユーザ・セッションのactiveフィードバックジョブを一つにする", async () => {
  const store = await getDataStore();
  const first = { id: "job_1", sessionId: "session_1", userId: "user_1", status: feedbackStatuses.QUEUED, updatedAt: new Date().toISOString() };
  const second = { ...first, id: "job_2" };
  assert.equal((await store.createFeedbackJobIfAbsent(first, [feedbackStatuses.QUEUED])).created, true);
  const duplicate = await store.createFeedbackJobIfAbsent(second, [feedbackStatuses.QUEUED]);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.job.id, "job_1");
});

test("ジョブ所有者とセッション所有者が違う場合は生成しない", async () => {
  const session = await seedInterviewSession("user_a", { theme: "総合面接" });
  const store = await getDataStore();
  await store.saveJob({ id: "job_wrong", sessionId: session.id, userId: "user_b", status: feedbackStatuses.QUEUED });
  const job = await finishFeedbackJob("job_wrong", { generateFeedback: async current => createFeedback(current) });
  assert.equal(job.status, feedbackStatuses.FAILED);
  assert.equal(job.error.retryable, false);
  assert.equal(await store.getFeedback(session.id), null);
});

test("完了済みジョブの再実行はフィードバックを再生成しない", async () => {
  const session = await seedInterviewSession("user_a", { theme: "総合面接" });
  const store = await getDataStore();
  await store.saveSession(session);
  await store.saveJob({ id: "job_done", sessionId: session.id, userId: "user_a", status: feedbackStatuses.SUCCEEDED });
  let calls = 0;
  const job = await finishFeedbackJob("job_done", { generateFeedback: async current => { calls += 1; return createFeedback(current); } });
  assert.equal(job.status, feedbackStatuses.SUCCEEDED);
  assert.equal(calls, 0);
});
