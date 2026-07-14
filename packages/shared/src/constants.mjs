export const speakerOptions = [
  { label: "青山龍星", speakerId: null },
  { label: "剣崎雌雄", speakerId: null },
  { label: "No.7", speakerId: null },
  { label: "東北イタコ", speakerId: null }
];

export const sessionStatuses = {
  CREATED: "created",
  QUESTION_GENERATING: "question_generating",
  QUESTION_PRESENTED: "question_presented",
  WAITING_ANSWER: "waiting_answer",
  RECORDING: "recording",
  SPEECH_RECOGNIZING: "speech_recognizing",
  ANSWER_CONFIRMING: "answer_confirming",
  ANSWER_ANALYZING: "answer_analyzing",
  NEXT_QUESTION_GENERATING: "next_question_generating",
  FINISH_CONFIRMING: "finish_confirming",
  FINISHED: "finished"
};

export const feedbackStatuses = {
  NOT_STARTED: "not_started",
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed"
};

export const defaultVoiceSettings = {
  speaker: "青山龍星",
  speedScale: 1.0,
  volumeScale: 1.0
};
