import { z } from "zod";
import {
  router,
  auth,
  q,
  one,
  rows,
  rate,
  id,
  now,
  fail,
  blocked,
} from "./core";
const app = router();
async function canMessage(c: Parameters<typeof auth>[0], target: string) {
  const u = auth(c);
  if (await blocked(c, u.id, target))
    fail(403, "Переписка недоступна: аккаунт заблокирован");
  const p = await one<{ allow_messages: string }>(
    c,
    "SELECT allow_messages FROM profiles WHERE user_id=?",
    target,
  );
  if (!p) fail(404, "Аккаунт не найден");
  if (
    p.allow_messages === "nobody" ||
    (p.allow_messages === "following" &&
      !(await one(
        c,
        "SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?",
        target,
        u.id,
      )))
  )
    fail(403, "Пользователь ограничил личные сообщения");
}
app.get("/conversations", async (c) => {
  const u = auth(c);
  return c.json(
    await rows(
      c,
      `SELECT t.id,u.username,u.id user_id,p.display_name,p.avatar_id,(SELECT content FROM messages WHERE conversation_id=t.id ORDER BY created_at DESC,id DESC LIMIT 1) last_message,(SELECT max(created_at) FROM messages WHERE conversation_id=t.id) last_at,(SELECT count(*) FROM messages WHERE conversation_id=t.id AND user_id!=? AND read_at IS NULL) unread FROM conversations t JOIN users u ON u.id=CASE WHEN t.member_a=? THEN t.member_b ELSE t.member_a END JOIN profiles p ON p.user_id=u.id WHERE (t.member_a=? OR t.member_b=?) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocked_id=? AND b.blocker_id=u.id)) ORDER BY COALESCE(last_at,t.created_at) DESC LIMIT 50`,
      u.id,
      u.id,
      u.id,
      u.id,
      u.id,
      u.id,
    ),
  );
});
app.post("/conversations", async (c) => {
  const u = auth(c);
  await rate(c, `conversation:${u.id}`, 20, 3600);
  const v = z
    .object({ user_id: z.string().uuid() })
    .strict()
    .parse(await c.req.json());
  if (v.user_id === u.id) fail(400, "Нельзя начать диалог с собой");
  await canMessage(c, v.user_id);
  const [a, b] = [u.id, v.user_id].sort();
  await q(
    c,
    "INSERT OR IGNORE INTO conversations VALUES(?,?,?,?)",
    id(),
    a,
    b,
    now(),
  ).run();
  return c.json(
    await one(
      c,
      "SELECT id FROM conversations WHERE member_a=? AND member_b=?",
      a,
      b,
    ),
  );
});
async function thread(c: Parameters<typeof auth>[0], tid: string) {
  const u = auth(c);
  const t = await one<{ member_a: string; member_b: string }>(
    c,
    "SELECT member_a,member_b FROM conversations WHERE id=? AND (member_a=? OR member_b=?)",
    tid,
    u.id,
    u.id,
  );
  if (!t) fail(404, "Диалог не найден");
  if (await blocked(c, u.id, t.member_a === u.id ? t.member_b : t.member_a))
    fail(403, "Диалог заблокирован");
  return t;
}
app.get("/conversations/:id/messages", async (c) => {
  const u = auth(c);
  await thread(c, c.req.param("id"));
  const before = c.req.query("before");
  let condition = "";
  const params: unknown[] = [c.req.param("id")];
  if (before) {
    const v = z
      .object({ t: z.number(), id: z.string().uuid() })
      .parse(JSON.parse(atob(before)));
    condition = " AND (created_at<? OR (created_at=? AND id<?))";
    params.push(v.t, v.t, v.id);
  }
  const list = await rows<{ id: string; created_at: number }>(
    c,
    `SELECT * FROM messages WHERE conversation_id=?${condition} ORDER BY created_at DESC,id DESC LIMIT 41`,
    ...params,
  );
  await q(
    c,
    "UPDATE messages SET read_at=? WHERE conversation_id=? AND user_id!=? AND read_at IS NULL",
    now(),
    c.req.param("id"),
    u.id,
  ).run();
  const page = list.slice(0, 40);
  const last = page.at(-1);
  return c.json({
    items: page.reverse(),
    next:
      list.length > 40 && last
        ? btoa(JSON.stringify({ t: last.created_at, id: last.id }))
        : null,
  });
});
app.post("/conversations/:id/messages", async (c) => {
  const u = auth(c);
  await rate(c, `message:${u.id}`, 60, 3600);
  const t = await thread(c, c.req.param("id"));
  await canMessage(c, t.member_a === u.id ? t.member_b : t.member_a);
  const v = z
    .object({
      content: z.string().trim().max(2000),
      upload_id: z.string().uuid().nullable().optional(),
    })
    .strict()
    .refine((v) => v.content.length > 0 || v.upload_id, {
      message: "Сообщение пустое",
    })
    .parse(await c.req.json());
  if (
    v.upload_id &&
    !(await one(
      c,
      "SELECT 1 FROM uploads WHERE id=? AND user_id=?",
      v.upload_id,
      u.id,
    ))
  )
    fail(403, "Нет доступа к файлу");
  const mid = id();
  await q(
    c,
    "INSERT INTO messages(id,conversation_id,user_id,content,upload_id,created_at) VALUES(?,?,?,?,?,?)",
    mid,
    c.req.param("id"),
    u.id,
    v.content,
    v.upload_id ?? null,
    now(),
  ).run();
  return c.json({ id: mid }, 201);
});
app.delete("/messages/:id", async (c) => {
  const u = auth(c);
  await q(
    c,
    "DELETE FROM messages WHERE id=? AND user_id=?",
    c.req.param("id"),
    u.id,
  ).run();
  return c.json({ ok: true });
});
export default app;
