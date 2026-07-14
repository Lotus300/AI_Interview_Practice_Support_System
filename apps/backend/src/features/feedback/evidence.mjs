export function excerpt(value, maxLength = 80) {
  const text = String(value || "").trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

export function buildFeedbackEvidence(session) {
  const questions = session.questions || [];
  const answers = session.answers || [];
  const userUtterances = (session.utterances || []).filter(item => item.role === "user");
  const questionById = new Map(questions.map(question => [question.id, question]));

  return answers
    .filter(answer => String(answer.text || "").trim())
    .map((answer, index) => {
      const question = questionById.get(answer.questionId) || questions[index] || null;
      const utterance = userUtterances.find(item => item.text === answer.text) || userUtterances[index] || null;
      return {
        answerId: answer.id || null,
        answerUtteranceId: utterance?.id || null,
        questionId: question?.id || answer.questionId || null,
        questionText: question?.text || "対応する質問を特定できませんでした。",
        answerText: String(answer.text).trim(),
        analysis: answer.analysis || {}
      };
    });
}
