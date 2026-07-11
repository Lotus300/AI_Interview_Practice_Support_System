// Built from work/screen-mock/src/app.ts.
// This file intentionally contains browser-compatible TypeScript syntax.
let activeScreen = "interview";
let interviewMode = "question";
let voiceSpeed = 1.0;
let voiceVolume = 1.0;
let menuOpen = false;
const navOrder = [
  "login",
  "profile",
  "home",
  "condition",
  "interview",
  "feedback",
  "history",
  "settings",
  "recovery",
];
const stateLabels = {
  question: {
    text: "回答待機中",
    tone: "blue",
    help: "質問音声の再生後、ユーザの回答入力を待っている状態です。",
  },
  recording: {
    text: "録音中",
    tone: "red",
    help: "ユーザの音声回答を取得しています。回答送信はまだできません。",
  },
  recognizing: {
    text: "音声認識中",
    tone: "yellow",
    help: "録音音声をテキスト化しています。失敗時は再録音またはテキスト入力へ切り替えます。",
  },
  analyzing: {
    text: "回答分析中",
    tone: "blue",
    help: "LLMが回答内容、具体性、登録情報との差異を確認しています。",
  },
  confirming: {
    text: "確認質問生成中",
    tone: "yellow",
    help: "矛盾候補または不明点に対して、追加確認の質問を生成しています。",
  },
};
const field = (label, value = "", type = "text") => `
  <div class="field">
    <label>${label}</label>
    <input type="${type}" value="${value}" />
  </div>
`;
const selectField = (label, value, options) => `
  <div class="field">
    <label>${label}</label>
    <select>
      ${options.map((option) => `<option ${option === value ? "selected" : ""}>${option}</option>`).join("")}
    </select>
  </div>
`;
const textareaField = (label, value) => `
  <div class="field">
    <label>${label}</label>
    <textarea>${value}</textarea>
  </div>
`;
const status = (text, tone = "") => `<span class="status ${tone}">${text}</span>`;
const stepNumberValue = (key, delta) => {
  const current = key === "voiceSpeed" ? voiceSpeed : voiceVolume;
  const next = Math.min(2.0, Math.max(0.5, Math.round((current + delta) * 10) / 10));
  if (key === "voiceSpeed") voiceSpeed = next;
  if (key === "voiceVolume") voiceVolume = next;
};
const numberControl = (label, key, value) => `
  <div class="number-control">
    <label>${label}</label>
    <input type="range" min="0.5" max="2.0" step="0.1" value="${value.toFixed(1)}" data-number="${key}" />
    <span class="value">${value.toFixed(1)}</span>
    <button class="step-button ghost" data-step="${key}" data-delta="-0.1">-</button>
    <button class="step-button ghost" data-step="${key}" data-delta="0.1">+</button>
  </div>
`;
const screenShell = (content, toolbar = "") => `
  <section class="screen">
    <div class="screen-toolbar">
      <div class="metrics">${toolbar}</div>
      <div class="metrics">${status("MVP画面モック", "green")}</div>
    </div>
    <div class="screen-body">${content}</div>
  </section>
`;
const renderLogin = () =>
  screenShell(`
    <div class="login-wrap">
      <div class="login-box">
        <div class="brand-mark" style="margin:0 auto 16px;">AI</div>
        <h2>AI面接練習</h2>
        <p>音声でAI面接官と練習し、終了後に抽象度、矛盾候補、深掘り不足を確認できます。</p>
        <button class="primary" data-nav="profile">Googleでログイン</button>
        <div style="margin-top:18px;color:var(--muted);font-size:12px;">利用規約・プライバシーポリシー</div>
      </div>
    </div>
  `);
