import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAnswer,
  appendUtterance,
  createFeedback,
  createInitialQuestion,
  createInterviewAiService,
  createNextQuestion,
  ensureDistinctQuestion,
  finishFeedbackJob,
  interviewContext
} from "../src/services.mjs";
import { db, getDataStore, resetDb, seedInterviewSession } from "../src/store.mjs";
import { feedbackStatuses } from "../../../packages/shared/src/constants.mjs";

test.beforeEach(() => resetDb());

test("初回質問へプロフィールと職種を反映する", async () => {
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

test("生成結果が既出質問と同じ場合は異なる質問へ置き換える", () => {
  const session = {
    questions: [{ id: "q_1", text: "これまでの経験を教えてください。" }],
    condition: { theme: "総合面接" }
  };

  const question = ensureDistinctQuestion({ id: "q_2", type: "normal", text: "これまでの経験を教えてください。" }, session);

  assert.notEqual(question.text, session.questions[0].text);
  assert.equal(question.type, "fallback");
});

test("Geminiへは現在の質問を含む直近3往復だけを渡す", () => {
  const utterances = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? "user" : "ai", text: `発言${index + 1}` }));
  const parsed = JSON.parse(interviewContext({ fullName: "山田 花子", workHistory: "職歴原文" }, { condition: { jobRole: "開発" }, utterances }));

  assert.equal(parsed.profile.workHistory, "職歴原文");
  assert.equal(parsed.conversation.length, 6);
  assert.equal(parsed.conversation[0].text, "発言5");
  assert.equal(parsed.conversation.at(-1).text, "発言10");
});

test("Gemini再試行後も失敗した場合は面接を止めず深掘り質問を返す", async () => {
  const session = { questions: [{ text: "経験を教えてください。" }], condition: {}, utterances: [] };
  const warnings = [];
  const service = createInterviewAiService({
    vertex: { async generateJson() { throw Object.assign(new Error("failed"), { code: "GEMINI_EMPTY_RESPONSE", finishReason: "MAX_TOKENS" }); } },
    logger: { warn(message, details) { warnings.push({ message, details }); } }
  });

  const turn = await service.analyzeAndNext({}, session, "チームで改善しました。");

  assert.equal(turn.analysis.needsDeepDive, true);
  assert.equal(turn.nextQuestion.type, "deep_dive");
  assert.equal(warnings[0].details.finishReason, "MAX_TOKENS");
});

test("実際の質問と回答からフィードバックを生成する", async () => {
  const session = await seedInterviewSession("usr_test", { theme: "総合面接" });
  const answerText = "問い合わせ集計を自動化し、月6時間の削減を実現しました。関係者5名と手順を整理して導入しました。";
  const analysis = analyzeAnswer({}, session, answerText);
  const question = { id: "q_test", text: "業務改善の経験を教えてください。" };
  session.questions.push(question);
  session.answers.push({ id: "ans_test", questionId: question.id, text: answerText, analysis });
  appendUtterance(session, "user", answerText, "answer");

  const feedback = createFeedback(session);
  assert.equal(feedback.sessionId, session.id);
  assert.equal(feedback.assessmentStatus, "assessed");
  assert.equal(feedback.evaluatedAnswerCount, 1);
  assert.equal(feedback.evidence[0].questionText, question.text);
  assert.match(feedback.evidence[0].answerText, /月6時間/);
  assert.match(feedback.summary, /1件の回答/);
  assert.ok(feedback.goodPoints.some(item => item.includes("数値")));
  assert.equal(session.utterances[0].sequenceNo, 1);
});

test("無回答では会話内容を推測せず評価不能にする", async () => {
  const session = await seedInterviewSession("usr_test", { theme: "総合面接" });
  session.questions.push({ id: "q_test", text: "自己紹介をしてください。" });
  appendUtterance(session, "ai", "自己紹介をしてください。", "fixed_profile_check");

  const feedback = createFeedback(session);
  assert.equal(feedback.assessmentStatus, "not_assessable");
  assert.equal(feedback.evaluatedAnswerCount, 0);
  assert.deepEqual(feedback.goodPoints, []);
  assert.deepEqual(feedback.evidence, []);
  assert.match(feedback.summary, /回答が1件も送信されていない/);
  assert.doesNotMatch(feedback.summary, /経験の流れは伝わ/);
});

test("フィードバックジョブは実回答に基づく結果を保存する", async () => {
  const session = await seedInterviewSession("usr_test", { theme: "総合面接" });
  session.answers.push({
    id: "ans_test",
    text: "業務改善に取り組みました。",
    analysis: { abstractHints: [], contradictionCandidates: [] }
  });
  await (await getDataStore()).saveSession(session);
  db.jobs.set("job_test", { id: "job_test", sessionId: session.id, userId: "usr_test", status: feedbackStatuses.QUEUED });

  const job = await finishFeedbackJob("job_test", { generateFeedback: async current => createFeedback(current) });
  assert.equal(job.status, feedbackStatuses.SUCCEEDED);
  const store = await getDataStore();
  assert.equal((await store.getSession(session.id)).feedbackStatus, feedbackStatuses.SUCCEEDED);
  assert.equal((await store.getFeedback(session.id)).assessmentStatus, "assessed");
});
