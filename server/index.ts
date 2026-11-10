import { ZodError } from "zod";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { router, identity, one, q, visibility, now, type Env } from "./core";
import { equal } from "./security";
import authRoutes from "./auth";
import socialRoutes from "./social";
import messages from "./messages";
import admin from "./admin";
const app = router();
app.use(
  "*",
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "blob:", "data:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
    referrerPolicy: "no-referrer",
  }),
);
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 600000,
    onError: (c) => c.json({ error: "Запрос слишком большой" }, 413),
  }),
);
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await identity(c);
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin)
      return c.json({ error: "Запрос с другого сайта запрещён" }, 403);
    if (c.req.header("sec-fetch-site") === "cross-site")
      return c.json({ error: "Запрос с другого сайта запрещён" }, 403);
    const u = c.get("user");
    if (u && !equal(c.req.header("x-csrf-token") ?? "", u.csrf))
      return c.json(
        { error: "Обновите страницу: проверка безопасности не пройдена" },
        403,
      );
    if (
      !c.req.path.endsWith("/uploads") &&
      !c.req.header("content-type")?.startsWith("application/json")
    )
      return c.json({ error: "Требуется application/json" }, 415);
    if (Number(c.req.header("content-length") ?? 0) > 600000)
      return c.json({ error: "Запрос слишком большой" }, 413);
  }
  if (
    !c.req.path.startsWith("/api/auth") &&
    !c.req.path.startsWith("/api/admin") &&
    c.req.path !== "/api/platform" &&
    c.req.path !== "/api/appeals"
  ) {
    const maintenance = await one<{ value: string }>(
      c,
      "SELECT value FROM platform_settings WHERE key='maintenance'",
    );
    if (maintenance?.value === "true" && c.get("user")?.role !== "owner")
      return c.json(
        { error: "Техническое обслуживание. Скоро вернёмся." },
        503,
      );
  }
  await next();
});
app.route("/api/auth", authRoutes);
app.route("/api", socialRoutes);
app.route("/api", messages);
app.route("/api/admin", admin);
app.get("/api/platform", async (c) => {
  const settings = (
    await q(
      c,
      "SELECT key,value FROM platform_settings WHERE key IN ('name','rules','announcement','registration','maintenance')",
    ).all<{ key: string; value: string }>()
  ).results;
  return c.json({
    status: settings.some((s) => s.key === "maintenance" && s.value === "true")
      ? "maintenance"
      : "operational",
    settings,
    mail_configured: !!(
      c.env.MAIL_API_KEY &&
      c.env.MAIL_FROM &&
      c.env.APP_ORIGIN
    ),
  });
});
app.get("/media/:id", async (c) => {
  await identity(c);
  const viewer = c.get("user")?.id ?? "";
  const upload = await one<{
    user_id: string;
    content_type: string;
    data: string;
  }>(
    c,
    "SELECT user_id,content_type,data FROM uploads WHERE id=?",
    c.req.param("id"),
  );
  if (!upload) return c.notFound();
  let allowed = viewer === upload.user_id;
  const vis = visibility(viewer);
  if (!allowed)
    allowed = !!(await one(
      c,
      `SELECT 1 FROM post_media pm JOIN posts p ON p.id=pm.post_id JOIN profiles pr ON pr.user_id=p.user_id JOIN users u ON u.id=p.user_id WHERE pm.upload_id=? AND ${vis.sql}`,
      c.req.param("id"),
      ...vis.params,
    ));
  if (!allowed)
    allowed = !!(await one(
      c,
      "SELECT 1 FROM profiles WHERE (avatar_id=? OR banner_id=?) AND private=0 AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=user_id) OR (blocked_id=? AND blocker_id=user_id))",
      c.req.param("id"),
      c.req.param("id"),
      viewer,
      viewer,
    ));
  if (!allowed && viewer)
    allowed = !!(await one(
      c,
      "SELECT 1 FROM messages m JOIN conversations t ON t.id=m.conversation_id WHERE m.upload_id=? AND (t.member_a=? OR t.member_b=?) AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=m.user_id) OR (blocked_id=? AND blocker_id=m.user_id))",
      c.req.param("id"),
      viewer,
      viewer,
      viewer,
      viewer,
    ));
  if (!allowed) return c.notFound();
  c.header("Cache-Control", "private, no-store");
  c.header("Content-Type", upload.content_type);
  c.header("X-Content-Type-Options", "nosniff");
  return c.body(Uint8Array.from(atob(upload.data), (n) => n.charCodeAt(0)));
});
app.notFound((c) => c.json({ error: "Маршрут не найден" }, 404));
app.onError((err, c) => {
  c.header("Cache-Control", "no-store");
  if (err instanceof ZodError)
    return c.json({ error: err.issues[0]?.message ?? "Проверьте данные" }, 400);
  if (err instanceof HTTPException)
    return c.json({ error: err.message }, err.status);
  if (err instanceof SyntaxError)
    return c.json({ error: "Некорректный JSON" }, 400);
  // Deliberately omit request bodies, email addresses, tokens and raw database errors.
  return c.json(
    { error: "Не удалось выполнить запрос. Повторите позже." },
    500,
  );
});
export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env["Bindings"]) {
    if (!env) return;
    const db = env.DB;
    await db.batch([
      db.prepare("DELETE FROM rate_limits WHERE expires_at<?").bind(now()),
      db.prepare("DELETE FROM sessions WHERE expires_at<?").bind(now()),
      db.prepare("DELETE FROM password_resets WHERE expires_at<?").bind(now()),
      db
        .prepare("DELETE FROM recent_searches WHERE created_at<?")
        .bind(now() - 90 * 86400000),
      db
        .prepare(
          "DELETE FROM uploads WHERE created_at<? AND NOT EXISTS(SELECT 1 FROM post_media WHERE upload_id=uploads.id) AND NOT EXISTS(SELECT 1 FROM messages WHERE upload_id=uploads.id) AND NOT EXISTS(SELECT 1 FROM profiles WHERE avatar_id=uploads.id OR banner_id=uploads.id)",
        )
        .bind(now() - 86400000),
    ]);
  },
};
