import { setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import {
  auth,
  router,
  q,
  one,
  rows,
  rate,
  id,
  now,
  fail,
  userProfile,
  type Ctx,
} from "./core";
import { randomToken, digest, hashPassword, verifyPassword } from "./security";
const app = router();
const username = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[a-zA-Z0-9_]+$/, "Username: латинские буквы, цифры и _");
const password = z
  .string()
  .min(10, "Пароль должен содержать минимум 10 символов")
  .max(128);
const credentials = z.object({
  email: z
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().max(128),
});
async function session(c: Ctx, userId: string) {
  const token = randomToken(),
    csrf = randomToken();
  const t = now();
  await q(
    c,
    "INSERT INTO sessions VALUES(?,?,?,?,?,?)",
    await digest(token),
    userId,
    csrf,
    t,
    t + 30 * 86400000,
    (c.req.header("user-agent") ?? "Browser").slice(0, 120),
  ).run();
  setCookie(c, "m2_session", token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Lax",
    path: "/",
    maxAge: 30 * 86400,
  });
  return csrf;
}
app.post("/register", async (c) => {
  await rate(
    c,
    `register:${c.req.header("cf-connecting-ip") ?? "local"}`,
    5,
    3600,
  );
  if (
    (
      await one<{ value: string }>(
        c,
        "SELECT value FROM platform_settings WHERE key='registration'",
      )
    )?.value === "false"
  )
    fail(403, "Регистрация временно закрыта");
  const v = z
    .object({
      email: z.email().max(254),
      password,
      username,
      display_name: z.string().trim().min(1).max(60),
    })
    .strict()
    .parse(await c.req.json());
  if (
    await one(
      c,
      "SELECT id FROM users WHERE email=? COLLATE NOCASE OR username=? COLLATE NOCASE",
      v.email,
      v.username,
    )
  )
    fail(409, "Email или username уже занят");
  const uid = id(),
    t = now();
  await c.env.DB.batch([
    q(
      c,
      "INSERT INTO users(id,email,username,password_hash,created_at) VALUES(?,?,?,?,?)",
      uid,
      v.email.toLowerCase(),
      v.username.toLowerCase(),
      await hashPassword(v.password),
      t,
    ),
    q(
      c,
      "INSERT INTO profiles(user_id,display_name) VALUES(?,?)",
      uid,
      v.display_name,
    ),
    q(c, "INSERT INTO user_roles(user_id) VALUES(?)", uid),
    q(c, "INSERT INTO user_settings(user_id) VALUES(?)", uid),
  ]);
  const csrf = await session(c, uid);
  return c.json({ csrf, user: await userProfile(c, v.username) }, 201);
});
app.post("/login", async (c) => {
  await rate(
    c,
    `login:${c.req.header("cf-connecting-ip") ?? "local"}`,
    15,
    900,
  );
  const v = credentials.parse(await c.req.json());
  const u = await one<{ id: string; username: string; password_hash: string }>(
    c,
    "SELECT id,username,password_hash FROM users WHERE email=? COLLATE NOCASE",
    v.email,
  );
  const hash =
    u?.password_hash ??
    (await hashPassword(
      "dummy-password-for-timing",
      "dummy-static-salt-for-timing",
    ));
  if (!(await verifyPassword(v.password, hash)) || !u)
    fail(401, "Неверный email или пароль");
  const csrf = await session(c, u.id);
  return c.json({ csrf, user: await userProfile(c, u.username) });
});
app.get("/me", async (c) => {
  const u = c.get("user");
  return c.json({
    user: u
      ? { ...(await userProfile(c, u.username)), banned_until: u.bannedUntil }
      : null,
    csrf: u?.csrf ?? null,
    settings: u
      ? await one(c, "SELECT * FROM user_settings WHERE user_id=?", u.id)
      : null,
  });
});
app.post("/logout", async (c) => {
  const u = auth(c, true);
  await q(c, "DELETE FROM sessions WHERE id=?", u.sessionId).run();
  deleteCookie(c, "m2_session", { path: "/" });
  return c.json({ ok: true });
});
app.get("/sessions", async (c) => {
  const u = auth(c, true);
  const list = await rows<{
    id: string;
    label: string;
    created_at: number;
    expires_at: number;
  }>(
    c,
    "SELECT id,label,created_at,expires_at FROM sessions WHERE user_id=? AND expires_at>?",
    u.id,
    now(),
  );
  return c.json(list.map((s) => ({ ...s, current: s.id === u.sessionId })));
});
app.delete("/sessions/:id", async (c) => {
  const u = auth(c, true);
  await q(
    c,
    "DELETE FROM sessions WHERE id=? AND user_id=?",
    c.req.param("id"),
    u.id,
  ).run();
  return c.json({ ok: true });
});
app.post("/password", async (c) => {
  const u = auth(c, true);
  await rate(c, `password:${u.id}`, 5, 900);
  const v = z
    .object({ current: z.string().max(128), password })
    .parse(await c.req.json());
  const row = await one<{ password_hash: string }>(
    c,
    "SELECT password_hash FROM users WHERE id=?",
    u.id,
  );
  if (!row || !(await verifyPassword(v.current, row.password_hash)))
    fail(403, "Текущий пароль неверен");
  await c.env.DB.batch([
    q(
      c,
      "UPDATE users SET password_hash=? WHERE id=?",
      await hashPassword(v.password),
      u.id,
    ),
    q(c, "DELETE FROM sessions WHERE user_id=? AND id!=?", u.id, u.sessionId),
  ]);
  return c.json({ ok: true });
});
app.delete("/account", async (c) => {
  const u = auth(c, true);
  const v = z
    .object({ password: z.string().max(128) })
    .parse(await c.req.json());
  const row = await one<{ password_hash: string }>(
    c,
    "SELECT password_hash FROM users WHERE id=?",
    u.id,
  );
  if (!row || !(await verifyPassword(v.password, row.password_hash)))
    fail(403, "Пароль неверен");
  if (
    u.role === "owner" &&
    (
      await one<{ n: number }>(
        c,
        "SELECT count(*) n FROM user_roles WHERE role='owner'",
      )
    )?.n === 1
  )
    fail(409, "Сначала назначьте другого Owner");
  await q(c, "DELETE FROM users WHERE id=?", u.id).run();
  deleteCookie(c, "m2_session", { path: "/" });
  return c.json({ ok: true });
});
app.post("/recover", async (c) => {
  await rate(
    c,
    `recover:${c.req.header("cf-connecting-ip") ?? "local"}`,
    3,
    3600,
  );
  if (!c.env.MAIL_API_KEY || !c.env.MAIL_FROM || !c.env.APP_ORIGIN)
    fail(
      503,
      "Восстановление пароля недоступно: владелец ещё не настроил доставку писем.",
    );
  const v = z.object({ email: z.email() }).parse(await c.req.json());
  const u = await one<{ id: string }>(
    c,
    "SELECT id FROM users WHERE email=? COLLATE NOCASE",
    v.email,
  );
  if (u) {
    const token = randomToken();
    await q(
      c,
      "INSERT INTO password_resets VALUES(?,?,?)",
      await digest(token),
      u.id,
      now() + 1800000,
    ).run();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.env.MAIL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: c.env.MAIL_FROM,
        to: v.email,
        subject: "M² — сброс пароля",
        text: `Ссылка действительна 30 минут: ${c.env.APP_ORIGIN}/reset?token=${token}`,
      }),
    });
    if (!res.ok) fail(503, "Не удалось отправить письмо. Повторите позже.");
  }
  return c.json({ ok: true });
});
app.post("/reset", async (c) => {
  await rate(
    c,
    `reset:${c.req.header("cf-connecting-ip") ?? "local"}`,
    10,
    900,
  );
  const v = z
    .object({ token: z.string().length(64), password })
    .parse(await c.req.json());
  const reset = await one<{ user_id: string }>(
    c,
    "DELETE FROM password_resets WHERE id=? AND expires_at>? RETURNING user_id",
    await digest(v.token),
    now(),
  );
  if (!reset) fail(400, "Ссылка недействительна или истекла");
  await c.env.DB.batch([
    q(
      c,
      "UPDATE users SET password_hash=? WHERE id=?",
      await hashPassword(v.password),
      reset.user_id,
    ),
    q(c, "DELETE FROM sessions WHERE user_id=?", reset.user_id),
    q(c, "DELETE FROM password_resets WHERE user_id=?", reset.user_id),
  ]);
  return c.json({ ok: true });
});
export default app;
