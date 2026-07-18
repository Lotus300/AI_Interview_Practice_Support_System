import { createId, getDataStore, nowIso } from "../../store.mjs";
import { feedbackStatuses } from "../../../../../packages/shared/src/constants.mjs";
import { buildFeedbackEvidence, excerpt } from "./evidence.mjs";
import { createVertexClient } from "../interviews/vertex-client.mjs";

function noAnswerFeedback(session) {
  return {
    id: createId("fb"),
    sessionId: session.id,
    assessmentStatus: "not_assessable",
    evaluatedAnswerCount: 0,
    summary: "回答が1件も送信されていないため、面接官との会話内容に基づく評価はできません。",
    goodPoints: [],
    abstractPoints: [
      "まずは質問に対して短くても回答し、面接官とのやり取りを成立させましょう。",
      "回答は「状況・自分の役割・行動・結果」の順に整理すると伝えやすくなります。"
    ],
    contradictionCandidates: [],
    improvementExample: "実際の回答がないため、回答内容を根拠とした改善例は生成していません。次回は1問以上回答してからフィードバックを確認してください。",
    evidence: [],
    createdAt: nowIso()
  };
}

function evidenceLabel(item, index) {
  return `回答${index + 1}「${excerpt(item.answerText)}」`;
}

function goodPointsFromEvidence(evidence) {
  const points = [];
  const numeric = evidence.find(item => /[0-9０-９]/.test(item.answerText));
  if (numeric) points.push(`${evidenceLabel(numeric, evidence.indexOf(numeric))}では、数値を含めて説明しています。`);
  const detailed = evidence.find(item => item.answerText.length >= 40);
  if (detailed) points.push(`${evidenceLabel(detailed, evidence.indexOf(detailed))}では、一定の情報量で経験を説明しています。`);
  if (!points.length) points.push(`${evidence.length}件の質問に対して実際に回答を送信できています。`);
  return points;
}

function improvementExampleFromEvidence(evidence) {
  const first = evidence[0];
  return `元の回答「${excerpt(first.answerText, 120)}」に、状況、自分の役割、具体的な行動、数値で示せる結果を加えてください。例：「私は［状況］で［役割］を担当し、［具体的な行動］を行いました。その結果、［数値を含む成果］につながりました。」`;
}

export function createFeedback(session) {
  const evidence = buildFeedbackEvidence(session);
  if (!evidence.length) return noAnswerFeedback(session);

  const abstractPoints = evidence.flatMap((item, index) =>
    (item.analysis.abstractHints || []).map(hint => `${evidenceLabel(item, index)}: ${hint}`)
  );
  const contradictionCandidates = evidence.flatMap((item, index) =>
    (item.analysis.contradictionCandidates || []).map(candidate => `${evidenceLabel(item, index)}: ${candidate}`)
  );
  const numericAnswerCount = evidence.filter(item => /[0-9０-９]/.test(item.answerText)).length;
  const summaryParts = [`実際に送信された${evidence.length}件の回答と、それに対応する質問をもとに評価しました。`];
  if (numericAnswerCount) summaryParts.push(`${numericAnswerCount}件の回答では数値を使った説明が確認できました。`);
  if (abstractPoints.length) summaryParts.push(`${abstractPoints.length}件の改善候補があり、背景・行動・結果を具体化するとさらに伝わりやすくなります。`);
  else summaryParts.push("回答分析では大きな抽象表現の指摘はありませんでした。");

  return {
    id: createId("fb"),
    sessionId: session.id,
    assessmentStatus: "assessed",
    evaluatedAnswerCount: evidence.length,
    summary: summaryParts.join(""),
    goodPoints: goodPointsFromEvidence(evidence),
    abstractPoints,
    contradictionCandidates,
    improvementExample: improvementExampleFromEvidence(evidence),
    evidence: evidence.map(({ analysis, ...item }) => item),
    createdAt: nowIso()
  };
}

const feedbackSchema = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    goodPoints: { type: "ARRAY", items: { type: "STRING" } },
    abstractPoints: { type: "ARRAY", items: { type: "STRING" } },
    contradictionCandidates: { type: "ARRAY", items: { type: "STRING" } },
    improvementExample: { type: "STRING" }
  },
  required: ["summary", "goodPoints", "abstractPoints", "contradictionCandidates", "improvementExample"]
};

export function createVertexFeedbackGenerator({ vertex = createVertexClient() } = {}) {
  return async session => {
    const evidence = buildFeedbackEvidence(session);
    if (!evidence.length) return noAnswerFeedback(session);
    const result = await vertex.generateJson({
      systemInstruction: "あなたは日本語の面接練習フィードバック担当です。実際の質問と回答だけを根拠にしてください。入力にない実績、数値、感情、話し方を捏造しないでください。矛盾は断定せず確認候補として表現してください。",
      responseSchema: feedbackSchema,
      maxOutputTokens: 4096,
      prompt: `次の面接条件、プロフィール、質問と回答から具体的なフィードバックを作成してください。\n${JSON.stringify({ condition: session.condition, evidence })}`
    });
    return {
      id: createId("fb"), sessionId: session.id, assessmentStatus: "assessed", evaluatedAnswerCount: evidence.length,
      ...result, evidence: evidence.map(({ analysis, ...item }) => item), createdAt: nowIso()
    };
  };
}

export async function finishFeedbackJob(jobId, { generateFeedback = createVertexFeedbackGenerator() } = {}) {
  const store = await getDataStore();
  const job = await store.getJob(jobId);
  if (!job) return null;
  if (job.status === feedbackStatuses.SUCCEEDED) return job;
  const session = await store.getSession(job.sessionId);
  if (!session || session.userId !== job.userId) {
    Object.assign(job, { status: feedbackStatuses.FAILED, progress: 100, error: { code: "SESSION_NOT_FOUND", message: "Session not found", retryable: false }, updatedAt: nowIso() });
    await store.saveJob(job);
    return job;
  }
  Object.assign(job, { status: feedbackStatuses.RUNNING, progress: 10, startedAt: job.startedAt || nowIso(), updatedAt: nowIso(), error: null });
  await store.saveJob(job);
  try {
    job.progress = 30;
    await store.saveJob(job);
    const feedback = await generateFeedback(session);
    feedback.userId = job.userId;
    job.progress = 80;
    await store.saveJob(job);
    Object.assign(session, { feedbackStatus: feedbackStatuses.SUCCEEDED, summary: feedback.summary, updatedAt: nowIso() });
    Object.assign(job, { status: feedbackStatuses.SUCCEEDED, progress: 100, result: { sessionId: session.id, feedbackId: feedback.id }, completedAt: nowIso(), updatedAt: nowIso() });
    await Promise.all([store.saveFeedback(feedback), store.saveSessionDelta(session), store.saveJob(job)]);
  } catch (error) {
    Object.assign(session, { feedbackStatus: feedbackStatuses.FAILED, updatedAt: nowIso() });
    Object.assign(job, { status: feedbackStatuses.FAILED, progress: 100, error: { code: error.code || "FEEDBACK_GENERATION_FAILED", message: "フィードバック生成に失敗しました", retryable: true }, updatedAt: nowIso() });
    await Promise.all([store.saveSessionDelta(session), store.saveJob(job)]);
  }
  return job;
}