const renderProfile = () =>
  screenShell(`
    <div class="grid-2">
      <div class="panel">
        <h3 class="panel-title">基本プロフィール</h3>
        ${field("氏名", "田中 太郎")}
        ${selectField("学歴区分", "大学", ["高校", "専門学校", "短大", "大学", "大学院", "その他"])}
        ${field("学校名", "東京サンプル大学")}
        ${field("学部・学科", "情報学部 情報工学科")}
        ${selectField("卒業状況", "卒業見込み", ["卒業", "卒業見込み", "在学中", "中退", "その他"])}
        ${field("卒業年月", "2027-03", "month")}
      </div>
      <div class="panel">
        <h3 class="panel-title">職歴・面接素材</h3>
        ${selectField("職歴有無", "あり", ["あり", "なし"])}
        ${textareaField("職歴", "株式会社サンプル / 開発職 / 2024年4月-現在 / 社内ツール改善")}
        ${field("希望職種", "Webエンジニア")}
        ${textareaField("自己PR素材", "継続的に業務改善へ取り組み、集計作業の自動化を進めた経験があります。")}
        <div class="control-row">
          <button class="primary" data-nav="home">保存して開始</button>
          <button class="ghost">変更破棄</button>
        </div>
      </div>
    </div>
  `, `${status("プロフィール未登録", "yellow")} ${status("必須入力あり")}`);
const renderHome = () =>
  screenShell(`
    <div class="home-cards">
      <div class="home-card primary-card">
        <h3 class="panel-title">面接練習</h3>
        <p>登録済みプロフィールを参照し、AI面接官との模擬面接を開始します。</p>
        <button class="primary" data-nav="condition">面接練習を開始</button>
      </div>
      <div class="home-card">
        <h3 class="panel-title">前回の練習</h3>
        <p>転職面接 / Webエンジニア</p>
        <p style="color:var(--muted);">具体性と数値説明に改善余地</p>
      </div>
      <div class="home-card">
        <h3 class="panel-title">次回テーマ</h3>
        <p>成果を数値で説明する</p>
        <p>登録情報との一貫性を保つ</p>
      </div>
    </div>
    <div class="grid-3">
      <button class="ghost" data-nav="history">履歴を見る</button>
      <button class="ghost" data-nav="settings">プロフィール設定</button>
      <button class="ghost" data-nav="recovery">エラー復旧パターン</button>
    </div>
  `, `${status("ホーム表示", "green")} ${status("ログイン済み")}`);
const renderCondition = () =>
  screenShell(`
    <div class="grid-2">
      <div class="panel">
        <h3 class="panel-title">面接条件</h3>
        ${selectField("面接種別", "転職活動", ["就職活動", "転職活動", "社内面接", "その他"])}
        ${field("職種", "Webエンジニア")}
        ${field("業界", "IT")}
        ${field("企業名", "任意")}
        ${selectField("練習テーマ", "総合面接", ["自己PR", "志望動機", "職務経歴", "ガクチカ", "総合面接"])}
        ${field("質問数", "10", "number")}
      </div>
      <div class="panel soft">
        <h3 class="panel-title">参照する登録情報</h3>
        <p>${status("氏名 登録済み", "green")} ${status("学歴 登録済み", "green")} ${status("職歴 登録済み", "green")}</p>
        <p style="line-height:1.8;color:var(--muted);">面接冒頭の定型確認質問と、回答内容の整合性確認に利用します。</p>
        <div class="control-row">
          <button class="primary" data-nav="interview">開始</button>
          <button class="ghost" data-nav="settings">プロフィールを編集</button>
        </div>
      </div>
    </div>
  `, `${status("条件設定中", "blue")} ${status("開始可能", "green")}`);
