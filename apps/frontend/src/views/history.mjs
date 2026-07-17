import { state } from "../core/state.mjs";
import { badge, esc, formatDate } from "../core/html.mjs";
import { layout } from "./layout.mjs";

export function sessionRow(session) {
  return `<button class="history-row" data-action="open-history" data-id="${esc(session.id)}"><span class="history-icon">▤</span><span><strong>${esc(session.condition?.jobRole || "面接練習")}</strong><small>${esc(session.condition?.theme || "総合面接")} ・ ${formatDate(session.createdAt)}</small></span>${badge(session.status === "finished" ? "完了" : "途中", session.status === "finished" ? "green" : "yellow")}<b>›</b></button>`;
}

export function renderHistory() {
  return layout(`<section class="card caution"><h2>履歴の保存期間について</h2><p>練習履歴は作成日から1か月間（30日間）保存され、保存期間を過ぎると自動的に削除されます。</p></section><section class="card"><div class="card-title-row"><div><p class="eyebrow">PAST INTERVIEWS</p><h2>${state.sessions.length}件の練習</h2></div><button class="primary" data-screen="condition">新しい練習</button></div>${state.sessions.length ? `<div class="history-list">${state.sessions.map(sessionRow).join("")}</div>` : '<div class="empty"><span>◷</span><h2>まだ練習履歴がありません</h2><p>最初の面接練習を始めると、ここから振り返れます。</p><button class="primary" data-screen="condition">面接練習を始める</button></div>'}</section>`, { eyebrow: "HISTORY", title: "練習履歴" });
}

export function renderHistoryDetail() {
  const session = state.session;
  return layout(`<section class="card detail-overview"><div><p class="eyebrow">${formatDate(session?.createdAt)}</p><h2>${esc(session?.condition?.jobRole || "面接練習")}</h2><p>${esc(session?.condition?.industry)} / ${esc(session?.condition?.theme)}</p></div>${badge(session?.status === "finished" ? "完了" : "途中", session?.status === "finished" ? "green" : "yellow")}</section><section class="card"><p class="eyebrow">CONVERSATION</p><h2>会話内容</h2><div class="conversation">${(session?.utterances || []).map(u => `<div class="utterance ${u.role}"><span>${u.role === "ai" ? "AI" : "YOU"}</span><p>${esc(u.text)}</p></div>`).join("") || '<div class="empty compact"><p>会話はまだありません。</p></div>'}</div></section>${state.feedback ? `<section class="card feedback-summary"><p class="eyebrow">FEEDBACK</p><h2>総評</h2><p>${esc(state.feedback.summary)}</p><button class="text-button" data-screen="feedback">フィードバック詳細を見る →</button></section>` : ""}<div class="form-actions spread"><button data-screen="history">← 履歴一覧へ</button><button class="danger-outline" data-action="delete-session">この履歴を削除</button></div>`, { eyebrow: "HISTORY DETAIL", title: "練習の振り返り" });
}
