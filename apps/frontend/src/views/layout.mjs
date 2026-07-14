import { state } from "../core/state.mjs";
import { badge, esc } from "../core/html.mjs";

function navButton(screen, icon, label) {
  return `<button data-screen="${screen}" class="nav-button ${state.screen === screen ? "active" : ""}"><span aria-hidden="true">${icon}</span>${label}</button>`;
}

export function layout(content, { title = "", eyebrow = "" } = {}) {
  const loggedIn = Boolean(state.user);
  return `<header class="topbar">${loggedIn ? `<button class="icon-button" data-action="toggle-drawer" aria-label="メニューを開く" aria-expanded="${state.drawerOpen}">☰</button>` : '<div class="brand-mark">AI</div>'}<div class="brand"><strong>AI面接練習</strong><span>Interview Practice</span></div><div class="topbar-user">${loggedIn ? `<span>${esc(state.user.name)}</span><span class="avatar">${esc(state.user.name.slice(0, 1))}</span>` : badge("デモ利用可能", "blue")}</div></header>
  ${loggedIn ? `<div class="drawer-backdrop ${state.drawerOpen ? "open" : ""}" data-action="close-drawer"></div><aside class="drawer ${state.drawerOpen ? "open" : ""}" aria-label="メインメニュー"><div class="drawer-label">MENU</div>${navButton("home", "⌂", "ホーム")}${navButton("condition", "＋", "面接を始める")}${navButton("history", "◷", "練習履歴")}<div class="drawer-label section-label">SETTINGS</div>${navButton("profile", "♙", "プロフィール")}${navButton("settings", "♫", "音声・面接官")}<button data-action="logout" class="nav-button logout"><span>↪</span>ログアウト</button></aside>` : ""}
  <main class="main ${loggedIn ? "authenticated" : ""}">${state.message ? `<div class="notice ${state.messageTone}" role="status"><span>${state.messageTone === "error" ? "!" : "i"}</span><p>${esc(state.message)}</p><button data-action="clear-message" aria-label="閉じる">×</button></div>` : ""}${title ? `<div class="page-heading"><div><p>${esc(eyebrow)}</p><h1>${esc(title)}</h1></div></div>` : ""}${content}</main>`;
}
