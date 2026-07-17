import { createId, nowIso } from "../../store.mjs";
import { createVertexClient } from "./vertex-client.mjs";

export function createInitialQuestion(profile, session) {
  const name = profile?.fullName || "応募者";
  const role = session.condition?.jobRole || "希望職種";
  return {
    id: createId("q"),
    type: "fixed_profile_check",
    text: `${name}さん、本日は${role}の面接練習です。まず、これまでのご経歴と今回の志望理由を簡潔に教えてください。`,
    createdAt: nowIso()
  };
}

export function analyzeAnswer(profile, _session, answerText) {
  const abstractHints = [];
  if (!/[0-9０-９]/.test(answerText)) abstractHints.push("成果や規模を示す数値が不足しています。");
  if (answerText.length < 40) abstractHints.push("回答が短く、背景・行動・結果の説明が不足しています。");

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
  return ensureDistinctQuestion({ id: createId("q"), type: lastAnalysis?.needsDeepDive ? "deep_dive" : "normal", text, createdAt: nowIso() }, session);
}

const fallbackQuestionTexts = [
  "直前の回答で、あなた自身が担当した部分と具体的な行動を教えてください。",
  "その経験で最も難しかった点と、解決のために工夫したことを教えてください。",
  "その取り組みの結果を、数値や周囲の反応を含めて教えてください。",
  "その経験から得た学びを、希望する仕事でどのように活かしますか。",
  "周囲と意見が異なった場面で、どのように合意形成したか教えてください。",
  "期限や制約がある中で、優先順位をどのように決めましたか。",
  "失敗や想定外の問題が起きたとき、どのように立て直しましたか。",
  "自分の強みが最も発揮された具体的な場面を教えてください。",
  "今後さらに伸ばしたい能力と、そのために取り組んでいることを教えてください。",
  "入社後に実現したいことと、その理由を具体的に教えてください。"
];

function normalizeQuestion(text) {
  return String(text || "").normalize("NFKC").toLowerCase().replace(/[\s、。！？!?・「」『』（）()［］\[\]]/g, "");
}

function isQuestionUsed(session, text) {
  const normalized = normalizeQuestion(text);
  return !normalized || session.questions?.some(question => normalizeQuestion(question.text) === normalized);
}

export function ensureDistinctQuestion(question, session) {
  if (!isQuestionUsed(session, question?.text)) return question;

  const start = Math.max(0, (session.questions?.length || 1) - 1);
  for (let offset = 0; offset < fallbackQuestionTexts.length; offset += 1) {
    const text = fallbackQuestionTexts[(start + offset) % fallbackQuestionTexts.length];
    if (!isQuestionUsed(session, text)) return { ...question, type: "fallback", text };
  }

  return {
    ...question,
    type: "fallback",
    text: `${(session.questions?.length || 0) + 1}つ目の観点として、これまでの回答とは異なる経験から、あなたの判断と行動を教えてください。`
  };
}

export function appendUtterance(session, role, text, type) {
  const utterance = { id: createId("utt"), role, type, text, sequenceNo: session.utterances.length + 1, createdAt: nowIso() };
  session.utterances.push(utterance);
  return utterance;
}

const textSchema = { type: "OBJECT", properties: { text: { type: "STRING" }, type: { type: "STRING" } }, required: ["text", "type"] };
const analysisSchema = {
  type: "OBJECT",
  properties: {
    abstractionLevel: { type: "STRING", enum: ["low", "medium", "high"] },
    abstractHints: { type: "ARRAY", items: { type: "STRING" } },
    contradictionCandidates: { type: "ARRAY", items: { type: "STRING" } },
    needsDeepDive: { type: "BOOLEAN" },
    recommendedFocus: { type: "STRING" }
  },
  required: ["abstractionLevel", "abstractHints", "contradictionCandidates", "needsDeepDive", "recommendedFocus"]
};

function context(profile, session) {
  return JSON.stringify({ profile, condition: session.condition, conversation: session.utterances?.map(item => ({ role: item.role, text: item.text })) || [] });
}

export function createInterviewAiService({ vertex = createVertexClient() } = {}) {
  const systemInstruction = "あなたは日本語の面接練習を支援する面接官です。入力データだけを根拠にし、個人情報を推測せず、矛盾は断定せず確認候補として扱ってください。JSONスキーマに従ってください。";
  return {
    async initialQuestion(profile, session) {
      const result = await vertex.generateJson({
        systemInstruction,
        responseSchema: textSchema,
        prompt: `次のプロフィールと面接条件に合う最初の質問を1つ作成してください。経歴と志望理由を自然に確認してください。\n${context(profile, session)}`
      });
      return { id: createId("q"), type: result.type || "initial", text: result.text, createdAt: nowIso() };
    },
    async analyze(profile, session, answerText) {
      return vertex.generateJson({
        systemInstruction,
        responseSchema: analysisSchema,
        prompt: `直前の質問と回答を分析してください。数値の有無だけで機械的に断定せず、具体性と整合性を評価してください。\n回答: ${JSON.stringify(answerText)}\n${context(profile, session)}`
      });
    },
    async nextQuestion(profile, session) {
      const result = await vertex.generateJson({
        systemInstruction,
        responseSchema: textSchema,
        prompt: `会話の直前の回答に関連する第${session.questions.length + 1}問を1つ作成してください。過去に提示した質問と同じ文面や同じ論点を繰り返さず、必要なら直前の回答を深掘りしてください。\n${context(profile, session)}`
      });
      return ensureDistinctQuestion({ id: createId("q"), type: result.type || "normal", text: result.text, createdAt: nowIso() }, session);
    }
  };
}

export function createDeterministicInterviewAiService() {
  return {
    initialQuestion: async (profile, session) => createInitialQuestion(profile, session),
    analyze: async (profile, session, answerText) => analyzeAnswer(profile, session, answerText),
    nextQuestion: async (_profile, session) => createNextQuestion(session.answers.at(-1)?.analysis, session)
  };
}