const renderInterview = () => {
  const current = stateLabels[interviewMode];
  const disabled = interviewMode === "recognizing" || interviewMode === "analyzing" || interviewMode === "confirming";
  return screenShell(`
    <div class="interview-layout">
      <div>
        <div class="question-card">
          <div class="speaker">AI面接官</div>
          <p class="question-text">これまでの職務経験で、最も成果につながった取り組みを教えてください。</p>
          <div class="control-row">
            <button class="ghost">質問を再生</button>
            ${status("VOICEVOX再生待ち", "blue")}
          </div>
        </div>
        <div class="panel">
          <h3 class="panel-title">回答</h3>
          <div class="transcript">私は前職で、問い合わせ対応の集計を自動化しました。最初は手作業で集計していましたが、スプレッドシートの関数と簡単なスクリプトを使って...</div>
          <div class="control-row">
            <button class="primary" data-mode="recording" ${disabled ? "disabled" : ""}>録音開始</button>
            <button class="primary" data-mode="analyzing" ${disabled ? "disabled" : ""}>回答送信</button>
            <button class="danger" data-nav="feedback">終了</button>
          </div>
        </div>
      </div>
      <div>
        <div class="panel soft">
          <h3 class="panel-title">現在の状態</h3>
          <p>${status(current.text, current.tone)}</p>
          <p style="line-height:1.8;color:var(--muted);">${current.help}</p>
        </div>
        <div class="mock-controls">
          <p class="mock-controls-title">モック用状態切替</p>
          <div class="control-row" style="margin-top:0;">
            <button class="ghost" data-mode="question">回答待機</button>
            <button class="ghost" data-mode="recording">録音中</button>
            <button class="ghost" data-mode="recognizing">音声認識中</button>
            <button class="ghost" data-mode="analyzing">回答分析中</button>
            <button class="ghost" data-mode="confirming">確認質問生成中</button>
          </div>
        </div>
        <div class="panel" style="margin-top:16px;">
          <h3 class="panel-title">会話履歴</h3>
          <div class="timeline">
            <div class="utterance role-ai"><div class="utterance-meta">AI / 定型確認質問</div>お名前と現在のご経歴を教えてください。</div>
            <div class="utterance"><div class="utterance-meta">USER</div>田中太郎です。現在は株式会社サンプルで開発を担当しています。</div>
            <div class="utterance role-ai"><div class="utterance-meta">AI / 深掘り質問</div>その取り組みの成果を数値で説明できますか。</div>
          </div>
        </div>
      </div>
    </div>
  `, `${status("質問 3/10")} ${status("経過 08:24")} ${status(current.text, current.tone)}`);
};
const renderFeedback = () =>
  screenShell(`
    <div class="feedback-grid">
      <div class="feedback-card good">
        <h3 class="panel-title">良かった点</h3>
        <p>経験の流れは明確で、改善行動の主体性が伝わっています。</p>
      </div>
      <div class="feedback-card warn">
        <h3 class="panel-title">抽象的だった箇所</h3>
        <p>「効率化できた」の成果規模が不明確です。時間や件数で補足すると強くなります。</p>
      </div>
      <div class="feedback-card issue">
        <h3 class="panel-title">矛盾候補</h3>
        <p>登録職歴の在籍期間と回答内の時期に差異があります。確認候補として扱います。</p>
      </div>
    </div>
    <div class="panel">
      <h3 class="panel-title">改善回答例</h3>
      <p>問い合わせ対応の月次集計を自動化した結果、作業時間を月6時間削減しました。これにより、確認作業に充てる時間を増やせました。</p>
      <div class="control-row">
        <button class="primary" data-nav="condition">同じ条件でもう一度</button>
        <button class="primary">履歴に保存</button>
        <button class="ghost" data-nav="home">ホームへ</button>
      </div>
    </div>
  `, `${status("フィードバック表示", "green")} ${status("保存前", "yellow")}`);
const renderHistory = () =>
  screenShell(`
    <table class="table">
      <thead>
        <tr><th>実施日時</th><th>面接種別</th><th>職種</th><th>テーマ</th><th>評価要約</th><th>操作</th></tr>
      </thead>
      <tbody>
        <tr><td>2026/07/10 19:10</td><td>転職活動</td><td>Webエンジニア</td><td>総合面接</td><td>成果説明の具体性に改善余地</td><td><button class="ghost">詳細</button></td></tr>
        <tr><td>2026/07/09 21:02</td><td>就職活動</td><td>企画職</td><td>志望動機</td><td>企業理解の説明がやや抽象的</td><td><button class="ghost">詳細</button></td></tr>
        <tr><td>2026/07/08 20:15</td><td>社内面接</td><td>リーダー候補</td><td>経験深掘り</td><td>一貫性は高いが数値が不足</td><td><button class="ghost">詳細</button></td></tr>
      </tbody>
    </table>
  `, `${status("履歴閲覧中", "blue")}`);
