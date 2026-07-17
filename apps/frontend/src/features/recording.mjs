import { api } from "../core/api.mjs";
import { notify, state } from "../core/state.mjs";
import { createRealtimeSpeechRecognition } from "./realtime-speech.mjs";

function stopTracks() {
  state.mediaStream?.getTracks().forEach(track => track.stop());
  state.mediaStream = null;
}

export async function startRecording(render) {
  if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
    throw new Error("このブラウザでは録音を利用できません。テキストで回答してください。");
  }
  state.speechStatus = "permission_checking";
  render();
  state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.audioChunks = [];
  state.recorder = new MediaRecorder(state.mediaStream);
  state.recorder.addEventListener("dataavailable", event => { if (event.data.size) state.audioChunks.push(event.data); });
  state.recorder.start();
  state.speechRealtimeHasResult = false;
  state.speechRecognition = createRealtimeSpeechRecognition({
    initialText: state.answerDraft,
    onTranscript(transcript) {
      state.answerDraft = transcript;
      state.speechRealtimeHasResult = true;
      render();
    },
    onError() {}
  });
  try {
    state.speechRecognition?.start();
  } catch {
    state.speechRecognition = null;
  }
  state.speechStatus = "recording";
}

export async function stopRecording(render) {
  const recorder = state.recorder;
  if (!recorder) return;
  state.speechRecognition?.stop();
  const recognizedInRealtime = state.speechRealtimeHasResult && Boolean(state.answerDraft.trim());
  const completed = new Promise(resolve => recorder.addEventListener("stop", resolve, { once: true }));
  recorder.stop();
  await completed;
  stopTracks();
  if (recognizedInRealtime) {
    state.speechStatus = "recognized";
    state.recorder = null;
    state.audioChunks = [];
    state.speechRecognition = null;
    state.speechRealtimeHasResult = false;
    render();
    return;
  }
  state.speechStatus = "recognizing";
  state.busy = true;
  render();
  try {
    const audio = new Blob(state.audioChunks, { type: recorder.mimeType || "audio/webm" });
    const form = new FormData();
    form.append("sessionId", state.session.id);
    form.append("audio", audio, "answer.webm");
    const data = await api("/speech/recognize", { method: "POST", body: form });
    state.answerDraft = data.transcript;
    state.speechStatus = "recognized";
  } catch (error) {
    state.speechStatus = "failed";
    notify(`${error.message} テキスト入力で続けられます。`, "error");
  } finally {
    state.recorder = null;
    state.audioChunks = [];
    state.speechRecognition = null;
    state.speechRealtimeHasResult = false;
    state.busy = false;
  }
}

export function disposeRecording() {
  state.speechRecognition?.dispose();
  if (state.recorder?.state === "recording") state.recorder.stop();
  stopTracks();
  state.recorder = null;
  state.audioChunks = [];
  state.speechRecognition = null;
  state.speechRealtimeHasResult = false;
}
