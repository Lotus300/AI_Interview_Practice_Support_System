import { sendJson, sendNoContent } from "../../http.mjs";
import { createId, getDataStore, nowIso } from "../../store.mjs";
import { finishFeedbackJob } from "./service.mjs";
import { feedbackStatuses, sessionStatuses } from "../../../../../packages/shared/src/constants.mjs";
import { findOwnedSession, sendResourceError } from "../../core/resources.mjs";
import { createCloudTasksDispatcher } from "./dispatcher.mjs";
import { createTaskAuthorizer } from "./task-auth.mjs";
import { ApiError } from "../../core/errors.mjs";

async function owned(res, sessionId, userId) {
  const found = await findOwnedSession(sessionId, userId);
  if (found.error) sendResourceError(res, sendJson, found.error);
  return found;
}

export function registerFeedbackRoutes(router, {
  dispatcher = createCloudTasksDispatcher(),
  taskAuthorizer = createTaskAuthorizer(),
  runJob = finishFeedbackJob
} = {}) {
  router.add("POST", "/api/v1/interview-sessions/:sessionId/feedback", async (_req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    if (found.session.status !== sessionStatuses.FINISHED) throw new ApiError(409, "INVALID_STATE", "面接終了後にフィードバックを生成してください");
    const store = await getDataStore();
    const candidate = {
      id: createId("job"), type: "feedback_generation", sessionId: found.session.id,
      userId: ctx.user.id, status: feedbackStatuses.QUEUED, progress: 0, result: null, error: null, createdAt: nowIso(), updatedAt: nowIso()
    };
    const { job, created } = await store.createFeedbackJobIfAbsent(candidate, [feedbackStatuses.QUEUED, feedbackStatuses.RUNNING, feedbackStatuses.SUCCEEDED]);
    if (!created) return sendJson(res, 200, { job, pollingUrl: `/api/v1/jobs/${job.id}` });
    found.session.feedbackStatus = feedbackStatuses.QUEUED;
    try {
      const [task] = await Promise.all([
        dispatcher.enqueue(job),
        store.saveSessionDelta(found.session)
      ]);
      sendJson(res, 202, { job, pollingUrl: task.pollingUrl, registrationMs: task.registrationMs });
    } catch (error) {
      Object.assign(job, { status: feedbackStatuses.FAILED, error: { code: error.code || "QUEUE_ERROR", message: "ジョブの登録に失敗しました", retryable: true }, updatedAt: nowIso() });
      found.session.feedbackStatus = feedbackStatuses.FAILED;
      await Promise.all([store.saveJob(job), store.saveSessionDelta(found.session)]);
      throw error;
    }
  });

  router.add("GET", "/api/v1/interview-sessions/:sessionId/feedback", async (_req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    sendJson(res, 200, { feedbackStatus: found.session.feedbackStatus, feedback: await (await getDataStore()).getFeedback(found.session.id) });
  });

  router.add("GET", "/api/v1/jobs/:jobId", async (_req, res, ctx, params) => {
    const job = await (await getDataStore()).getJob(params.jobId);
    if (!job) return sendJson(res, 404, { code: "NOT_FOUND", message: "Job not found" });
    if (job.userId !== ctx.user.id) return sendJson(res, 403, { code: "FORBIDDEN", message: "Job does not belong to user" });
    sendJson(res, 200, { job });
  });

  router.add("POST", "/api/v1/internal/jobs/:jobId/run", async (req, res, _ctx, params) => {
    await taskAuthorizer.verify(req);
    const job = await runJob(params.jobId);
    if (!job) throw new ApiError(404, "NOT_FOUND", "Job not found");
    if (job.status === feedbackStatuses.FAILED && job.error?.retryable) throw new ApiError(503, job.error.code, job.error.message);
    sendNoContent(res);
  }, { auth: false });
}