const renderSettings = () =>
  screenShell(`
    <div class="grid-2">
      <div class="panel">
        <h3 class="panel-title">プロフィール設定</h3>
        ${field("氏名", "田中 太郎")}
        ${field("学校名", "東京サンプル大学")}
        ${field("学部・学科", "情報学部 情報工学科")}
        ${textareaField("職歴", "株式会社サンプル / 開発職 / 2024年4月-現在")}
        <div class="control-row"><button class="primary">保存</button><button class="ghost">変更破棄</button></div>
      </div>
      <div class="panel">
        <h3 class="panel-title">音声・面接官設定</h3>
        ${selectField("VOICEVOX話者", "青山龍星", ["青山龍星", "剣崎雌雄", "No.7","東北イタコ"])}
        ${numberControl("話速", "voiceSpeed", voiceSpeed)}
        ${numberControl("音量", "voiceVolume", voiceVolume)}
        <div class="control-row"><button class="ghost">試聴</button><button class="primary">保存</button></div>
      </div>
    </div>
  `, `${status("プロフィール編集中", "yellow")}`);
const renderRecovery = () =>
  screenShell(`
    <div class="error-panel">
      <div class="panel">
        <h3 class="panel-title">エラー種別</h3>
        <p>${status("音声認識失敗", "yellow")}</p>
        <p>${status("VOICEVOX失敗", "yellow")}</p>
        <p>${status("LLM応答失敗", "red")}</p>
        <p>${status("通信失敗", "red")}</p>
      </div>
      <div class="panel soft">
        <h3 class="panel-title">復旧操作</h3>
        <p style="line-height:1.8;">音声認識に失敗しました。再録音するか、テキスト入力へ切り替えて面接を継続できます。</p>
        <div class="control-row">
          <button class="primary">再録音</button>
          <button class="primary">テキスト入力へ切替</button>
          <button class="ghost">面接を一時停止</button>
        </div>
      </div>
    </div>
  `, `${status("復旧可能", "green")} ${status("代替手段あり")}`);
