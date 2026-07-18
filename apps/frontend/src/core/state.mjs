export const state = {
  drawerOpen: false,
  screen: "login",
  user: null,
  profile: null,
  settings: null,
  voiceSettingsDraft: null,
  sessions: [],
  historyNextCursor: null,
  session: null,
  question: null,
  answerDraft: "",
  answerSubmissionId: null,
  feedback: null,
  feedbackStatus: "not_started",
  feedbackJobId: null,
  speechStatus: "idle",
  busy: false,
  message: "",
  messageTone: "info",
  recorder: null,
  mediaStream: null,
  audioChunks: [],
  speechRecognition: null,
  speechRealtimeHasResult: false
};

export function notify(message, tone = "info") {
  state.message = message;
  state.messageTone = tone;
}

export function clearInterviewState() {
  Object.assign(state, {
    session: null,
    question: null,
    answerDraft: "",
    answerSubmissionId: null,
    feedback: null,
    feedbackStatus: "not_started",
    feedbackJobId: null,
    speechStatus: "idle",
    speechRecognition: null,
    speechRealtimeHasResult: false
  });
}
