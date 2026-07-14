import { sendJson } from "../../http.mjs";
import { db, createId, nowIso } from "../../store.mjs";
import { finishFeedbackJob } from "./service.mjs";
import { feedbackStatuses } from "../../../../../packages/shared/src/constants.mjs";
import { findOwnedSession, sendResourceError } from "../../core/resources.mjs";

function owned(res, sessionId, userId) {
  const found = findOwnedSession(sessionId, userId);
  if (found.error) sendResourceError(res, sendJson, found.error);
  return found;
}

export function registerFeedbackRoutes(router) {
  router.add("POST", "/api/v1/interview-sessions/:sessionId/feedback", async (_req, res, ctx, params) => {
    const found = owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    const existing = [...db.jobs.values()].find(job => job.sessionId === found.session.id && [feedbackStatuses.QUEUED, feedbackStatuses.RUNNING, feedbackStatuses.SUCCEEDED].includes(job.status));
    if (existing) return sendJson(res, 200, { job: existing });
    const job = {
      id: createId("job"), type: "feedback_generation", sessionId: found.session.id,
      userId: ctx.user.id, status: feedbackStatuses.QUEUED, createdAt: nowIso(), updatedAt: nowIso()
    };
    db.jobs.set(job.id, job);
    found.session.feedbackStatus = feedbackStatuses.QUEUED;
    finishFeedbackJob(job.id);
    sendJson(res, 202, { job: db.jobs.get(job.id) });
  });

  router.add("GET", "/api/v1/interview-sessions/:sessionId/feedback", async (_req, res, ctx, params) => {
    const found = owned(res, params.sessionId, ctx.user.id);
    if (!found.session) return;
    sendJson(res, 200, { feedbackStatus: found.session.feedbackStatus, feedback: db.feedbacks.get(found.session.id) ?? null });
  });

  router.add("GET", "/api/v1/jobs/:jobId", async (_req, res, ctx, params) => {
    const job = db.jobs.get(params.jobId);
    if (!job) return sendJson(res, 404, { code: "NOT_FOUND", message: "Job not found" });
    if (job.userId !== ctx.user.id) return sendJson(res, 403, { code: "FORBIDDEN", message: "Job does not belong to user" });
    sendJson(res, 200, { job });
  });
}
