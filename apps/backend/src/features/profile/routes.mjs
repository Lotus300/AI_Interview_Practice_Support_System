import { readJson, sendJson } from "../../http.mjs";
import { db, nowIso } from "../../store.mjs";
import { optionalText, requireText } from "../../core/validation.mjs";
import { publicUser } from "../../core/resources.mjs";

export function registerProfileRoutes(router) {
  router.add("GET", "/api/v1/profile", async (_req, res, ctx) => sendJson(res, 200, { profile: db.profiles.get(ctx.user.id) ?? null }));

  router.add("PUT", "/api/v1/profile", async (req, res, ctx) => {
    const body = await readJson(req);
    const profile = {
      userId: ctx.user.id,
      fullName: requireText(body.fullName, "氏名", 100),
      education: requireText(body.education, "学歴", 300),
      faculty: optionalText(body.faculty, 200),
      graduationStatus: optionalText(body.graduationStatus, 100),
      workHistory: optionalText(body.workHistory, 4000),
      desiredRole: optionalText(body.desiredRole, 100),
      selfPr: optionalText(body.selfPr, 4000),
      updatedAt: nowIso()
    };
    db.profiles.set(ctx.user.id, profile);
    ctx.user.profileCompleted = true;
    ctx.user.updatedAt = nowIso();
    sendJson(res, 200, { profile, user: publicUser(ctx.user) });
  });
}
