import { db, createId, nowIso } from "../../store.mjs";
import { feedbackStatuses } from "../../../../../packages/shared/src/constants.mjs";

export function createFeedback(session) {
  const abstractItems = session.answers.flatMap(answer => answer.analysis.abstractHints);
  const contradictionItems = session.answers.flatMap(answer => answer.analysis.contradictionCandidates);
  return {
    id: createId("fb"),
    sessionId: session.id,
    summary: "面接全体として、経験の流れは伝わっています。成果の規模や数値を補足すると、より説得力が上がります。",
    goodPoints: ["回答の主題は一貫しています。", "改善行動を自分の言葉で説明できています。"],
    abstractPoints: abstractItems.length ? abstractItems : ["一部の回答で具体的な成果説明を追加するとさらに良くなります。"],
    contradictionCandidates: contradictionItems,
    improvementExample: "問い合わせ対応の集計を自動化し、月6時間の作業削減につなげました。その結果、確認作業に使える時間を増やせました。",
    createdAt: nowIso()
  };
}

export function finishFeedbackJob(jobId) {
  const job = db.jobs.get(jobId);
  if (!job) return null;
  const session = db.sessions.get(job.sessionId);
  if (!session) {
    Object.assign(job, { status: feedbackStatuses.FAILED, errorMessage: "Session not found", updatedAt: nowIso() });
    return job;
  }
  Object.assign(job, { status: feedbackStatuses.RUNNING, updatedAt: nowIso() });
  const feedback = createFeedback(session);
  db.feedbacks.set(session.id, feedback);
  Object.assign(session, { feedbackStatus: feedbackStatuses.SUCCEEDED, updatedAt: nowIso() });
  Object.assign(job, { status: feedbackStatuses.SUCCEEDED, result: { sessionId: session.id, feedbackId: feedback.id }, updatedAt: nowIso() });
  return job;
}
