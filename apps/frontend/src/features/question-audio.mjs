export function shouldPrepareNextQuestion(session) {
  const answered = session?.answers?.length || 0;
  const total = Number(session?.condition?.questionCount || 0);
  return total > 0 && answered + 1 < total;
}

export async function readQuestionAutomatically({ question, settings, preparedPlayback, synthesize, onFailure }) {
  if (!question?.text) return false;
  try {
    await synthesize(question.text, settings, { preparedPlayback });
    return true;
  } catch (error) {
    onFailure?.(error);
    return false;
  }
}
