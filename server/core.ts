import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, gt } from "drizzle-orm";
import { getCookie } from "hono/cookie";
import { sessions, users } from "./schema";
import { digest, type Tier, type Role } from "./security";
export type Identity = {
  id: string;
  username: string;
  role: Role;
  tier: Tier;
  csrf: string;
  sessionId: string;
  bannedUntil: number | null;
};
export type Env = {
  Bindings: {
    DB: D1Database;
    ASSETS: Fetcher;
    MAIL_API_KEY?: string;
    MAIL_FROM?: string;
    APP_ORIGIN?: string;
  };
  Variables: { user: Identity | null };
};
export type Ctx = Context<Env>;
export const router = () => new Hono<Env>();
export const now = () => Date.now();
export const id = () => crypto.randomUUID();
export function fail(
  status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503,
  message: string,
): never {
  throw new HTTPException(status, { message });
}
export const q = (c: Ctx, sql: string, ...params: unknown[]) =>
  c.env.DB.prepare(sql).bind(...params);
export async function rows<T = Record<string, unknown>>(
  c: Ctx,
  sql: string,
  ...params: unknown[]
) {
  return (await q(c, sql, ...params).all<T>()).results;
}
export async function one<T = Record<string, unknown>>(
  c: Ctx,
  sql: string,
  ...params: unknown[]
) {
  return q(c, sql, ...params).first<T>();
}
export function auth(c: Ctx, allowBanned = false) {
  const u = c.get("user");
  if (!u) fail(401, "Войдите в аккаунт");
  if (!allowBanned && u.bannedUntil && u.bannedUntil > now())
    fail(403, "Аккаунт ограничен. Обратитесь через раздел обжалования.");
  return u;
}
export async function permission(c: Ctx, key: string) {
  const u = auth(c);
  if (
    !(await one(
      c,
      "SELECT 1 FROM role_permissions WHERE role=? AND permission=?",
      u.role,
      key,
    ))
  )
    fail(403, "Недостаточно прав");
  return u;
}
export async function identity(c: Ctx) {
  c.set("user", null);
  const token = getCookie(c, "m2_session");
  if (!token) return;
  const db = drizzle(c.env.DB);
  const result = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(
      and(eq(sessions.id, await digest(token)), gt(sessions.expiresAt, now())),
    )
    .get();
  if (!result) return;
  const role = await one<{ role: Role }>(
    c,
    "SELECT role FROM user_roles WHERE user_id=?",
    result.user.id,
  );
  const grant = await one<{ tier: Tier }>(
    c,
    "SELECT tier FROM premium_grants WHERE user_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) ORDER BY CASE tier WHEN 'elite' THEN 3 WHEN 'premium_plus' THEN 2 ELSE 1 END DESC LIMIT 1",
    result.user.id,
    now(),
  );
  c.set("user", {
    id: result.user.id,
    username: result.user.username,
    role: role?.role ?? "user",
    tier: grant?.tier ?? "free",
    csrf: result.session.csrf,
    sessionId: result.session.id,
    bannedUntil: result.user.bannedUntil,
  });
}
export async function rate(
  c: Ctx,
  key: string,
  limit: number,
  seconds: number,
) {
  const t = now();
  const result = await one<{ count: number }>(
    c,
    "INSERT INTO rate_limits(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at<? THEN excluded.expires_at ELSE expires_at END RETURNING count",
    key,
    t + seconds * 1000,
    t,
    t,
  );
  if ((result?.count ?? 0) > limit)
    fail(429, "Слишком много запросов. Попробуйте позже.");
}
export const blocked = async (c: Ctx, a: string, b: string) =>
  !!(await one(
    c,
    "SELECT 1 FROM blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)",
    a,
    b,
    b,
    a,
  ));
