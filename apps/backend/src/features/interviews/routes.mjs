import { readJson, sendJson, sendNoContent } from "../../http.mjs";
import { createId, getDataStore, nowIso, seedInterviewSession } from "../../store.mjs";
import { analyzeAnswer, appendUtterance, createInitialQuestion, createNextQuestion } from "./service.mjs";
import { sessionStatuses } from "../../../../../packages/shared/src/constants.mjs";
import { findOwnedSession, sendResourceError } from "../../core/resources.mjs";
import { numberInRange, optionalText, requireText } from "../../core/validation.mjs";
import { ApiError } from "../../core/errors.mjs";

async function owned(res, sessionId, userId) {
  const found = await findOwnedSession(sessionId, userId);
  if (found.error) sendResourceError(res, sendJson, found.error);
  return found;
}

export function registerInterviewRoutes(router) {
  router.add("GET", "/api/v1/interview-sessions", async (_req, res, ctx) => {
    const sessions = await (await getDataStore()).listSessions(ctx.user.id);
    sendJson(res, 200, { sessions });
  });

  router.add("POST", "/api/v1/interview-sessions", async (req, res, ctx) => {
    const body = await readJson(req);
    const session = await seedInterviewSession(ctx.user.id, {
      interviewType: optionalText(body.interviewType || "転職活動", 100),
      jobRole: requireText(body.jobRole, "職種", 100),
      industry: requireText(body.industry, "業界", 100),
      companyName: optionalText(body.companyName, 200),
      theme: optionalText(body.theme || "総合面接", 100),
      questionCount: numberInRange(body.questionCount, "質問数", 1, 20, 10)
    });
    sendJson(res, 201, { session });
  });

  router.add("GET", "/api/v1/interview-sessions/:sessionId", async (_req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    sendJson(res, 200, { session: found.session });
  });

  router.add("DELETE", "/api/v1/interview-sessions/:sessionId", async (_req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    found.session.deletedAt = nowIso();
    found.session.updatedAt = nowIso();
    await (await getDataStore()).saveSession(found.session);
    sendNoContent(res);
  });

  router.add("POST", "/api/v1/interview-sessions/:sessionId/initial-question", async (_req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    if (found.session.questions.length) {
      return sendJson(res, 200, { question: found.session.questions.at(-1), sessionStatus: found.session.status });
    }
    const store = await getDataStore();
    const question = createInitialQuestion(await store.getProfile(ctx.user.id), found.session);
    found.session.questions.push(question);
    appendUtterance(found.session, "ai", question.text, question.type);
    found.session.status = sessionStatuses.WAITING_ANSWER;
    found.session.updatedAt = nowIso();
    await store.saveSession(found.session);
    sendJson(res, 200, { question, sessionStatus: found.session.status });
  });

  router.add("POST", "/api/v1/interview-sessions/:sessionId/answers", async (req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    const body = await readJson(req);
    const text = requireText(body.answerText ?? body.transcript, "回答", 8000);
    const store = await getDataStore();
    const analysis = analyzeAnswer(await store.getProfile(ctx.user.id), found.session, text);
    const answer = {
      id: createId("ans"),
      questionId: body.questionId ?? found.session.questions.at(-1)?.id,
      text,
      inputType: body.inputType ?? "text",
      speechTranscriptConfidence: body.confidence ?? null,
      analysis,
      createdAt: nowIso()
    };
    found.session.answers.push(answer);
    appendUtterance(found.session, "user", text, "answer");
    found.session.status = sessionStatuses.ANSWER_ANALYZING;
    found.session.updatedAt = nowIso();
    await store.saveSession(found.session);
    sendJson(res, 200, { answer, analysis, sessionStatus: found.session.status });
  });

  router.add("POST", "/api/v1/interview-sessions/:sessionId/next-question", async (_req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    if (!found.session.answers.length) throw new ApiError(409, "INVALID_STATE", "回答を送信してから次の質問へ進んでください");
    const question = createNextQuestion(found.session.answers.at(-1).analysis, found.session);
    found.session.questions.push(question);
    appendUtterance(found.session, "ai", question.text, question.type);
    found.session.status = sessionStatuses.WAITING_ANSWER;
    found.session.updatedAt = nowIso();
    await (await getDataStore()).saveSession(found.session);
    sendJson(res, 200, { question, sessionStatus: found.session.status });
  });

  router.add("POST", "/api/v1/interview-sessions/:sessionId/finish", async (_req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    found.session.status = sessionStatuses.FINISHED;
    found.session.finishedAt = nowIso();
    found.session.updatedAt = nowIso();
    await (await getDataStore()).saveSession(found.session);
    sendJson(res, 200, { session: found.session });
  });
}
