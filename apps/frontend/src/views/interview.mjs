import { state } from "../core/state.mjs";
import { badge, esc } from "../core/html.mjs";
import { layout } from "./layout.mjs";

export function renderInterview() {
  const qNo = state.session?.questions?.length || (state.question ? 1 : 0);
  const total = state.session?.condition?.questionCount || 5;
  const recording = state.speechStatus === "recording";
  const canSubmit = state.answerDraft.trim() && !state.busy && !recording;
  const speechLabels = { recording: "録音中", recognizing: "文字起こし中", recognized: "認識完了", failed: "認識失敗" };
  return layout(`<div class="interview-progress"><span>質問 ${qNo || 1} / ${total}</span><div><i style="width:${Math.min(100, ((qNo || 1) / total) * 100)}%"></i></div>${badge(recording ? "録音中" : state.busy ? "処理中" : "回答待ち", recording ? "red" : "green")}</div><section class="interview-card card"><div class="interviewer"><div class="interviewer-avatar">AI</div><div><strong>AI面接官</strong><small>${esc(state.settings?.speaker || "青山龍星")}</small></div><button class="icon-button sound" data-action="voice" aria-label="質問を読み上げる" ${!state.question || state.busy ? "disabled" : ""}>♫</button></div><blockquote>${esc(state.question?.text || "質問を準備しています…")}</blockquote></section><section class="card answer-card"><div class="card-title-row"><div><p class="eyebrow">YOUR ANSWER</p><h2>回答を入力</h2></div>${state.speechStatus !== "idle" ? badge(speechLabels[state.speechStatus] || state.speechStatus, state.speechStatus === "failed" ? "red" : "blue") : ""}</div><textarea id="answerDraft" aria-label="回答内容" placeholder="マイクで話すか、ここに回答を入力してください。" ${recording || state.busy ? "disabled" : ""}>${esc(state.answerDraft)}</textarea><div class="answer-controls">${recording ? '<button class="recording-button" data-action="stop-recording"><span>■</span>録音を停止</button>' : `<button class="record-button" data-action="start-recording" ${state.busy ? "disabled" : ""}><span>●</span>音声で回答</button>`}<span class="or">または直接入力</span><button class="primary submit-answer" data-action="submit-answer" ${canSubmit ? "" : "disabled"}>回答を送信 <span>→</span></button></div></section><div class="interview-footer"><button class="text-button danger-text" data-action="confirm-finish" ${state.busy || recording ? "disabled" : ""}>面接を終了する</button><span>回答は送信するまで保存されません</span></div>`, { eyebrow: "INTERVIEW IN PROGRESS", title: state.session?.condition?.theme || "面接練習" });
}

export function renderFinish() {
  return layout(`<section class="card confirm-card"><div class="confirm-icon">?</div><p class="eyebrow">FINISH INTERVIEW</p><h2>面接を終了しますか？</h2><p>終了後、これまでの回答をもとにフィードバックを作成します。</p><div class="stats"><div><strong>${state.session?.answers?.length || 0}</strong><span>回答済み</span></div><div><strong>${state.session?.questions?.length || 0}</strong><span>質問数</span></div></div><div class="confirm-actions"><button data-screen="interview">面接に戻る</button><button class="primary" data-action="finish" ${state.busy ? "disabled" : ""}>終了して分析する</button></div></section>`, { eyebrow: "INTERVIEW", title: "終了確認" });
}

function list(items = []) {
  return `<ul class="feedback-list">${items.map(item => `<li><span>✓</span><p>${esc(item)}</p></li>`).join("")}</ul>`;
}

function feedbackEvidence(items = []) {
  if (!items.length) return "";
  return `<section class="card"><p class="eyebrow">EVIDENCE</p><h2>評価に使用した会話</h2><div class="conversation">${items.map(item => `<div class="utterance ai"><span>AI</span><p>${esc(item.questionText)}</p></div><div class="utterance user"><span>YOU</span><p>${esc(item.answerText)}</p></div>`).join("")}</div></section>`;
}

function renderNotAssessableFeedback(fb) {
  return layout(`<section class="card feedback-summary"><p class="eyebrow">NOT ENOUGH ANSWERS</p><h2>今回は評価できませんでした</h2><p>${esc(fb.summary)}</p></section><section class="card"><p class="eyebrow coral-text">NEXT PRACTICE</p><h2>次回の練習ポイント</h2>${list(fb.abstractPoints)}</section><section class="card example"><p class="eyebrow">ABOUT FEEDBACK</p><h2>改善回答例について</h2><blockquote>${esc(fb.improvementExample)}</blockquote></section><div class="form-actions"><button data-screen="history">履歴を見る</button><button class="primary" data-screen="home">ホームへ戻る</button></div>`, { eyebrow: "FEEDBACK", title: "面接フィードバック" });
}

export function renderFeedback() {
  const fb = state.feedback;
  if (fb?.assessmentStatus === "not_assessable") return renderNotAssessableFeedback(fb);
  if (!fb) return layout(`<section class="card loading-card"><div class="spinner"></div><p class="eyebrow">ANALYZING</p><h2>フィードバックを作成しています</h2><p>回答の具体性や一貫性を確認しています。通常は数秒で完了します。</p><button data-action="load-feedback" ${state.busy ? "disabled" : ""}>結果を確認</button></section>`, { eyebrow: "FEEDBACK", title: "面接フィードバック" });
  return layout(`<section class="card feedback-summary"><p class="eyebrow">OVERALL REVIEW</p><h2>総評</h2><p>${esc(fb.summary)}</p><small>評価対象：${Number(fb.evaluatedAnswerCount || 0)}件の回答</small></section><div class="feedback-grid"><section class="card"><p class="eyebrow green-text">GOOD POINTS</p><h2>良かった点</h2>${list(fb.goodPoints)}</section><section class="card"><p class="eyebrow coral-text">IMPROVEMENTS</p><h2>より伝わるために</h2>${list(fb.abstractPoints)}</section></div>${fb.contradictionCandidates?.length ? `<section class="card caution"><h2>確認しておきたい点</h2><p>矛盾と断定せず、本番前の確認候補として提示しています。</p>${list(fb.contradictionCandidates)}</section>` : ""}<section class="card example"><p class="eyebrow">ANSWER EXAMPLE</p><h2>改善回答例</h2><blockquote>${esc(fb.improvementExample)}</blockquote></section>${feedbackEvidence(fb.evidence)}<div class="form-actions"><button data-screen="history">履歴を見る</button><button class="primary" data-screen="home">ホームへ戻る</button></div>`, { eyebrow: "FEEDBACK", title: "面接フィードバック" });
}
