import { api, interviewApi, resolveApiResource } from "./core/api.mjs";
import { clearInterviewState, notify, state } from "./core/state.mjs";
import { hasClickCommand } from "./core/events.mjs";
import { disposeRecording, startRecording, stopRecording } from "./features/recording.mjs";
import { previewTextForControl, readVoiceSettings, voicePreviewTexts } from "./features/voice-preview.mjs";
import { configurePreviewPlayback, createAudioForPlayback, prepareAutoplayPlayback } from "./features/voice-playback.mjs";
import { readQuestionAutomatically, shouldPrepareNextQuestion } from "./features/question-audio.mjs";
import { render } from "./views/index.mjs";

async function refreshMe() {
  try {
    const { user } = await api("/auth/me");
    state.user = user;
    const [{ profile }, { settings }, { sessions }] = await Promise.all([
      api("/profile"), api("/settings"), interviewApi.list()
    ]);
    const hasSavedProfile = Boolean(profile);
    Object.assign(state, {
      profile,
      settings,
      sessions,
      user: hasSavedProfile ? { ...user, profileCompleted: true } : user,
      screen: user.profileCompleted || hasSavedProfile ? "home" : "profile"
    });
  } catch {
    state.user = null;
    state.screen = "login";
  }
}

async function navigate(screen) {
  if (screen !== "feedback") feedbackPollingGeneration += 1;
  state.drawerOpen = false;
  if (screen !== "settings") state.voiceSettingsDraft = null;
  if (screen === "history" || screen === "home") state.sessions = (await interviewApi.list()).sessions;
  if (screen === "profile") {
    const { profile } = await api("/profile");
    state.profile = profile;
    if (profile && state.user) state.user = { ...state.user, profileCompleted: true };
  }
  if (screen === "settings") {
    state.settings = (await api("/settings")).settings;
    state.voiceSettingsDraft = { ...state.settings };
  }
  state.screen = screen;
}

let feedbackPollingGeneration = 0;
const feedbackPollingIntervalMs = 3000;

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
  Object.assign(state, { user: null, profile: null, settings: null, voiceSettingsDraft: null, sessions: [], screen: "login", drawerOpen: false });
}

let activeVoicePlayback = null;
let latestPreviewRequest = 0;

async function synthesizeVoice(text, settings = state.settings, { preview = false, preparedPlayback = null } = {}) {
  if (!text) return;
  const previewRequest = preview ? ++latestPreviewRequest : null;
  const data = await api("/voice/synthesize", { method: "POST", body: JSON.stringify({ text, ...settings, preview }) });
  if (preview && previewRequest !== latestPreviewRequest) return;
  if (data.aiResponseStatus === "text_only") {
    const reference = data.errorId ? `（エラーID: ${data.errorId}）` : "";
    notify(`音声を生成できなかったため、テキスト表示で続けます。${reference}`, "info");
    return;
  }
  if (data.voice?.playbackUrl) {
    activeVoicePlayback?.audio.pause();
    await activeVoicePlayback?.context?.close();
    const audio = await createAudioForPlayback(resolveApiResource(data.voice.playbackUrl), preparedPlayback);
    const context = preview ? configurePreviewPlayback(audio, settings) : null;
    await context?.resume();
    activeVoicePlayback = { audio, context };
    await audio.play();
  }
  notify("音声を再生しています。", "info");
}

async function submitAnswer() {
  const preparedQuestionPlayback = shouldPrepareNextQuestion(state.session) ? prepareAutoplayPlayback() : null;
  let nextQuestionToRead = null;
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

  if (result.limitReached || state.session.answers.length >= state.session.condition.questionCount) {
    state.screen = "finish";
    notify("設定した質問数に到達しました。面接を終了して分析できます。", "success");
  } else {
    const next = result.nextQuestion
      ? { question: result.nextQuestion, sessionStatus: "waiting_answer" }
      : await interviewApi.nextQuestion(state.session.id);
    if (next.limitReached || !next.question) {
      state.screen = "finish";
      notify("設定した質問数に到達しました。面接を終了して分析できます。", "success");
      state.busy = false;
      render();
      return;
    }
    state.session.questions.push(next.question);
    state.question = next.question;
    nextQuestionToRead = next.question;
    notify(result.analysis.needsDeepDive ? "回答を分析し、内容を深掘りする質問を作成しました。" : "回答を保存し、次の質問へ進みました。", "success");
  }
  state.busy = false;
  render();
  if (nextQuestionToRead) {
    await readQuestionAutomatically({
      question: nextQuestionToRead,
      settings: state.settings,
      preparedPlayback: preparedQuestionPlayback,
      synthesize: synthesizeVoice,
      onFailure: () => notify("質問を自動再生できませんでした。面接官欄の♫ボタンから再生できます。", "info")
    });
  }
}

