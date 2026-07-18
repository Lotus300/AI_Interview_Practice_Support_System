import { state } from "../core/state.mjs";
import { esc, select } from "../core/html.mjs";
import { layout } from "./layout.mjs";

const speakerOptions = ["青山龍星", "剣崎雌雄", "No.7", "東北イタコ"];

export function renderSettings() {
  const s = state.voiceSettingsDraft || state.settings || { speaker: "青山龍星", speedScale: 1, volumeScale: 1 };
  return layout(`<form data-form="settings" class="settings-layout"><section class="card"><div class="card-heading"><div class="section-icon">♫</div><div><h2>AI面接官の声</h2><p>VOICEVOXの話者を選択できます。</p></div></div>${select("speaker", "話者", s.speaker, speakerOptions)}<div class="voice-preview">選択中：<strong>${esc(s.speaker)}</strong><button type="button" data-action="preview-voice">試聴</button></div></section><section class="card"><div class="card-heading"><div class="section-icon">↔</div><div><h2>読み上げ調整</h2><p>0.1刻みで調整できます。</p></div></div><div class="range-control"><label>話す速さ <output id="speedOutput">${Number(s.speedScale).toFixed(1)}</output></label><input name="speedScale" type="range" min="0.5" max="2" step="0.1" value="${s.speedScale}"></div><div class="range-control"><label>音量 <output id="volumeOutput">${Number(s.volumeScale).toFixed(1)}</output></label><input name="volumeScale" type="range" min="0" max="2" step="0.1" value="${s.volumeScale}"></div></section><div class="form-actions"><button type="button" data-screen="home">キャンセル</button><button class="primary" ${state.busy ? "disabled" : ""}>設定を保存</button></div></form><section class="card danger-zone"><div><h2>アカウントを削除</h2><p>プロフィール、音声設定、面接履歴、フィードバックを完全に削除します。この操作は取り消せません。警告の確認後、「削除」の文字入力による最終確認を行います。</p></div><button type="button" class="danger-outline" data-action="delete-account" ${state.busy ? "disabled" : ""}>アカウントを完全に削除</button></section>`, { eyebrow: "SETTINGS", title: "音声・面接官設定" });
}
