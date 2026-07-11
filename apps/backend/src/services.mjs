import { db, createId, nowIso } from "./store.mjs";
import { feedbackStatuses, sessionStatuses } from "../../../packages/shared/src/constants.mjs";

export function createInitialQuestion(profile, session) {
  const name = profile?.fullName || "お名前";
  const role = session.condition?.jobRole || "希望職種";
  return {
    id: createId("q"),
    type: "fixed_profile_check",
    text: `${name}さん、本日は${role}の面接練習です。まず、これまでのご経歴と今回の志望理由を簡潔に教えてください。`,
    createdAt: nowIso()
  };
}

export function analyzeAnswer(profile, session, answerText) {
  const abstractHints = [];
  if (!/[0-9０-９]/.test(answerText)) {
    abstractHints.push("成果や規模を示す数値が不足しています。");
  }
  if (answerText.length < 40) {
    abstractHints.push("回答が短く、背景・行動・結果の説明が不足しています。");
  }

  const contradictionCandidates = [];
  if (profile?.workHistory && answerText.includes("未経験")) {
    contradictionCandidates.push("登録職歴がある一方で、回答では未経験と述べています。意図の確認が必要です。");
  }

  return {
    abstractionLevel: abstractHints.length ? "high" : "medium",
    abstractHints,
    contradictionCandidates,
    needsDeepDive: abstractHints.length > 0 || contradictionCandidates.length > 0,
    recommendedFocus: abstractHints.length ? "成果を数値で補足する" : "具体例をさらに深掘りする"
  };
}

export function createNextQuestion(lastAnalysis, session) {
  const text = lastAnalysis?.needsDeepDive
    ? `先ほどの回答について、${lastAnalysis.recommendedFocus}観点でもう少し詳しく説明してください。`
    : `次に、${session.condition?.theme || "今回のテーマ"}に関連して、困難をどう乗り越えたか教えてください。`;
  return {
    id: createId("q"),
    type: lastAnalysis?.needsDeepDive ? "deep_dive" : "normal",
    text,
    createdAt: nowIso()
  };
}

export function createFeedback(session) {
  const abstractItems = session.answers.flatMap((answer) => answer.analysis.abstractHints);
  const contradictionItems = session.answers.flatMap((answer) => answer.analysis.contradictionCandidates);
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
    job.status = feedbackStatuses.FAILED;
    job.errorMessage = "Session not found";
    job.updatedAt = nowIso();
    return job;
  }
  job.status = feedbackStatuses.RUNNING;
  job.updatedAt = nowIso();
  const feedback = createFeedback(session);
  db.feedbacks.set(session.id, feedback);
  session.feedbackStatus = feedbackStatuses.SUCCEEDED;
  session.updatedAt = nowIso();
  job.status = feedbackStatuses.SUCCEEDED;
  job.result = { sessionId: session.id, feedbackId: feedback.id };
  job.updatedAt = nowIso();
  return job;
}

export function appendUtterance(session, role, text, type) {
  const utterance = {
    id: createId("utt"),
    role,
    type,
    text,
    sequenceNo: session.utterances.length + 1,
    createdAt: nowIso()
  };
  session.utterances.push(utterance);
  return utterance;
}