async function startFeedback() {
  state.screen = "feedback";
  state.feedback = null;
  state.feedbackStatus = "queued";
  state.feedbackJobId = null;
  state.busy = true;
  render();
  try {
    const { job } = await interviewApi.startFeedback(state.session.id);
    state.feedbackStatus = job.status;
    state.feedbackJobId = job.id;
    state.busy = false;
    const generation = ++feedbackPollingGeneration;
    render();
    await pollFeedbackJob(job.id, generation);
  } catch (error) {
    state.feedbackStatus = "failed";
    state.busy = false;
    notify(`${error.message} 面接履歴は保存されています。再試行できます。`, "error");
    render();
  }
}

async function finishInterview() {
  state.busy = true;
  render();
  state.session = (await interviewApi.finish(state.session.id)).session;
  await startFeedback();
}

async function loadFeedbackResult() {
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

async function pollFeedbackJob(jobId = state.feedbackJobId, generation = feedbackPollingGeneration) {
  if (!jobId || generation !== feedbackPollingGeneration || state.screen !== "feedback") return;
  try {
    const { job } = await interviewApi.job(jobId);
    if (generation !== feedbackPollingGeneration || state.screen !== "feedback") return;
    state.feedbackStatus = job.status;
    state.busy = false;
    render();
    if (job.status === "succeeded") return loadFeedbackResult();
    if (job.status === "failed") {
      notify(job.error?.message || "フィードバック生成に失敗しました。再度お試しください。", "error");
      return render();
    }
    setTimeout(() => pollFeedbackJob(jobId, generation), feedbackPollingIntervalMs);
  } catch (error) {
    if (generation !== feedbackPollingGeneration || state.screen !== "feedback") return;
    notify(`${error.message} 状態を再確認します。`, "error");
    setTimeout(() => pollFeedbackJob(jobId, generation), feedbackPollingIntervalMs);
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
  voice: () => synthesizeVoice(state.question?.text),
  "preview-voice": (target) => synthesizeVoice(voicePreviewTexts.speaker, readVoiceSettings(target.form, state.voiceSettingsDraft || state.settings), { preview: true }),
  "start-recording": () => startRecording(render),
  "stop-recording": () => stopRecording(render),
  "submit-answer": submitAnswer,
  "confirm-finish": async () => { state.screen = "finish"; },
  finish: finishInterview,
  "retry-feedback": startFeedback,
  "load-feedback": async () => {
    state.busy = true;
    const generation = ++feedbackPollingGeneration;
    await pollFeedbackJob(state.feedbackJobId, generation);
  },
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
  if (["speedScale", "volumeScale"].includes(event.target.name)) {
    state.voiceSettingsDraft = { ...state.voiceSettingsDraft, ...readVoiceSettings(event.target.form, state.voiceSettingsDraft || state.settings) };
  }
});

document.addEventListener("change", async event => {
  const text = previewTextForControl(event.target.name);
  if (!text || state.screen !== "settings") return;
  const settings = readVoiceSettings(event.target.form, state.voiceSettingsDraft || state.settings);
  state.voiceSettingsDraft = { ...state.voiceSettingsDraft, ...settings };
  try {
    await synthesizeVoice(text, settings, { preview: true });
  } catch (error) {
    notify(error.message, "error");
  }
  render();
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
  if (!hasClickCommand(target, actionHandlers)) return;
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
  const preparedQuestionPlayback = form.dataset.form === "condition" ? prepareAutoplayPlayback() : null;
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
      state.busy = false;
      render();
      await readQuestionAutomatically({
        question: data.question,
        settings: state.settings,
        preparedPlayback: preparedQuestionPlayback,
        synthesize: synthesizeVoice,
        onFailure: () => notify("質問を自動再生できませんでした。面接官欄の♫ボタンから再生できます。", "info")
      });
    }
    if (form.dataset.form === "settings") {
      state.settings = (await api("/settings", { method: "PUT", body: JSON.stringify(values) })).settings;
      state.voiceSettingsDraft = null;
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
