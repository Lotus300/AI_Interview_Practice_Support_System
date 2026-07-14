export const state = {
  drawerOpen: false,
  screen: "login",
  user: null,
  profile: null,
  settings: null,
  sessions: [],
  session: null,
  question: null,
  answerDraft: "",
  feedback: null,
  feedbackStatus: "not_started",
  speechStatus: "idle",
  busy: false,
  message: "",
  messageTone: "info",
  recorder: null,
  mediaStream: null,
  audioChunks: []
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
    feedback: null,
    feedbackStatus: "not_started",
    speechStatus: "idle"
  });
}
