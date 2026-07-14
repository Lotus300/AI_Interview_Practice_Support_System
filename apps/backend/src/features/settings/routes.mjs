import { readJson, sendJson } from "../../http.mjs";
import { getDataStore, nowIso } from "../../store.mjs";
import { numberInRange } from "../../core/validation.mjs";

export function registerSettingsRoutes(router) {
  router.add("GET", "/api/v1/settings", async (_req, res, ctx) => sendJson(res, 200, { settings: await (await getDataStore()).getSettings(ctx.user.id) }));

  router.add("PUT", "/api/v1/settings", async (req, res, ctx) => {
    const body = await readJson(req);
    const settings = {
      userId: ctx.user.id,
      speaker: body.speaker ?? "青山龍星",
      speedScale: numberInRange(body.speedScale, "話速", 0.5, 2, 1),
      volumeScale: numberInRange(body.volumeScale, "音量", 0, 2, 1),
      updatedAt: nowIso()
    };
    await (await getDataStore()).saveSettings(settings);
    sendJson(res, 200, { settings });
  });
}
