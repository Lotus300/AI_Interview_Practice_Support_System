import { speakerOptions } from "../../../packages/shared/src/constants.mjs";

const apiBase = "http://localhost:8080/api/v1";

const state = {
  drawerOpen: false,
  screen: "login",
  user: null,
  profile: null,
  settings: null,
  session: null,
  question: null,
  answerDraft: "",
  feedback: null,
  message: ""
};

async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message || response.statusText);
  }
  if (response.status === 204) return null;
  return response.json();
}

function status(text, tone = "") {
  return `<span class="status ${tone}">${text}</span>`;
}

function field(name, label, value = "", type = "text") {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${value ?? ""}" /></label>`;
}

function textarea(name, label, value = "") {
  return `<label class="field">${label}<textarea name="${name}">${value ?? ""}</textarea></label>`;
}

function select(name, label, value, options) {
  return `<label class="field">${label}<select name="${name}">${options.map((item) => `<option ${item === value ? "selected" : ""}>${item}</option>`).join("")}</select></label>`;
}

function layout(content) {
  return `
    <header class="topbar">
      <button data-action="toggle-drawer" aria-label="メニュー">☰</button>
      <div class="brand">AI面接練習支援システム</div>
      <div style="margin-left:auto">${state.user ? status(state.user.name, "green") : status("未ログイン", "yellow")}</div>
    </header>
    <nav class="drawer ${state.drawerOpen ? "open" : ""}">
      <button data-screen="home">ホーム</button>
      <button data-screen="condition">面接開始</button>
      <button data-screen="settings">音声設定</button>
      <button data-action="logout">ログアウト</button>
    </nav>
    <main class="main">
      ${state.message ? `<p>${status(state.message, "yellow")}</p>` : ""}
      <section class="screen">${content}</section>
    </main>
  `;
}

function renderLogin() {
  return layout(`
    <div class="panel" style="max-width:460px;margin:80px auto;text-align:center">
      <h1>AI面接練習</h1>
      <p>Google OAuthでログインし、音声会話型の面接練習を開始します。</p>
      <button class="primary" data-action="login">Googleでログイン</button>
    </div>
  `);
}

function renderProfile() {
  return layout(`
    <h1>初期プロフィール登録</h1>
    <form data-form="profile" class="grid">
      <div class="panel">
        ${field("fullName", "氏名", state.profile?.fullName || "田中 太郎")}
        ${field("education", "学歴", state.profile?.education || "東京サンプル大学")}
        ${field("faculty", "学部・学科", state.profile?.faculty || "情報学部 情報工学科")}
        ${field("graduationStatus", "卒業状況", state.profile?.graduationStatus || "卒業見込み")}
      </div>
      <div class="panel">
        ${textarea("workHistory", "職歴", state.profile?.workHistory || "株式会社サンプル / 開発職 / 2024年4月-現在")}
        ${field("desiredRole", "希望職種", state.profile?.desiredRole || "Webエンジニア")}
        ${textarea("selfPr", "自己PR素材", state.profile?.selfPr || "業務改善と自動化に継続的に取り組んできました。")}
        <button class="primary">保存して開始</button>
      </div>
    </form>
  `);
}

function renderHome() {
  return layout(`
    <h1>ホーム</h1>
    <div class="grid">
      <div class="panel">
        <h2>面接練習</h2>
        <p>登録プロフィールを参照し、AI面接官との練習を開始します。</p>
        <button class="primary" data-screen="condition">面接練習を開始</button>
      </div>
      <div class="panel">
        <h2>現在の状態</h2>
        <p>${status("ログイン済み", "green")} ${state.user?.profileCompleted ? status("プロフィール登録済み", "green") : status("プロフィール未登録", "yellow")}</p>
      </div>
    </div>
  `);
}

function renderCondition() {
  return layout(`
    <h1>面接条件設定</h1>
    <form data-form="condition" class="grid">
      <div class="panel">
        ${select("interviewType", "面接種別", "転職活動", ["就職活動", "転職活動", "社内面接"])}
        ${field("jobRole", "職種", "Webエンジニア")}
        ${field("industry", "業界", "IT")}
        ${field("companyName", "企業名", "")}
        ${select("theme", "練習テーマ", "総合面接", ["自己PR", "志望動機", "職務経歴", "総合面接"])}
        ${field("questionCount", "質問数", "10", "number")}
        <button class="primary">開始</button>
      </div>
      <div class="panel">
        <h2>参照する登録情報</h2>
        <p>${status("氏名", "green")} ${status("学歴", "green")} ${status("職歴", "green")}</p>
      </div>
    </form>
  `);
}

function renderInterview() {
  const sessionStatus = state.session?.status || "未開始";
  return layout(`
    <h1>面接実施</h1>
    <div class="grid">
      <div class="panel">
        <p>${status(`状態: ${sessionStatus}`, "green")}</p>
        <div class="question">${state.question?.text || "初回質問を生成してください。"}</div>
        <div class="row" style="margin-top:16px">
          <button data-action="initial-question">初回質問生成</button>
          <button data-action="voice">質問を再生</button>
        </div>
      </div>
      <div class="panel">
        <h2>回答</h2>
        <div class="transcript" contenteditable="true" id="answerDraft">${state.answerDraft || "ここに回答または音声認識結果が入ります。"}</div>
        <div class="row" style="margin-top:16px">
          <button data-action="mock-recognize">音声認識</button>
          <button class="primary" data-action="submit-answer">回答送信</button>
          <button data-action="next-question">次質問</button>
          <button class="danger" data-action="finish">終了</button>
        </div>
      </div>
    </div>
  `);
}

