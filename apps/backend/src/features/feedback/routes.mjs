import { sendJson } from "../../http.mjs";
import { createId, getDataStore, nowIso } from "../../store.mjs";
import { finishFeedbackJob } from "./service.mjs";
import { feedbackStatuses } from "../../../../../packages/shared/src/constants.mjs";
import { findOwnedSession, sendResourceError } from "../../core/resources.mjs";

async function owned(res, sessionId, userId) {
  const found = await findOwnedSession(sessionId, userId);
  if (found.error) sendResourceError(res, sendJson, found.error);
  return found;
}

export function registerFeedbackRoutes(router) {
  router.add("POST", "/api/v1/interview-sessions/:sessionId/feedback", async (_req, res, ctx, params) => {
    const found = await owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    const store = await getDataStore();
    const existing = await store.findActiveFeedbackJob(found.session.id, [feedbackStatuses.QUEUED, feedbackStatuses.RUNNING, feedbackStatuses.SUCCEEDED]);
    if (existing) return sendJson(res, 200, { job: existing });
    const job = {
      id: createId("job"), type: "feedback_generation", sessionId: found.session.id,
      userId: ctx.user.id, status: feedbackStatuses.QUEUED, createdAt: nowIso(), updatedAt: nowIso()
    };
    await store.saveJob(job);
    found.session.feedbackStatus = feedbackStatuses.QUEUED;
    await store.saveSession(found.session);
    const completedJob = await finishFeedbackJob(job.id);
    sendJson(res, 202, { job: completedJob });
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
}