const screens = {
  login: {
    key: "login",
    label: "ログイン",
    title: "SCR-001 ログイン画面",
    subtitle: "Google OAuthでログインし、初回利用者はプロフィール登録へ進みます。",
    render: renderLogin,
  },
  profile: {
    key: "profile",
    label: "初期プロフィール",
    title: "SCR-002 初期プロフィール登録画面",
    subtitle: "面接確認質問と矛盾検出に利用する基本情報を登録します。",
    render: renderProfile,
  },
  home: {
    key: "home",
    label: "ホーム",
    title: "SCR-003 ホーム画面",
    subtitle: "面接開始、履歴、設定への起点です。",
    render: renderHome,
  },
  condition: {
    key: "condition",
    label: "面接条件",
    title: "SCR-004 面接条件設定画面",
    subtitle: "面接種別、職種、テーマ、質問数を指定します。",
    render: renderCondition,
  },
  interview: {
    key: "interview",
    label: "面接実施",
    title: "SCR-005 面接実施画面",
    subtitle: "音声入力、VOICEVOX、LLM分析の状態が集まる中心画面です。",
    render: renderInterview,
  },
  feedback: {
    key: "feedback",
    label: "フィードバック",
    title: "SCR-007 フィードバック画面",
    subtitle: "抽象度、矛盾候補、深掘り不足、改善例を提示します。",
    render: renderFeedback,
  },
  history: {
    key: "history",
    label: "履歴",
    title: "SCR-008/009 履歴画面",
    subtitle: "過去の練習結果を一覧し、詳細を確認します。",
    render: renderHistory,
  },
  settings: {
    key: "settings",
    label: "設定",
    title: "SCR-010/011 設定画面",
    subtitle: "プロフィールと音声設定を変更します。",
    render: renderSettings,
  },
  recovery: {
    key: "recovery",
    label: "エラー復旧",
    title: "SCR-012 エラー・復旧画面",
    subtitle: "音声、VOICEVOX、LLM、通信失敗時の継続導線です。",
    render: renderRecovery,
  },
};
const renderApp = () => {
  const screen = screens[activeScreen];
  const nav = navOrder
    .map(
      (key) => `
        <button class="nav-button ${activeScreen === key ? "active" : ""}" data-nav="${key}">
          ${screens[key].label}
        </button>
      `,
    )
    .join("");
  document.querySelector("#app").innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="topbar-left">
          <button class="hamburger" data-menu-toggle aria-label="メニューを開閉" aria-expanded="${menuOpen}">
            <span class="hamburger-lines"></span>
          </button>
          <div class="brand"><span class="brand-mark">AI</span>AI面接練習支援システム</div>
        </div>
        <div class="top-actions">
          ${status("Visual Mock", "blue")}
          <button class="ghost" data-nav="home">ホーム</button>
        </div>
      </header>
      <div class="workspace">
        <div class="scrim ${menuOpen ? "open" : ""}" data-menu-close></div>
        <aside class="sidebar ${menuOpen ? "open" : ""}">
          <div class="sidebar-title">画面</div>
          ${nav}
        </aside>
        <main class="main">
          <div class="page-head">
            <div>
              <h1 class="page-title">${screen.title}</h1>
              <p class="page-subtitle">${screen.subtitle}</p>
            </div>
            <div class="metrics">${status("状態遷移設計反映", "green")}</div>
          </div>
          ${screen.render()}
        </main>
      </div>
    </div>
  `;
  document.querySelectorAll("[data-nav]").forEach((element) => {
    element.addEventListener("click", () => {
      activeScreen = element.dataset.nav;
      menuOpen = false;
      renderApp();
    });
  });
  document.querySelectorAll("[data-menu-toggle]").forEach((element) => {
    element.addEventListener("click", () => {
      menuOpen = !menuOpen;
      renderApp();
    });
  });
  document.querySelectorAll("[data-menu-close]").forEach((element) => {
    element.addEventListener("click", () => {
      menuOpen = false;
      renderApp();
    });
  });
  document.querySelectorAll("[data-mode]").forEach((element) => {
    element.addEventListener("click", () => {
      interviewMode = element.dataset.mode;
      activeScreen = "interview";
      renderApp();
    });
  });
  document.querySelectorAll("[data-number]").forEach((element) => {
    element.addEventListener("input", () => {
      const key = element.dataset.number;
      const value = Number(element.value);
      if (key === "voiceSpeed") voiceSpeed = value;
      if (key === "voiceVolume") voiceVolume = value;
      renderApp();
    });
  });
  document.querySelectorAll("[data-step]").forEach((element) => {
    let holdTimer;
    let holdStarted = false;
    const key = element.dataset.step;
    const delta = Number(element.dataset.delta || 0);
    const stopHold = () => {
      if (holdTimer !== undefined) {
        window.clearInterval(holdTimer);
        holdTimer = undefined;
      }
      holdStarted = false;
    };
    element.addEventListener("click", () => {
      if (holdStarted) return;
      stepNumberValue(key, delta);
      renderApp();
    });
    element.addEventListener("pointerdown", () => {
      stopHold();
      holdTimer = window.setInterval(() => {
        holdStarted = true;
        stepNumberValue(key, delta);
        renderApp();
      }, 180);
    });
    element.addEventListener("pointerup", stopHold);
    element.addEventListener("pointerleave", stopHold);
    element.addEventListener("pointercancel", stopHold);
  });
};
renderApp();
