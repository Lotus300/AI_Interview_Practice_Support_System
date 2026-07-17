// Compatibility exports for existing imports and tests. New code should import
// directly from the corresponding feature service.
export {
  analyzeAnswer,
  appendUtterance,
  createInitialQuestion,
  createInterviewAiService,
  createNextQuestion,
  ensureDistinctQuestion,
  interviewContext
} from "./features/interviews/service.mjs";

export { createFeedback, finishFeedbackJob } from "./features/feedback/service.mjs";
