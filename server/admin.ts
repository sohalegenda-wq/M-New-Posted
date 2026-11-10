import { z } from "zod";
import {
  router,
  permission,
  auth,
  q,
  one,
  rows,
  id,
  now,
  fail,
  notify,
} from "./core";
import type { Role } from "./security";
const app = router();
app.use("*", async (c, next) => {
  await permission(c, "moderate");
  await next();
});
const auditStatement = (
  c: Parameters<typeof auth>[0],
  action: string,
  target: string,
  detail: string,
) =>
  q(
    c,
    "INSERT INTO admin_audit_logs VALUES(?,?,?,?,?,?)",
    id(),
    auth(c).id,
    action,
    target,
    detail,
    now(),
  );
app.get("/stats", async (c) =>
  c.json(
    await one(
      c,
      `SELECT (SELECT count(*) FROM users) users,(SELECT count(*) FROM users WHERE created_at>?) new_users,(SELECT count(DISTINCT user_id) FROM sessions WHERE expires_at>?) active_users,(SELECT count(*) FROM posts WHERE parent_id IS NULL) posts,(SELECT count(*) FROM posts WHERE parent_id IS NOT NULL) replies,(SELECT count(*) FROM reports WHERE status='open') reports,(SELECT count(*) FROM users WHERE banned_until>?) banned,(SELECT count(DISTINCT user_id) FROM premium_grants WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?)) premium,(SELECT COALESCE(sum(size),0) FROM uploads) storage`,
      now() - 86400000,
      now(),
      now(),
      now(),
    ),
  ),
);
app.get("/users", async (c) => {
  const query = (c.req.query("q") ?? "").slice(0, 100);
  return c.json(
    await rows(
      c,
      `SELECT u.id,u.username,u.created_at,u.banned_until,u.ban_reason,p.display_name,r.role,COALESCE((SELECT tier FROM premium_grants WHERE user_id=u.id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) ORDER BY created_at DESC LIMIT 1),'free') tier FROM users u JOIN profiles p ON p.user_id=u.id JOIN user_roles r ON r.user_id=u.id WHERE u.id=? OR u.username LIKE ? ESCAPE '\\' ORDER BY u.created_at DESC LIMIT 30`,
      now(),
      query,
      `%${query.replace(/[\\%_]/g, "\\$&")}%`,
    ),
  );
});
app.get("/audit", async (c) =>
  c.json(
    await rows(
      c,
      "SELECT a.*,u.username actor FROM admin_audit_logs a LEFT JOIN users u ON a.actor_id=u.id ORDER BY created_at DESC LIMIT 100",
    ),
  ),
);
app.get("/reports", async (c) =>
  c.json(
    await rows(
      c,
      "SELECT r.*,u.username reporter,p.content FROM reports r LEFT JOIN users u ON r.reporter_id=u.id LEFT JOIN posts p ON r.post_id=p.id ORDER BY r.created_at DESC LIMIT 100",
    ),
  ),
);
app.get("/appeals", async (c) =>
  c.json(
    await rows(
      c,
      "SELECT a.*,u.username FROM appeals a JOIN users u ON u.id=a.user_id ORDER BY created_at DESC LIMIT 50",
    ),
  ),
);
app.get("/moderation/:id", async (c) =>
  c.json(
    await rows(
      c,
      "SELECT * FROM moderation_actions WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
      c.req.param("id"),
    ),
  ),
);
app.post("/users/:id/ban", async (c) => {
  const actor = await permission(c, "moderate");
  const v = z
    .object({
      days: z.number().int().min(0).max(36500),
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(await c.req.json());
  const target = await one<{ role: Role }>(
    c,
    "SELECT role FROM user_roles WHERE user_id=?",
    c.req.param("id"),
  );
  if (!target) fail(404, "Аккаунт не найден");
  const level = { user: 0, moderator: 1, administrator: 2, owner: 3 };
  if (level[target.role] >= level[actor.role])
    fail(403, "Нельзя ограничить аккаунт с равными или большими правами");
  await c.env.DB.batch([
    q(
      c,
      "UPDATE users SET banned_until=?,ban_reason=? WHERE id=?",
      v.days ? now() + v.days * 86400000 : null,
      v.reason,
      c.req.param("id"),
    ),
    q(
      c,
      "INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)",
      id(),
      actor.id,
      c.req.param("id"),
      null,
      v.days ? "ban" : "unban",
      v.reason,
      now(),
    ),
    auditStatement(c, v.days ? "ban" : "unban", c.req.param("id"), v.reason),
  ]);
  await notify(c, c.req.param("id"), "moderation", null, v.reason);
  return c.json({ ok: true });
});
app.post("/users/:id/role", async (c) => {
  await permission(c, "roles");
  const v = z
    .object({ role: z.enum(["user", "moderator", "administrator", "owner"]) })
    .strict()
    .parse(await c.req.json());
  if (!(await one(c, "SELECT 1 FROM users WHERE id=?", c.req.param("id"))))
    fail(404, "Аккаунт не найден");
  if (c.req.param("id") === auth(c).id && v.role !== "owner")
    fail(400, "Нельзя понизить собственную роль");
  await c.env.DB.batch([
    q(
      c,
      "UPDATE user_roles SET role=? WHERE user_id=?",
      v.role,
      c.req.param("id"),
    ),
    auditStatement(c, "role", c.req.param("id"), v.role),
  ]);
  return c.json({ ok: true });
});
app.post("/users/:id/badge", async (c) => {
  await permission(c, "roles");
  const v = z
    .object({
      badge: z.enum([
        "developer",
        "moderator",
        "founder",
        "official",
        "verified",
      ]),
      enabled: z.boolean(),
    })
    .strict()
    .parse(await c.req.json());
  await c.env.DB.batch([
    v.enabled
      ? q(
          c,
          "INSERT OR IGNORE INTO badges VALUES(?,?,?)",
          c.req.param("id"),
          v.badge,
          auth(c).id,
        )
      : q(
          c,
          "DELETE FROM badges WHERE user_id=? AND badge=?",
          c.req.param("id"),
          v.badge,
        ),
    auditStatement(c, "badge", c.req.param("id"), JSON.stringify(v)),
  ]);
  return c.json({ ok: true });
});
app.get("/premium", async (c) => {
  await permission(c, "premium");
  return c.json(
    await rows(
      c,
      "SELECT g.*,u.username,a.username granted_by_name FROM premium_grants g JOIN users u ON g.user_id=u.id LEFT JOIN users a ON a.id=g.granted_by ORDER BY g.created_at DESC LIMIT 100",
    ),
  );
});
app.post("/premium/:id", async (c) => {
  const actor = await permission(c, "premium");
  const v = z
    .object({
      tier: z.enum(["free", "premium", "premium_plus", "elite"]),
      days: z.number().int().min(1).max(36500).nullable(),
    })
    .strict()
    .parse(await c.req.json());
  const target = c.req.param("id");
  if (!(await one(c, "SELECT 1 FROM users WHERE id=?", target)))
    fail(404, "Аккаунт не найден");
  const statements = [
    q(
      c,
      "UPDATE premium_grants SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL",
      now(),
      target,
    ),
    auditStatement(c, "premium", target, JSON.stringify(v)),
  ];
  if (v.tier !== "free")
    statements.push(
      q(
        c,
        "INSERT INTO premium_grants VALUES(?,?,?,?,?,?,NULL)",
        id(),
        target,
        actor.id,
        v.tier,
        now(),
        v.days ? now() + v.days * 86400000 : null,
      ),
    );
  await c.env.DB.batch(statements);
  await notify(
    c,
    target,
    "premium",
    null,
    v.tier === "free"
      ? "Premium отозван"
      : `Вам подарен M² ${v.tier.replace("_plus", "+")} ${v.days ? `на ${v.days} дней` : "бессрочно"}`,
  );
  return c.json({ ok: true });
});
app.post("/reports/:id", async (c) => {
  const v = z
    .object({
      status: z.enum(["resolved", "dismissed"]),
      action: z.enum(["none", "hide", "delete"]).default("none"),
      reason: z.string().trim().min(5).max(500),
    })
    .strict()
    .parse(await c.req.json());
  const report = await one<{
    post_id: string | null;
    target_user_id: string | null;
  }>(
    c,
    "SELECT post_id,target_user_id FROM reports WHERE id=?",
    c.req.param("id"),
  );
  if (!report) fail(404, "Жалоба не найдена");
  const statements = [
    q(c, "UPDATE reports SET status=? WHERE id=?", v.status, c.req.param("id")),
    auditStatement(c, "report", c.req.param("id"), JSON.stringify(v)),
  ];
  if (report.post_id && v.action !== "none") {
    statements.push(
      q(
        c,
        "INSERT INTO moderation_actions VALUES(?,?,?,?,?,?,?)",
        id(),
        auth(c).id,
        report.target_user_id,
        report.post_id,
        v.action,
        v.reason,
        now(),
      ),
    );
    statements.push(
      v.action === "delete"
        ? q(c, "DELETE FROM posts WHERE id=?", report.post_id)
        : q(c, "UPDATE posts SET hidden=1 WHERE id=?", report.post_id),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({ ok: true });
});
app.get("/settings", async (c) => {
  await permission(c, "system");
  return c.json(await rows(c, "SELECT * FROM platform_settings"));
});
app.patch("/settings", async (c) => {
  await permission(c, "system");
  const v = z
    .object({
      key: z.enum([
        "registration",
        "maintenance",
        "name",
        "rules",
        "announcement",
      ]),
      value: z.string().max(5000),
    })
    .strict()
    .parse(await c.req.json());
  if (v.key === "name" && (!v.value.trim() || v.value.length > 60))
    fail(400, "Название: от 1 до 60 символов");
  if (
    ["registration", "maintenance"].includes(v.key) &&
    !["true", "false"].includes(v.value)
  )
    fail(400, "Укажите true или false");
  await c.env.DB.batch([
    q(
      c,
      "INSERT INTO platform_settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      v.key,
      v.value,
    ),
    auditStatement(c, "setting", v.key, v.value),
  ]);
  return c.json({ ok: true });
});
export default app;
