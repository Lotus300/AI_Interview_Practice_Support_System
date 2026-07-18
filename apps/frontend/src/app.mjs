import { api, interviewApi, resolveApiResource } from "./core/api.mjs";
import { clearInterviewState, notify, state } from "./core/state.mjs";
import { createCommandGate, hasClickCommand } from "./core/events.mjs";
import { disposeRecording, startRecording, stopRecording } from "./features/recording.mjs";
import { previewTextForControl, readVoiceSettings, voicePreviewTexts } from "./features/voice-preview.mjs";
import { configurePreviewPlayback, createAudioForPlayback, prepareAutoplayPlayback } from "./features/voice-playback.mjs";
import { createQuestionVoicePreloader, readQuestionAutomatically, shouldPrepareNextQuestion } from "./features/question-audio.mjs";
import { render } from "./views/index.mjs";

async function refreshMe() {
  let user;
  try {
    ({ user } = await api("/auth/me"));
  } catch {
    state.user = null;
    state.screen = "login";
    return;
  }

  state.user = user;
  try {
    const [{ profile }, { settings }, history] = await Promise.all([
      api("/profile"), api("/settings"), interviewApi.list()
    ]);
    const hasSavedProfile = Boolean(profile);
    Object.assign(state, {
      profile,
      settings,
      sessions: history.sessions,
      historyNextCursor: history.nextCursor,
      user: hasSavedProfile ? { ...user, profileCompleted: true } : user,
      screen: user.profileCompleted || hasSavedProfile ? "home" : "profile"
    });
  } catch (error) {
    state.screen = user.profileCompleted ? "home" : "profile";
    notify(`ログインしましたが、初期データを取得できませんでした。再読み込みしてください。(${error.message})`, "error");
  }
}

async function navigate(screen) {
  if (screen !== "feedback") feedbackPollingGeneration += 1;
  state.drawerOpen = false;
  if (screen !== "settings") state.voiceSettingsDraft = null;
  if (screen === "history" || screen === "home") {
    const history = await interviewApi.list();
    state.sessions = history.sessions;
    state.historyNextCursor = history.nextCursor;
  }
  if (screen === "profile") {
    const { profile } = await api("/profile");
    state.profile = profile;
    if (profile && state.user) state.user = { ...state.user, profileCompleted: true };
  }
  if (screen === "settings") {
    state.settings = (await api("/settings")).settings;
    state.voiceSettingsDraft = { ...state.settings };
    prepareVoicePreview(voicePreviewTexts.speaker, state.settings);
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
  Object.assign(state, { user: null, profile: null, settings: null, voiceSettingsDraft: null, sessions: [], historyNextCursor: null, screen: "login", drawerOpen: false });
}

let activeVoicePlayback = null;
let latestPreviewRequest = 0;
let preparedVoicePreview = null;
const preparedVoicePreviewTtlMs = 90000;

function voicePreviewKey(text, settings) {
  return JSON.stringify([text, settings?.speaker, Number(settings?.speedScale ?? 1), Number(settings?.volumeScale ?? 1)]);
}

function requestVoice(text, settings, preview) {
  return api("/voice/synthesize", { method: "POST", body: JSON.stringify({ text, ...settings, preview }) });
}

const questionVoicePreloader = createQuestionVoicePreloader({
  request: (text, settings) => requestVoice(text, settings, false)
});

function prepareVoicePreview(text, settings) {
  if (!text || !settings) return;
  const key = voicePreviewKey(text, settings);
  const promise = requestVoice(text, settings, true);
  promise.catch(() => {});
  preparedVoicePreview = { key, promise, createdAt: Date.now() };
}

function voiceData(text, settings, preview) {
  const prepared = preparedVoicePreview;
  if (preview && prepared?.key === voicePreviewKey(text, settings) && Date.now() - prepared.createdAt < preparedVoicePreviewTtlMs) {
    preparedVoicePreview = null;
    return prepared.promise;
  }
  return requestVoice(text, settings, preview);
}

async function synthesizeVoice(text, settings = state.settings, { preview = false, preparedPlayback = null, preparedVoice = null } = {}) {
  if (!text) return;
  const previewRequest = preview ? ++latestPreviewRequest : null;
  const reusableVoice = !preview && questionVoicePreloader.matches(preparedVoice, text, settings)
    ? preparedVoice
    : (!preview ? questionVoicePreloader.prepare(text, settings) : null);
  const data = reusableVoice ? await reusableVoice.promise : await voiceData(text, settings, preview);
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
    if (reusableVoice) console.info("question_voice_playback_started", { elapsedMs: questionVoicePreloader.elapsedMs(reusableVoice) });
  }
  notify("音声を再生しています。", "info");
}

