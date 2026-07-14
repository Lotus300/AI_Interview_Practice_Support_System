import { api, interviewApi } from "./core/api.mjs";
import { clearInterviewState, notify, state } from "./core/state.mjs";
import { disposeRecording, startRecording, stopRecording } from "./features/recording.mjs";
import { render } from "./views/index.mjs";

async function refreshMe() {
  try {
    const { user } = await api("/auth/me");
    state.user = user;
    const [{ profile }, { settings }, { sessions }] = await Promise.all([
      api("/profile"), api("/settings"), interviewApi.list()
    ]);
    Object.assign(state, { profile, settings, sessions, screen: user.profileCompleted ? "home" : "profile" });
  } catch {
    state.user = null;
    state.screen = "login";
  }
}

async function navigate(screen) {
  state.drawerOpen = false;
  if (screen === "history" || screen === "home") state.sessions = (await interviewApi.list()).sessions;
  if (screen === "profile") state.profile = (await api("/profile")).profile;
  if (screen === "settings") state.settings = (await api("/settings")).settings;
  state.screen = screen;
}

async function handleLogin() {
  state.busy = true;
  const login = await api("/auth/google/start");
  if (login.authUrl) {
    location.href = login.authUrl;
    return;
  }
  await refreshMe();
  state.busy = false;
}

async function handleLogout() {
  disposeRecording();
  await api("/auth/logout", { method: "POST" });
  clearInterviewState();
  Object.assign(state, { user: null, profile: null, settings: null, sessions: [], screen: "login", drawerOpen: false });
}

async function synthesizeVoice(preview = false) {
  const text = preview ? "こんにちは。面接官を担当します。" : state.question?.text;
  const data = await api("/voice/synthesize", { method: "POST", body: JSON.stringify({ text, ...state.settings }) });
  notify(data.aiResponseStatus === "text_only" ? "音声エンジン未接続のため、テキスト表示で続けます。" : "音声を再生しています。", "info");
}

async function submitAnswer() {
  state.busy = true;
  render();
  const result = await interviewApi.submitAnswer(state.session.id, {
    questionId: state.question?.id,
    answerText: state.answerDraft,
    inputType: state.speechStatus === "recognized" ? "speech_corrected" : "text"
  });
  state.session.answers.push(result.answer);
  state.answerDraft = "";
  state.speechStatus = "idle";

  if (state.session.answers.length >= state.session.condition.questionCount) {
    state.screen = "finish";
    notify("設定した質問数に到達しました。面接を終了して分析できます。", "success");
  } else {
    const next = await interviewApi.nextQuestion(state.session.id);
    state.session.questions.push(next.question);
    state.question = next.question;
    notify(result.analysis.needsDeepDive ? "回答を分析し、内容を深掘りする質問を作成しました。" : "回答を保存し、次の質問へ進みました。", "success");
  }
  state.busy = false;
}

async function finishInterview() {
  state.busy = true;
  render();
  state.session = (await interviewApi.finish(state.session.id)).session;
  const { job } = await interviewApi.startFeedback(state.session.id);
  state.feedbackStatus = job.status;
  state.screen = "feedback";
  state.busy = false;
  setTimeout(loadFeedback, 500);
}

async function loadFeedback() {
  try {
    const data = await interviewApi.feedback(state.session.id);
    state.feedback = data.feedback;
    state.feedbackStatus = data.feedbackStatus;
    state.busy = false;
    render();
  } catch (error) {
    state.busy = false;
    notify(error.message, "error");
    render();
  }
}

async function openHistory(id) {
  const [{ session }, feedback] = await Promise.all([interviewApi.get(id), interviewApi.feedback(id)]);
  state.session = session;
  state.feedback = feedback.feedback;
  state.screen = "historyDetail";
}

async function deleteSession() {
  if (!confirm("この練習履歴を削除しますか？")) return;
  await interviewApi.remove(state.session.id);
  state.sessions = state.sessions.filter(item => item.id !== state.session.id);
  clearInterviewState();
  state.screen = "history";
  notify("履歴を削除しました。", "success");
}

const actionHandlers = {
  "toggle-drawer": async () => { state.drawerOpen = !state.drawerOpen; },
  "close-drawer": async () => { state.drawerOpen = false; },
  "clear-message": async () => { state.message = ""; },
  login: handleLogin,
  logout: handleLogout,
  voice: () => synthesizeVoice(false),
  "preview-voice": () => synthesizeVoice(true),
  "start-recording": () => startRecording(render),
  "stop-recording": () => stopRecording(render),
  "submit-answer": submitAnswer,
  "confirm-finish": async () => { state.screen = "finish"; },
  finish: finishInterview,
  "load-feedback": async () => { state.busy = true; await loadFeedback(); },
  "open-history": (target) => openHistory(target.dataset.id),
  "delete-session": deleteSession
};

document.addEventListener("input", event => {
  if (event.target.id === "answerDraft") {
    state.answerDraft = event.target.value;
    const submit = document.querySelector('[data-action="submit-answer"]');
    if (submit) submit.disabled = !state.answerDraft.trim() || state.busy;
  }
  if (event.target.name === "speedScale") document.querySelector("#speedOutput").value = Number(event.target.value).toFixed(1);
  if (event.target.name === "volumeScale") document.querySelector("#volumeOutput").value = Number(event.target.value).toFixed(1);
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && state.drawerOpen) {
    state.drawerOpen = false;
    render();
  }
});

document.addEventListener("click", async event => {
  const target = event.target.closest("button, [data-action]");
  if (!target) return;
  try {
    if (target.dataset.screen) await navigate(target.dataset.screen);
    const handler = actionHandlers[target.dataset.action];
    if (handler) await handler(target);
  } catch (error) {
    state.busy = false;
    notify(error.message, "error");
  }
  render();
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  state.busy = true;
  try {
    if (form.dataset.form === "profile") {
      const data = await api("/profile", { method: "PUT", body: JSON.stringify(values) });
      Object.assign(state, { profile: data.profile, user: data.user, screen: "home" });
      notify("プロフィールを保存しました。", "success");
    }
    if (form.dataset.form === "condition") {
      clearInterviewState();
      state.session = (await interviewApi.create(values)).session;
      const data = await interviewApi.initialQuestion(state.session.id);
      state.question = data.question;
      state.session.questions.push(data.question);
      state.screen = "interview";
    }
    if (form.dataset.form === "settings") {
      state.settings = (await api("/settings", { method: "PUT", body: JSON.stringify(values) })).settings;
      state.screen = "home";
      notify("音声設定を保存しました。", "success");
    }
  } catch (error) {
    notify(error.message, "error");
  } finally {
    state.busy = false;
    render();
  }
});

await refreshMe();
render();