function renderFeedback() {
  const fb = state.feedback;
  return layout(`
    <h1>フィードバック</h1>
    <div class="panel">
      <button class="primary" data-action="start-feedback">フィードバック生成</button>
      <button data-action="load-feedback">結果取得</button>
    </div>
    ${fb ? `
      <div class="grid" style="margin-top:16px">
        <div class="panel"><h2>総評</h2><p>${fb.summary}</p></div>
        <div class="panel"><h2>良かった点</h2><ul>${fb.goodPoints.map((x) => `<li>${x}</li>`).join("")}</ul></div>
        <div class="panel"><h2>抽象的だった箇所</h2><ul>${fb.abstractPoints.map((x) => `<li>${x}</li>`).join("")}</ul></div>
        <div class="panel"><h2>改善回答例</h2><p>${fb.improvementExample}</p></div>
      </div>
    ` : ""}
  `);
}

function renderSettings() {
  const settings = state.settings || { speaker: "青山龍星", speedScale: 1, volumeScale: 1 };
  return layout(`
    <h1>音声・面接官設定</h1>
    <form data-form="settings" class="panel">
      ${select("speaker", "VOICEVOX話者", settings.speaker, speakerOptions.map((x) => x.label))}
      ${field("speedScale", "話速", settings.speedScale, "number")}
      ${field("volumeScale", "音量", settings.volumeScale, "number")}
      <button class="primary">保存</button>
    </form>
  `);
}

function render() {
  const screens = {
    login: renderLogin,
    profile: renderProfile,
    home: renderHome,
    condition: renderCondition,
    interview: renderInterview,
    feedback: renderFeedback,
    settings: renderSettings
  };
  document.querySelector("#app").innerHTML = (screens[state.screen] || renderLogin)();
}

async function refreshMe() {
  try {
    const data = await api("/auth/me");
    state.user = data.user;
    if (!state.user.profileCompleted) state.screen = "profile";
    else if (state.screen === "login") state.screen = "home";
  } catch {
    state.user = null;
    state.screen = "login";
  }
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const action = target.dataset.action;
  const screen = target.dataset.screen;
  try {
    if (screen) {
      state.screen = screen;
      state.drawerOpen = false;
    }
    if (action === "toggle-drawer") state.drawerOpen = !state.drawerOpen;
    if (action === "login") {
      await api("/auth/google/start");
      await refreshMe();
    }
    if (action === "logout") {
      await api("/auth/logout", { method: "POST" });
      state.user = null;
      state.screen = "login";
    }
    if (action === "initial-question") {
      const data = await api(`/interview-sessions/${state.session.id}/initial-question`, { method: "POST", body: "{}" });
      state.question = data.question;
      state.session.status = data.sessionStatus;
    }
    if (action === "voice") {
      const data = await api("/voice/synthesize", { method: "POST", body: JSON.stringify({ text: state.question?.text }) });
      state.message = data.aiResponseStatus === "text_only" ? "VOICEVOX未接続のためテキストのみで継続します" : "音声生成完了";
    }
    if (action === "mock-recognize") {
      const data = await api("/speech/recognize", { method: "POST", body: JSON.stringify({ sessionId: state.session?.id }) });
      state.answerDraft = data.transcript;
    }
    if (action === "submit-answer") {
      const answerText = document.querySelector("#answerDraft")?.textContent || state.answerDraft;
      const data = await api(`/interview-sessions/${state.session.id}/answers`, {
        method: "POST",
        body: JSON.stringify({ questionId: state.question?.id, answerText, inputType: "speech_corrected" })
      });
      state.session.status = data.sessionStatus;
      state.message = data.analysis.needsDeepDive ? "深掘りが必要です" : "回答を分析しました";
    }
    if (action === "next-question") {
      const data = await api(`/interview-sessions/${state.session.id}/next-question`, { method: "POST", body: "{}" });
      state.question = data.question;
      state.answerDraft = "";
      state.session.status = data.sessionStatus;
    }
    if (action === "finish") {
      const data = await api(`/interview-sessions/${state.session.id}/finish`, { method: "POST", body: "{}" });
      state.session = data.session;
      state.screen = "feedback";
    }
    if (action === "start-feedback") {
      await api(`/interview-sessions/${state.session.id}/feedback`, { method: "POST", body: "{}" });
      state.message = "フィードバック生成を受け付けました";
    }
    if (action === "load-feedback") {
      const data = await api(`/interview-sessions/${state.session.id}/feedback`);
      state.feedback = data.feedback;
    }
  } catch (error) {
    state.message = error.message;
  }
  render();
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.dataset.form === "profile") {
      const data = await api("/profile", { method: "PUT", body: JSON.stringify(values) });
      state.profile = data.profile;
      state.user = data.user;
      state.screen = "home";
    }
    if (form.dataset.form === "condition") {
      const data = await api("/interview-sessions", { method: "POST", body: JSON.stringify(values) });
      state.session = data.session;
      state.screen = "interview";
    }
    if (form.dataset.form === "settings") {
      const data = await api("/settings", { method: "PUT", body: JSON.stringify(values) });
      state.settings = data.settings;
      state.message = "設定を保存しました";
    }
  } catch (error) {
    state.message = error.message;
  }
  render();
});

await refreshMe();
render();