async function submitAnswer() {
  if (state.busy) return;
  state.answerSubmissionId ||= crypto.randomUUID();
  const submissionId = state.answerSubmissionId;
  const preparedQuestionPlayback = shouldPrepareNextQuestion(state.session) ? prepareAutoplayPlayback() : null;
  let nextQuestionToRead = null;
  let preparedQuestionVoice = null;
  state.busy = true;
  render();
  const result = await interviewApi.submitAnswer(state.session.id, {
    questionId: state.question?.id,
    answerText: state.answerDraft,
    inputType: state.speechStatus === "recognized" ? "speech_corrected" : "text",
    clientRequestId: submissionId
  });
  state.session.answers.push(result.answer);
  state.answerDraft = "";
  state.answerSubmissionId = null;
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
    preparedQuestionVoice = questionVoicePreloader.prepare(next.question.text, state.settings);
    notify(result.analysis.needsDeepDive ? "回答を分析し、内容を深掘りする質問を作成しました。" : "回答を保存し、次の質問へ進みました。", "success");
  }
  state.busy = false;
  render();
  if (nextQuestionToRead) {
    await readQuestionAutomatically({
      question: nextQuestionToRead,
      settings: state.settings,
      preparedPlayback: preparedQuestionPlayback,
      preparedVoice: preparedQuestionVoice,
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
  if (!confirm("この練習履歴を完全に削除しますか？削除後は復元できません。")) return;
  await interviewApi.remove(state.session.id);
  state.sessions = state.sessions.filter(item => item.id !== state.session.id);
  clearInterviewState();
  state.screen = "history";
  notify("履歴を削除しました。", "success");
}

async function loadMoreHistory() {
  if (!state.historyNextCursor || state.busy) return;
  state.busy = true;
  render();
  const history = await interviewApi.list(state.historyNextCursor);
  const existingIds = new Set(state.sessions.map(item => item.id));
  state.sessions.push(...history.sessions.filter(item => !existingIds.has(item.id)));
  state.historyNextCursor = history.nextCursor;
  state.busy = false;
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
  "load-more-history": loadMoreHistory,
  "delete-session": deleteSession
};
const runCommandOnce = createCommandGate();

document.addEventListener("input", event => {
  if (event.target.id === "answerDraft") {
    state.answerDraft = event.target.value;
    state.answerSubmissionId = null;
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
  const commandKey = target.dataset.action ? `action:${target.dataset.action}` : `screen:${target.dataset.screen}`;
  await runCommandOnce(commandKey, async () => {
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
});

document.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.target;
  await runCommandOnce(`form:${form.dataset.form || "unknown"}`, async () => {
  if (state.busy) return;
  const values = Object.fromEntries(new FormData(form).entries());
  const preparedQuestionPlayback = form.dataset.form === "condition" ? prepareAutoplayPlayback() : null;
  state.busy = true;
  render();
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
      const preparedInitialVoice = questionVoicePreloader.prepare(data.question.text, state.settings);
      state.question = data.question;
      state.session.questions.push(data.question);
      state.screen = "interview";
      state.busy = false;
      render();
      await readQuestionAutomatically({
        question: data.question,
        settings: state.settings,
        preparedPlayback: preparedQuestionPlayback,
        preparedVoice: preparedInitialVoice,
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
});

await refreshMe();
render();
