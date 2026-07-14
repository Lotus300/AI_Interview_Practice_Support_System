import { state } from "../core/state.mjs";
import { renderHome, renderLogin, renderProfile } from "./account.mjs";
import { renderCondition } from "./condition.mjs";
import { renderFeedback, renderFinish, renderInterview } from "./interview.mjs";
import { renderHistory, renderHistoryDetail } from "./history.mjs";
import { renderSettings } from "./settings.mjs";

const screens = {
  login: renderLogin,
  profile: renderProfile,
  home: renderHome,
  condition: renderCondition,
  interview: renderInterview,
  finish: renderFinish,
  feedback: renderFeedback,
  history: renderHistory,
  historyDetail: renderHistoryDetail,
  settings: renderSettings
};

export function render() {
  document.querySelector("#app").innerHTML = (screens[state.screen] || renderLogin)();
}
