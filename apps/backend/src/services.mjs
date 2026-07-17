// Compatibility exports for existing imports and tests. New code should import
// directly from the corresponding feature service.
export {
  analyzeAnswer,
  appendUtterance,
  createInitialQuestion,
  createNextQuestion,
  ensureDistinctQuestion
} from "./features/interviews/service.mjs";

export { createFeedback, finishFeedbackJob } from "./features/feedback/service.mjs";