export async function notify(
  c: Ctx,
  userId: string,
  type: string,
  postId: string | null = null,
  text = "",
) {
  const actor = auth(c);
  if (actor.id === userId) return;
  if (await blocked(c, actor.id, userId)) return;
  if (
    await one(
      c,
      "SELECT 1 FROM user_settings WHERE user_id=? AND notifications=0",
      userId,
    )
  )
    return;
  await q(
    c,
    "INSERT INTO notifications(id,user_id,actor_id,type,post_id,text,created_at) VALUES(?,?,?,?,?,?,?)",
    id(),
    userId,
    actor.id,
    type,
    postId,
    text,
    now(),
  ).run();
}
export async function audit(
  c: Ctx,
  action: string,
  target: string,
  detail: string,
) {
  return q(
    c,
    "INSERT INTO admin_audit_logs VALUES(?,?,?,?,?,?)",
    id(),
    auth(c).id,
    action,
    target,
    detail,
    now(),
  ).run();
}
export async function userProfile(c: Ctx, username: string) {
  const viewer = c.get("user")?.id ?? "";
  return one(
    c,
    `SELECT u.id,u.username,u.created_at,p.*,r.role,
  (SELECT count(*) FROM follows WHERE followed_id=u.id) followers,
  (SELECT count(*) FROM follows WHERE follower_id=u.id) following,
  (SELECT count(*) FROM posts WHERE user_id=u.id AND parent_id IS NULL AND hidden=0) post_count,
  EXISTS(SELECT 1 FROM follows WHERE follower_id=? AND followed_id=u.id) is_following,
  COALESCE((SELECT tier FROM premium_grants WHERE user_id=u.id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) ORDER BY CASE tier WHEN 'elite' THEN 3 WHEN 'premium_plus' THEN 2 ELSE 1 END DESC LIMIT 1),'free') tier,
  (SELECT json_group_array(badge) FROM badges WHERE user_id=u.id) badges
  FROM users u JOIN profiles p ON p.user_id=u.id JOIN user_roles r ON r.user_id=u.id WHERE u.username=? COLLATE NOCASE`,
    viewer,
    now(),
    username,
  );
}
export function visibility(viewer: string) {
  return {
    sql: `p.hidden=0 AND (u.banned_until IS NULL OR u.banned_until<${now()}) AND (pr.private=0 OR p.user_id=?) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=p.user_id) OR (b.blocker_id=p.user_id AND b.blocked_id=?))`,
    params: [viewer, viewer, viewer],
  };
}
export const postSelect = (viewer: string) => ({
  sql: `SELECT p.*,u.username,pr.display_name,pr.avatar_id,
  (SELECT count(*) FROM likes WHERE post_id=p.id) likes,
  (SELECT count(*) FROM posts WHERE parent_id=p.id AND hidden=0) replies,
  (SELECT count(*) FROM reposts WHERE post_id=p.id) reposts,
  EXISTS(SELECT 1 FROM likes WHERE post_id=p.id AND user_id=?) liked,
  EXISTS(SELECT 1 FROM reposts WHERE post_id=p.id AND user_id=?) reposted,
  EXISTS(SELECT 1 FROM bookmarks WHERE post_id=p.id AND user_id=?) bookmarked,
  (SELECT json_group_array(upload_id) FROM (SELECT upload_id FROM post_media WHERE post_id=p.id ORDER BY position)) media,
  COALESCE((SELECT tier FROM premium_grants WHERE user_id=u.id AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) ORDER BY CASE tier WHEN 'elite' THEN 3 WHEN 'premium_plus' THEN 2 ELSE 1 END DESC LIMIT 1),'free') tier
  FROM posts p JOIN users u ON p.user_id=u.id JOIN profiles pr ON pr.user_id=u.id`,
  params: [viewer, viewer, viewer, now()],
});
export async function accessiblePost(c: Ctx, postId: string) {
  const viewer = c.get("user")?.id ?? "";
  const vis = visibility(viewer);
  const sel = postSelect(viewer);
  const post = await one<
    {
      id: string;
      user_id: string;
      content: string;
      parent_id: string | null;
      reply_permission: string;
    } & Record<string, unknown>
  >(
    c,
    `${sel.sql} WHERE p.id=? AND ${vis.sql}`,
    ...sel.params,
    postId,
    ...vis.params,
  );
  if (!post) fail(404, "Публикация не найдена");
  return post;
}
export async function event(
  c: Ctx,
  userId: string,
  type: "post_view" | "profile_view" | "follow" | "interaction",
  postId: string | null = null,
) {
  const viewer = auth(c).id;
  if (viewer === userId) return;
  const day = new Date().toISOString().slice(0, 10);
  await q(
    c,
    "INSERT OR IGNORE INTO analytics_events VALUES(?,?,?,?,?,?,?,?)",
    id(),
    userId,
    viewer,
    postId,
    type,
    now(),
    day,
    `${viewer}:${type}:${postId ?? userId}:${day}`,
  ).run();
}
