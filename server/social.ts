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
  notify,
  blocked,
  userProfile,
  accessiblePost,
  postSelect,
  visibility,
  event,
} from "./core";
import { tiers, imageType } from "./security";
const app = router();
const uidSchema = z.string().uuid();
const postSchema = z
  .object({
    content: z.string().trim().max(10000),
    parent_id: uidSchema.nullable().optional(),
    quote_id: uidSchema.nullable().optional(),
    reply_permission: z
      .enum(["everyone", "following", "nobody"])
      .default("everyone"),
    media: z.array(uidSchema).max(8).default([]),
  })
  .strict()
  .refine((v) => v.content.length > 0 || v.media.length > 0, {
    message: "Добавьте текст или изображение",
  });
app.get("/feed", async (c) => {
  const viewer = c.get("user")?.id ?? "";
  const mode = c.req.query("mode") ?? "for-you";
  const author = c.req.query("author");
  const parent = c.req.query("parent");
  const query = c.req.query("q")?.slice(0, 100);
  const sel = postSelect(viewer);
  const vis = visibility(viewer);
  const conditions = [vis.sql];
  const params: unknown[] = [...sel.params, ...vis.params];
  if (parent) {
    conditions.push("p.parent_id=?");
    params.push(parent);
    await accessiblePost(c, parent);
  } else if (c.req.query("tab") === "replies") {
    conditions.push("p.parent_id IS NOT NULL");
  } else conditions.push("p.parent_id IS NULL");
  if (author) {
    conditions.push(
      c.req.query("tab") === "reposts"
        ? "EXISTS(SELECT 1 FROM reposts rp WHERE rp.post_id=p.id AND rp.user_id=?)"
        : "p.user_id=?",
    );
    params.push(author);
  }
  if (c.req.query("tab") === "media")
    conditions.push("EXISTS(SELECT 1 FROM post_media WHERE post_id=p.id)");
  if (mode === "following") {
    auth(c);
    conditions.push(
      "EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followed_id=p.user_id)",
    );
    params.push(viewer);
  }
  if (mode === "bookmarks") {
    auth(c);
    conditions.push(
      "EXISTS(SELECT 1 FROM bookmarks WHERE user_id=? AND post_id=p.id)",
    );
    params.push(viewer);
  }
  if (query) {
    conditions.push("p.content LIKE ? ESCAPE '\\'");
    params.push(`%${query.replace(/[\\%_]/g, "\\$&")}%`);
  }
  conditions.push(
    "NOT EXISTS(SELECT 1 FROM mutes WHERE user_id=? AND muted_id=p.user_id)",
  );
  params.push(viewer);
  if (
    (
      await one<{ hide_seen: number }>(
        c,
        "SELECT hide_seen FROM user_settings WHERE user_id=?",
        viewer,
      )
    )?.hide_seen &&
    !author &&
    !parent
  ) {
    conditions.push(
      "NOT EXISTS(SELECT 1 FROM analytics_events WHERE viewer_id=? AND post_id=p.id AND type='post_view')",
    );
    params.push(viewer);
  }
  // A stable timestamp score with capped engagement, relationship and hashtag affinity bonuses.
  const ranked = mode === "for-you" && !author && !parent && !query;
  const escapedViewer = viewer.replace(/[^a-z0-9-]/gi, "");
  if (ranked) {
    conditions.push("p.created_at>?");
    params.push(now() - 7 * 86400000);
  }
  const score = ranked
    ? `(p.created_at + min((SELECT count(*) FROM likes WHERE post_id=p.id),50)*60000 + min((SELECT count(*) FROM posts WHERE parent_id=p.id AND hidden=0),20)*120000 + CASE WHEN EXISTS(SELECT 1 FROM follows WHERE follower_id='${escapedViewer}' AND followed_id=p.user_id) THEN 3600000 ELSE 0 END + min((SELECT count(*) FROM hashtags h WHERE h.post_id=p.id AND h.tag IN (SELECT h2.tag FROM hashtags h2 JOIN likes l ON h2.post_id=l.post_id WHERE l.user_id='${escapedViewer}')),3)*900000)`
    : author && c.req.query("tab") === "posts"
      ? "(CASE WHEN p.pinned>0 THEN 4000000000000000+p.pinned ELSE p.created_at END)"
      : "p.created_at";
  const cursor = c.req.query("cursor");
  if (cursor) {
    let parsed;
    try {
      parsed = JSON.parse(atob(cursor));
    } catch {
      fail(400, "Некорректный курсор");
    }
    const v = z.object({ score: z.number(), id: uidSchema }).parse(parsed);
    conditions.push(`(${score}<? OR (${score}=? AND p.id<?))`);
    params.push(v.score, v.score, v.id);
  }
  const sql = sel.sql.replace(
    "FROM posts p JOIN",
    `,${score} score FROM posts p JOIN`,
  );
  const result = await rows<{ id: string; score: number }>(
    c,
    `${sql} WHERE ${conditions.join(" AND ")} ORDER BY score DESC,p.id DESC LIMIT 21`,
    ...params,
  );
  const items = result.slice(0, 20);
  const last = items.at(-1);
  return c.json({
    items,
    next:
      result.length > 20 && last
        ? btoa(JSON.stringify({ score: last.score, id: last.id }))
        : null,
  });
});
app.get("/posts/:id", async (c) =>
  c.json(await accessiblePost(c, c.req.param("id"))),
);
app.post("/posts", async (c) => {
  const u = auth(c);
  await rate(c, `post:${u.id}`, 20, 3600);
  const v = postSchema.parse(await c.req.json());
  const features = tiers[u.tier];
  if (
    [...v.content].length > features.maxChars ||
    v.media.length > features.maxImages
  )
    fail(400, "Превышен лимит вашего уровня");
  if (new Set(v.media).size !== v.media.length)
    fail(400, "Повторяющиеся изображения");
  for (const media of v.media)
    if (
      !(await one(
        c,
        "SELECT 1 FROM uploads WHERE id=? AND user_id=?",
        media,
        u.id,
      ))
    )
      fail(403, "Нет доступа к файлу");
  let parent: null | Awaited<ReturnType<typeof accessiblePost>> = null;
  if (v.parent_id) {
    parent = await accessiblePost(c, v.parent_id);
    if (parent.reply_permission === "nobody" && parent.user_id !== u.id)
      fail(403, "Ответы закрыты");
    if (
      parent.reply_permission === "following" &&
      parent.user_id !== u.id &&
      !(await one(
        c,
        "SELECT 1 FROM follows WHERE follower_id=? AND followed_id=?",
        parent.user_id,
        u.id,
      ))
    )
      fail(403, "Отвечать могут только подписки автора");
  }
  if (v.quote_id) await accessiblePost(c, v.quote_id);
  const pid = id(),
    t = now();
  const statements = [
    q(
      c,
      "INSERT INTO posts(id,user_id,content,parent_id,quote_id,reply_permission,created_at) VALUES(?,?,?,?,?,?,?)",
      pid,
      u.id,
      v.content,
      v.parent_id ?? null,
      v.quote_id ?? null,
      v.reply_permission,
      t,
    ),
  ];
  v.media.forEach((media, i) =>
    statements.push(
      q(c, "INSERT INTO post_media VALUES(?,?,?)", pid, media, i),
    ),
  );
  const tags = [
    ...new Set(
      v.content
        .match(/#[\p{L}\p{N}_]+/gu)
        ?.map((t) => t.slice(1).toLowerCase()) ?? [],
    ),
  ].slice(0, 10);
  for (const tag of tags)
    statements.push(q(c, "INSERT INTO hashtags VALUES(?,?)", tag, pid));
  await c.env.DB.batch(statements);
  if (parent) await notify(c, parent.user_id, "reply", pid);
  const mentions = [
    ...new Set(
      v.content
        .match(/@[a-zA-Z0-9_]+/g)
        ?.map((s) => s.slice(1).toLowerCase()) ?? [],
    ),
  ].slice(0, 10);
  for (const mention of mentions) {
    const target = await one<{ id: string }>(
      c,
      "SELECT id FROM users WHERE username=?",
      mention,
    );
    if (target && target.id !== parent?.user_id)
      await notify(c, target.id, "mention", pid);
  }
  return c.json(await accessiblePost(c, pid), 201);
});
app.patch("/posts/:id", async (c) => {
  const u = auth(c);
  const post = await accessiblePost(c, c.req.param("id"));
  if (post.user_id !== u.id)
    fail(403, "Можно редактировать только свои публикации");
  const v = z
    .object({ content: z.string().trim().min(1).max(tiers[u.tier].maxChars) })
    .strict()
    .parse(await c.req.json());
  const statements = [
    q(
      c,
      "INSERT INTO post_history VALUES(?,?,?,?)",
      id(),
      post.id,
      post.content,
      now(),
    ),
    q(
      c,
      "UPDATE posts SET content=?,edited_at=? WHERE id=?",
      v.content,
      now(),
      post.id,
    ),
    q(c, "DELETE FROM hashtags WHERE post_id=?", post.id),
  ];
  for (const tag of [
    ...new Set(
      v.content
        .match(/#[\p{L}\p{N}_]+/gu)
        ?.map((t) => t.slice(1).toLowerCase()) ?? [],
    ),
  ].slice(0, 10))
    statements.push(q(c, "INSERT INTO hashtags VALUES(?,?)", tag, post.id));
  await c.env.DB.batch(statements);
  return c.json(await accessiblePost(c, post.id));
});
app.delete("/posts/:id", async (c) => {
  const u = auth(c);
  const post = await accessiblePost(c, c.req.param("id"));
  if (post.user_id !== u.id) fail(403, "Можно удалить только свою публикацию");
  await q(c, "DELETE FROM posts WHERE id=? AND user_id=?", post.id, u.id).run();
  return c.json({ ok: true });
});
app.get("/posts/:id/history", async (c) => {
  const u = auth(c);
  const post = await accessiblePost(c, c.req.param("id"));
  if (post.user_id !== u.id || u.tier === "free")
    fail(403, "История доступна Premium-автору");
  return c.json(
    await rows(
      c,
      "SELECT content,edited_at FROM post_history WHERE post_id=? ORDER BY edited_at DESC LIMIT 50",
      post.id,
    ),
  );
});
app.post("/posts/:id/pin", async (c) => {
  const u = auth(c);
  const post = await accessiblePost(c, c.req.param("id"));
  if (post.user_id !== u.id) fail(403, "Нет доступа");
  const v = z.object({ pinned: z.boolean() }).parse(await c.req.json());
  if (v.pinned) {
    const count = await one<{ n: number }>(
      c,
      "SELECT count(*) n FROM posts WHERE user_id=? AND pinned>0",
      u.id,
    );
    if ((count?.n ?? 0) >= tiers[u.tier].maxPins && !post.pinned)
      fail(400, "Достигнут лимит закреплений");
  }
  await q(
    c,
    "UPDATE posts SET pinned=? WHERE id=?",
    v.pinned ? now() : 0,
    post.id,
  ).run();
  return c.json({ ok: true });
});
for (const [path, table, type] of [
  ["like", "likes", "like"],
  ["repost", "reposts", "repost"],
  ["bookmark", "bookmarks", "bookmark"],
] as const) {
  app.put(`/posts/:id/${path}`, async (c) => {
    const u = auth(c);
    await rate(c, `react:${u.id}`, 120, 3600);
    const post = await accessiblePost(c, c.req.param("id"));
    const res = await q(
      c,
      `INSERT OR IGNORE INTO ${table} VALUES(?,?,?)`,
      u.id,
      post.id,
      now(),
    ).run();
    if (res.meta.changes && type !== "bookmark") {
      await notify(c, post.user_id, type, post.id);
      await event(c, post.user_id, "interaction", post.id);
    }
    return c.json({ ok: true });
  });
  app.delete(`/posts/:id/${path}`, async (c) => {
    const u = auth(c);
    await q(
      c,
      `DELETE FROM ${table} WHERE user_id=? AND post_id=?`,
      u.id,
      c.req.param("id"),
    ).run();
    return c.json({ ok: true });
  });
}
app.post("/posts/:id/view", async (c) => {
  auth(c);
  const p = await accessiblePost(c, c.req.param("id"));
  await event(c, p.user_id, "post_view", p.id);
  return c.json({ ok: true });
});
app.get("/users/:username", async (c) => {
  const p = await userProfile(c, c.req.param("username"));
  if (!p) fail(404, "Такого аккаунта пока нет");
  const u = c.get("user");
  if (u && (await blocked(c, u.id, p.id as string)))
    fail(404, "Аккаунт недоступен");
  if (u) await event(c, p.id as string, "profile_view");
  return c.json(p);
});
app.get("/people", async (c) => {
  const viewer = c.get("user")?.id ?? "";
  const query = (c.req.query("q") ?? "").slice(0, 100);
  const escaped = query.replace(/[\\%_]/g, "\\$&");
  return c.json(
    await rows(
      c,
      `SELECT u.id,u.username,p.display_name,p.avatar_id,p.bio,EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followed_id=u.id) is_following FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.id!=? AND (u.banned_until IS NULL OR u.banned_until<?) AND (u.username LIKE ? ESCAPE '\\' OR p.display_name LIKE ? ESCAPE '\\') AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=u.id) OR (blocked_id=? AND blocker_id=u.id)) ORDER BY (SELECT count(*) FROM follows WHERE followed_id=u.id) DESC,u.created_at DESC LIMIT 20`,
      viewer,
      viewer,
      now(),
      `%${escaped}%`,
      `%${escaped}%`,
      viewer,
      viewer,
    ),
  );
});
app.patch("/profile", async (c) => {
  const u = auth(c);
  const v = z
    .object({
      username: z
        .string()
        .min(3)
        .max(24)
        .regex(/^[a-zA-Z0-9_]+$/)
        .transform((s) => s.toLowerCase()),
      display_name: z.string().trim().min(1).max(60),
      bio: z.string().max(tiers[u.tier].bioLength),
      website: z.union([
        z.literal(""),
        z
          .url()
          .max(200)
          .refine((s) => /^https?:\/\//.test(s)),
      ]),
      status: z.string().max(60).default(""),
      avatar_id: uidSchema.nullable().optional(),
      banner_id: uidSchema.nullable().optional(),
      style: z.enum(["classic", "outline", "editorial"]).default("classic"),
      private: z.boolean().default(false),
      allow_messages: z
        .enum(["everyone", "following", "nobody"])
        .default("everyone"),
    })
    .strict()
    .parse(await c.req.json());
  if (u.tier === "free" && (v.banner_id || v.status || v.style !== "classic"))
    fail(403, "Это оформление доступно с Premium");
  for (const image of [v.avatar_id, v.banner_id])
    if (
      image &&
      !(await one(
        c,
        "SELECT 1 FROM uploads WHERE id=? AND user_id=?",
        image,
        u.id,
      ))
    )
      fail(403, "Нет доступа к файлу");
  if (
    await one(
      c,
      "SELECT 1 FROM users WHERE username=? COLLATE NOCASE AND id!=?",
      v.username,
      u.id,
    )
  )
    fail(409, "Username уже занят");
  await c.env.DB.batch([
    q(c, "UPDATE users SET username=? WHERE id=?", v.username, u.id),
    q(
      c,
      "UPDATE profiles SET display_name=?,bio=?,website=?,status=?,avatar_id=?,banner_id=?,style=?,private=?,allow_messages=? WHERE user_id=?",
      v.display_name,
      v.bio,
      v.website,
      v.status,
      v.avatar_id ?? null,
      v.banner_id ?? null,
      v.style,
      v.private ? 1 : 0,
      v.allow_messages,
      u.id,
    ),
  ]);
  return c.json(await userProfile(c, v.username));
});
app.put("/users/:id/follow", async (c) => {
  const u = auth(c);
  const target = uidSchema.parse(c.req.param("id"));
  if (target === u.id) fail(400, "Нельзя подписаться на себя");
  if (await blocked(c, u.id, target)) fail(403, "Аккаунт заблокирован");
  if (!(await one(c, "SELECT 1 FROM users WHERE id=?", target)))
    fail(404, "Аккаунт не найден");
  const res = await q(
    c,
    "INSERT OR IGNORE INTO follows VALUES(?,?,?)",
    u.id,
    target,
    now(),
  ).run();
  if (res.meta.changes) {
    await notify(c, target, "follow");
    await event(c, target, "follow");
  }
  return c.json({ ok: true });
});
app.delete("/users/:id/follow", async (c) => {
  const u = auth(c);
  await q(
    c,
    "DELETE FROM follows WHERE follower_id=? AND followed_id=?",
    u.id,
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});
app.put("/users/:id/block", async (c) => {
  const u = auth(c);
  const target = uidSchema.parse(c.req.param("id"));
  if (target === u.id) fail(400, "Нельзя заблокировать себя");
  if (!(await one(c, "SELECT 1 FROM users WHERE id=?", target)))
    fail(404, "Аккаунт не найден");
  await c.env.DB.batch([
    q(c, "INSERT OR IGNORE INTO blocks VALUES(?,?,?)", u.id, target, now()),
    q(
      c,
      "DELETE FROM follows WHERE (follower_id=? AND followed_id=?) OR (follower_id=? AND followed_id=?)",
      u.id,
      target,
      target,
      u.id,
    ),
  ]);
  return c.json({ ok: true });
});
app.delete("/users/:id/block", async (c) => {
  const u = auth(c);
  await q(
    c,
    "DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?",
    u.id,
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});
app.put("/users/:id/mute", async (c) => {
  const u = auth(c);
  const target = uidSchema.parse(c.req.param("id"));
  if (!(await one(c, "SELECT 1 FROM users WHERE id=?", target)))
    fail(404, "Аккаунт не найден");
  await q(c, "INSERT OR IGNORE INTO mutes VALUES(?,?)", u.id, target).run();
  return c.json({ ok: true });
});
app.delete("/users/:id/mute", async (c) => {
  const u = auth(c);
  await q(
    c,
    "DELETE FROM mutes WHERE user_id=? AND muted_id=?",
    u.id,
    c.req.param("id"),
  ).run();
  return c.json({ ok: true });
});
app.get("/safety", async (c) => {
  const u = auth(c, true);
  return c.json({
    blocks: await rows(
      c,
      "SELECT u.id,u.username FROM users u JOIN blocks b ON b.blocked_id=u.id WHERE b.blocker_id=?",
      u.id,
    ),
    mutes: await rows(
      c,
      "SELECT u.id,u.username FROM users u JOIN mutes m ON m.muted_id=u.id WHERE m.user_id=?",
      u.id,
    ),
  });
});
app.post("/uploads", async (c) => {
  const u = auth(c);
  await rate(c, `upload:${u.id}`, 20, 3600);
  const length = Number(c.req.header("content-length") ?? 0);
  if (length > 520000) fail(413, "Максимум 500 КБ на изображение");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 512000 || file.size === 0)
    fail(400, "Выберите изображение до 500 КБ");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = imageType(bytes);
  if (!mime || file.type !== mime)
    fail(400, "Поддерживаются настоящие PNG, JPEG и WebP");
  const sum = await one<{ total: number }>(
    c,
    "SELECT COALESCE(sum(size),0) total FROM uploads WHERE user_id=?",
    u.id,
  );
  if ((sum?.total ?? 0) + file.size > 5 * 1024 * 1024)
    fail(400, "Лимит хранилища аккаунта — 5 МБ");
  const upload = id();
  let data = "";
  for (let start = 0; start < bytes.length; start += 8192)
    data += String.fromCharCode(...bytes.slice(start, start + 8192));
  const inserted = await q(
    c,
    "INSERT INTO uploads SELECT ?,?,?,?,?,? WHERE (SELECT COALESCE(sum(size),0) FROM uploads WHERE user_id=?)+?<=5242880",
    upload,
    u.id,
    mime,
    file.size,
    btoa(data),
    now(),
    u.id,
    file.size,
  ).run();
  if (!inserted.meta.changes) fail(400, "Лимит хранилища аккаунта — 5 МБ");
  return c.json({ id: upload }, 201);
});
app.get("/topics", async (c) => {
  const v = visibility(c.get("user")?.id ?? "");
  return c.json(
    await rows(
      c,
      `SELECT h.tag,count(*) count FROM hashtags h JOIN posts p ON p.id=h.post_id JOIN profiles pr ON pr.user_id=p.user_id JOIN users u ON u.id=p.user_id WHERE ${v.sql} GROUP BY h.tag ORDER BY count DESC LIMIT 6`,
      ...v.params,
    ),
  );
});
app.get("/notifications", async (c) => {
  const u = auth(c, true);
  return c.json(
    await rows(
      c,
      "SELECT n.*,u.username,p.display_name,p.avatar_id FROM notifications n LEFT JOIN users u ON n.actor_id=u.id LEFT JOIN profiles p ON p.user_id=u.id WHERE n.user_id=? AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=n.actor_id) OR (blocked_id=? AND blocker_id=n.actor_id)) ORDER BY n.created_at DESC LIMIT 60",
      u.id,
      u.id,
      u.id,
    ),
  );
});
app.post("/notifications/read", async (c) => {
  const u = auth(c, true);
  await q(
    c,
    "UPDATE notifications SET read_at=? WHERE user_id=? AND read_at IS NULL",
    now(),
    u.id,
  ).run();
  return c.json({ ok: true });
});
app.get("/counts", async (c) => {
  const u = auth(c, true);
  return c.json({
    notifications:
      (
        await one<{ n: number }>(
          c,
          "SELECT count(*) n FROM notifications WHERE user_id=? AND read_at IS NULL",
          u.id,
        )
      )?.n ?? 0,
    messages:
      (
        await one<{ n: number }>(
          c,
          "SELECT count(*) n FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE (c.member_a=? OR c.member_b=?) AND m.user_id!=? AND m.read_at IS NULL",
          u.id,
          u.id,
          u.id,
        )
      )?.n ?? 0,
  });
});
app.get("/drafts", async (c) => {
  const u = auth(c);
  return c.json(
    await rows(
      c,
      "SELECT * FROM drafts WHERE user_id=? ORDER BY updated_at DESC LIMIT 30",
      u.id,
    ),
  );
});
app.post("/drafts", async (c) => {
  const u = auth(c);
  const v = z
    .object({ content: z.string().max(tiers[u.tier].maxChars) })
    .parse(await c.req.json());
  const n = await one<{ n: number }>(
    c,
    "SELECT count(*) n FROM drafts WHERE user_id=?",
    u.id,
  );
  if ((n?.n ?? 0) >= 30) fail(400, "Максимум 30 черновиков");
  await q(
    c,
    "INSERT INTO drafts VALUES(?,?,?,?)",
    id(),
    u.id,
    v.content,
    now(),
  ).run();
  return c.json({ ok: true });
});
app.delete("/drafts/:id", async (c) => {
  const u = auth(c);
  await q(
    c,
    "DELETE FROM drafts WHERE id=? AND user_id=?",
    c.req.param("id"),
    u.id,
  ).run();
  return c.json({ ok: true });
});
app.patch("/settings", async (c) => {
  const u = auth(c, true);
  const v = z
    .object({
      language: z.enum(["ru", "en", "kk"]),
      theme: z.enum(["dark", "light", "system"]),
      hide_seen: z.boolean(),
      notifications: z.boolean(),
      reduced_motion: z.boolean(),
    })
    .strict()
    .parse(await c.req.json());
  await q(
    c,
    "UPDATE user_settings SET language=?,theme=?,hide_seen=?,notifications=?,reduced_motion=? WHERE user_id=?",
    v.language,
    v.theme,
    +v.hide_seen,
    +v.notifications,
    +v.reduced_motion,
    u.id,
  ).run();
  return c.json({ ok: true });
});
app.post("/reports", async (c) => {
  const u = auth(c);
  await rate(c, `report:${u.id}`, 10, 3600);
  const v = z
    .object({
      post_id: uidSchema.optional(),
      target_user_id: uidSchema.optional(),
      message_id: uidSchema.optional(),
      reason: z.string().trim().min(5).max(1000),
    })
    .strict()
    .parse(await c.req.json());
  if (!v.post_id && !v.target_user_id && !v.message_id)
    fail(400, "Укажите объект жалобы");
  if (v.post_id) await accessiblePost(c, v.post_id);
  if (
    v.message_id &&
    !(await one(
      c,
      "SELECT 1 FROM messages m JOIN conversations t ON t.id=m.conversation_id WHERE m.id=? AND (t.member_a=? OR t.member_b=?)",
      v.message_id,
      u.id,
      u.id,
    ))
  )
    fail(404, "Сообщение не найдено");
  await q(
    c,
    "INSERT INTO reports(id,reporter_id,target_user_id,post_id,message_id,reason,created_at) VALUES(?,?,?,?,?,?,?)",
    id(),
    u.id,
    v.target_user_id ?? null,
    v.post_id ?? null,
    v.message_id ?? null,
    v.reason,
    now(),
  ).run();
  return c.json({ ok: true });
});
app.post("/appeals", async (c) => {
  const u = auth(c, true);
  await rate(c, `appeal:${u.id}`, 2, 86400);
  const v = z
    .object({ reason: z.string().trim().min(10).max(2000) })
    .parse(await c.req.json());
  await q(
    c,
    "INSERT INTO appeals VALUES(?,?,?,?)",
    id(),
    u.id,
    v.reason,
    now(),
  ).run();
  return c.json({ ok: true });
});
app.get("/analytics", async (c) => {
  const u = auth(c);
  if (u.tier === "free") fail(403, "Аналитика доступна с Premium");
  const days = c.req.query("days") === "30" ? 30 : 7;
  const since = now() - days * 86400000;
  return c.json({
    daily: await rows(
      c,
      "SELECT day,type,count(*) count FROM analytics_events WHERE user_id=? AND created_at>? GROUP BY day,type ORDER BY day",
      u.id,
      since,
    ),
    top: await rows(
      c,
      "SELECT p.id,p.content,count(e.id) views FROM posts p LEFT JOIN analytics_events e ON e.post_id=p.id AND e.type='post_view' AND e.created_at>? WHERE p.user_id=? GROUP BY p.id ORDER BY views DESC LIMIT 5",
      since,
      u.id,
    ),
    followers:
      (
        await one<{ n: number }>(
          c,
          "SELECT count(*) n FROM follows WHERE followed_id=?",
          u.id,
        )
      )?.n ?? 0,
  });
});
app.get("/export", async (c) => {
  const u = auth(c, true);
  const data = {
    profile: await userProfile(c, u.username),
    posts: await rows(
      c,
      "SELECT * FROM posts WHERE user_id=? LIMIT 10000",
      u.id,
    ),
    drafts: await rows(c, "SELECT * FROM drafts WHERE user_id=?", u.id),
    following: await rows(
      c,
      "SELECT followed_id,created_at FROM follows WHERE follower_id=?",
      u.id,
    ),
    settings: await one(c, "SELECT * FROM user_settings WHERE user_id=?", u.id),
    messages: await rows(
      c,
      "SELECT * FROM messages WHERE user_id=? LIMIT 10000",
      u.id,
    ),
  };
  c.header("Content-Disposition", 'attachment; filename="m2-data.json"');
  return c.json({ ...data, limit: 10000 });
});
app.get("/searches", async (c) => {
  const u = auth(c);
  return c.json(
    await rows(
      c,
      "SELECT query FROM recent_searches WHERE user_id=? ORDER BY created_at DESC LIMIT 5",
      u.id,
    ),
  );
});
app.post("/searches", async (c) => {
  const u = auth(c);
  const v = z
    .object({ query: z.string().trim().min(1).max(100) })
    .parse(await c.req.json());
  await q(
    c,
    "INSERT INTO recent_searches VALUES(?,?,?) ON CONFLICT(user_id,query) DO UPDATE SET created_at=excluded.created_at",
    u.id,
    v.query,
    now(),
  ).run();
  return c.json({ ok: true });
});
export default app;
