import { state } from "../core/state.mjs";
import { esc, field, select, textarea } from "../core/html.mjs";
import { layout } from "./layout.mjs";

export function renderLogin() {
  return layout(`<section class="login-shell"><div class="login-copy"><span class="hero-label">PERSONAL INTERVIEW COACH</span><h1>話すたび、<br><em>伝わる自分</em>に近づく。</h1><p>プロフィールに沿った質問と具体的なフィードバックで、納得できるまで面接練習を重ねられます。</p><div class="feature-row"><span>✓ 音声・テキスト回答</span><span>✓ 個別フィードバック</span><span>✓ 練習履歴</span></div></div><div class="login-card"><div class="login-icon">✦</div><h2>練習を始めましょう</h2><p>Google アカウントで安全にログインします。外部設定がないローカル環境ではデモログインになります。</p><button class="google-button" data-action="login" ${state.busy ? "disabled" : ""}><span>G</span>Googleでログイン</button><small>音声データは保存されません</small></div></section>`);
}

function profileForm(initialSetup) {
  const p = state.profile || {};
  return `<form data-form="profile" class="form-stack"><section class="card"><div class="card-heading"><div class="section-icon">01</div><div><h2>基本情報</h2><p>面接官があなたを呼ぶ際の情報です。</p></div></div><div class="form-grid">${field("fullName", "氏名（必須）", p.fullName, "text", "required maxlength=100")}${field("desiredRole", "希望職種", p.desiredRole, "text", "maxlength=100")}</div></section><section class="card"><div class="card-heading"><div class="section-icon">02</div><div><h2>学歴・経歴</h2><p>質問の背景情報として利用します。</p></div></div><div class="form-grid">${field("education", "学校名・最終学歴（必須）", p.education, "text", "required")}${field("faculty", "学部・学科", p.faculty)}${select("graduationStatus", "卒業状況（必須）", p.graduationStatus || "", [{ value: "", label: "選択してください", disabled: true }, "卒業", "卒業見込み"], "required")}</div>${textarea("workHistory", "職歴・活動経験", p.workHistory, "placeholder='所属、役割、期間、担当内容を入力してください'")}</section><section class="card"><div class="card-heading"><div class="section-icon">03</div><div><h2>自己PR素材</h2><p>得意なことや成果を登録すると、より具体的な質問になります。</p></div></div>${textarea("selfPr", "強み・実績・エピソード", p.selfPr, "placeholder='状況・行動・結果が分かるように入力してください'")}</section><div class="form-actions">${initialSetup ? "" : '<button type="button" data-screen="home">キャンセル</button>'}<button class="primary" ${state.busy ? "disabled" : ""}>${initialSetup ? "保存してホームへ" : "変更を保存"}</button></div></form>`;
}

export function renderProfile() {
  const initial = !state.profile && !state.user?.profileCompleted;
  return layout(profileForm(initial), { eyebrow: initial ? "WELCOME" : "SETTINGS", title: initial ? "最初にプロフィールを登録" : "プロフィール設定" });
}

export function renderHome() {
  const recent = state.sessions.slice(0, 3);
  const displayName = state.profile?.fullName?.trim() || state.user?.name || "ユーザー";
  const row = (session) => `<button class="history-row" data-action="open-history" data-id="${esc(session.id)}"><span class="history-icon">▤</span><span><strong>${esc(session.condition?.jobRole || "面接練習")}</strong><small>${esc(session.condition?.theme || "総合面接")}</small></span><b>›</b></button>`;
  return layout(`<section class="welcome card hero-card"><div><p class="eyebrow">WELCOME BACK</p><h2>${esc(displayName)}さん、今日も一歩進めましょう。</h2><p>本番を想定した質問に、自分の言葉で答える練習を始められます。</p><button class="primary large" data-screen="condition">面接練習を始める <span>→</span></button></div><div class="hero-visual"><span>AI</span><div class="wave">▂▅▃▇▆▃▅▂</div></div></section><div class="dashboard-grid"><section class="card"><div class="card-title-row"><div><p class="eyebrow">QUICK START</p><h2>練習メニュー</h2></div></div><button class="menu-tile" data-screen="condition"><span class="tile-icon coral">◎</span><span><strong>新しい面接練習</strong><small>条件を決めてAI面接官と練習</small></span><b>›</b></button><button class="menu-tile" data-screen="history"><span class="tile-icon blue">◷</span><span><strong>練習履歴を見る</strong><small>過去の回答と改善点を振り返る</small></span><b>›</b></button></section><section class="card"><div class="card-title-row"><div><p class="eyebrow">RECENT</p><h2>最近の練習</h2></div><button class="text-button" data-screen="history">すべて見る</button></div>${recent.length ? recent.map(row).join("") : '<div class="empty compact"><span>◷</span><p>まだ練習履歴がありません</p></div>'}</section></div>`, { eyebrow: "DASHBOARD", title: "ホーム" });
}
