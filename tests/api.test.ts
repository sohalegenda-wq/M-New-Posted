import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { readFile, mkdir } from "node:fs/promises";
let mf: Miniflare;
let db: D1Database;
type Client = { cookie: string; csrf: string; id: string; username: string };
let alice: Client, bob: Client, moderator: Client;
let postId: string;
let conversation: string;
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  client?: Client,
  extra: Record<string, string> = {},
) {
  return mf.dispatchFetch(`http://localhost/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: "http://localhost",
      ...(client ? { Cookie: client.cookie, "X-CSRF-Token": client.csrf } : {}),
      ...extra,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body ?? {}) }),
  });
}
async function account(username: string) {
  const response = await request("/auth/register", "POST", {
    email: `${username}@example.test`,
    username,
    display_name: username,
    password: "test-password-long-enough",
  });
  expect(response.status).toBe(201);
  const data = (await response.json()) as {
    csrf: string;
    user: { id: string };
  };
  return {
    id: data.user.id,
    username,
    csrf: data.csrf,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
}
beforeAll(async () => {
  await mkdir("work", { recursive: true });
  await build({
    entryPoints: ["server/index.ts"],
    bundle: true,
    format: "esm",
    outfile: "work/test-worker.js",
    platform: "browser",
    target: "es2022",
  });
  mf = new Miniflare({
    modules: true,
    scriptPath: "work/test-worker.js",
    compatibilityDate: "2026-08-01",
    d1Databases: ["DB"],
  });
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  await db.exec(await readFile("migrations/0001_core.sql", "utf8"));
  alice = await account("alice");
  bob = await account("bob");
  moderator = await account("mod");
}, 60000);
afterAll(async () => {
  await mf?.dispose();
});
describe.sequential("real Worker + D1 API", () => {
  it("applies migrations with unique keys, indexes and foreign keys", async () => {
    const tables = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    expect(tables.results.length).toBeGreaterThan(25);
    const fk = await db.prepare("PRAGMA foreign_key_list(posts)").all();
    expect(fk.results.length).toBeGreaterThan(0);
  });
  it("does not assign owner on registration, even for a username", async () => {
    const me = await request("/auth/me", "GET", undefined, alice);
    const data = (await me.json()) as { user: { role: string; tier: string } };
    expect(data.user.role).toBe("user");
    expect(data.user.tier).toBe("free");
    expect(
      (await request("/admin/stats", "GET", undefined, alice)).status,
    ).toBe(403);
  });
  it("enforces case-insensitive usernames and rejects privilege injection", async () => {
    expect(
      (
        await request("/auth/register", "POST", {
          email: "other@example.test",
          username: "ALICE",
          display_name: "x",
          password: "test-password-long-enough",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          "/profile",
          "PATCH",
          { tier: "elite", role: "owner" },
          alice,
        )
      ).status,
    ).toBe(400);
  });
  it("logs in with a secure, HTTP-only session and refuses bad credentials", async () => {
    const res = await mf.dispatchFetch("https://localhost/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://localhost",
      },
      body: JSON.stringify({
        email: "alice@example.test",
        password: "test-password-long-enough",
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("HttpOnly");
    expect(res.headers.get("set-cookie")).toContain("Secure");
    expect(res.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(
      (
        await request("/auth/login", "POST", {
          email: "alice@example.test",
          password: "wrong",
        })
      ).status,
    ).toBe(401);
  });
  it("rejects unauthenticated writes, cross-site requests and missing CSRF", async () => {
    expect((await request("/posts", "POST", { content: "hi" })).status).toBe(
      401,
    );
    expect(
      (
        await request("/posts", "POST", { content: "hi" }, alice, {
          "X-CSRF-Token": "",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/posts", "POST", { content: "hi" }, alice, {
          Origin: "https://evil.test",
        })
      ).status,
    ).toBe(403);
  });
  it("creates posts, extracts hashtags and rejects another user’s edits", async () => {
    const res = await request(
      "/posts",
      "POST",
      { content: "Hello #m2 @bob" },
      alice,
    );
    expect(res.status).toBe(201);
    const p = (await res.json()) as { id: string };
    postId = p.id;
    expect(
      (await request(`/posts/${p.id}`, "PATCH", { content: "stolen" }, bob))
        .status,
    ).toBe(403);
    expect((await request(`/posts/${p.id}`, "DELETE", {}, bob)).status).toBe(
      403,
    );
    const tags = await request("/topics");
    expect(await tags.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ tag: "m2" })]),
    );
  });
  it("keeps likes and follows idempotent and emits notifications", async () => {
    for (let i = 0; i < 2; i++)
      expect(
        (await request(`/posts/${postId}/like`, "PUT", {}, bob)).status,
      ).toBe(200);
    const post = await request(`/posts/${postId}`);
    expect(((await post.json()) as { likes: number }).likes).toBe(1);
    for (let i = 0; i < 2; i++)
      expect(
        (await request(`/users/${alice.id}/follow`, "PUT", {}, bob)).status,
      ).toBe(200);
    expect(
      (
        await db
          .prepare("SELECT count(*) n FROM follows WHERE follower_id=?")
          .bind(bob.id)
          .first<{ n: number }>()
      )?.n,
    ).toBe(1);
    const n = await request("/notifications", "GET", undefined, alice);
    expect(((await n.json()) as unknown[]).length).toBeGreaterThan(0);
  });
  it("checks reply permissions on the server", async () => {
    const r = await request(
      "/posts",
      "POST",
      { content: "No replies", reply_permission: "nobody" },
      alice,
    );
    const p = (await r.json()) as { id: string };
    expect(
      (
        await request(
          "/posts",
          "POST",
          { content: "bypass", parent_id: p.id },
          bob,
        )
      ).status,
    ).toBe(403);
  });
  it("stores drafts and bookmarks on the server", async () => {
    expect(
      (await request("/drafts", "POST", { content: "private draft" }, alice))
        .status,
    ).toBe(200);
    const d = await request("/drafts", "GET", undefined, bob);
    expect(await d.json()).toEqual([]);
    await request(`/posts/${postId}/bookmark`, "PUT", {}, bob);
    const feed = await request("/feed?mode=bookmarks", "GET", undefined, bob);
    expect(
      ((await feed.json()) as { items: { id: string }[] }).items.some(
        (p) => p.id === postId,
      ),
    ).toBe(true);
  });
  it("rejects self-awarded premium and administrator-only requests", async () => {
    expect(
      (
        await request(
          `/admin/premium/${bob.id}`,
          "POST",
          { tier: "elite", days: null },
          bob,
        )
      ).status,
    ).toBe(403);
    await db
      .prepare("UPDATE user_roles SET role='moderator' WHERE user_id=?")
      .bind(moderator.id)
      .run();
    expect(
      (
        await request(
          `/admin/premium/${bob.id}`,
          "POST",
          { tier: "elite", days: null },
          moderator,
        )
      ).status,
    ).toBe(403);
    expect((await request("/analytics", "GET", undefined, bob)).status).toBe(
      403,
    );
  });
  it("grants, expires and revokes Premium with atomic audit records", async () => {
    await db
      .prepare("UPDATE user_roles SET role='owner' WHERE user_id=?")
      .bind(alice.id)
      .run();
    expect(
      (
        await request(
          `/admin/premium/${bob.id}`,
          "POST",
          { tier: "premium_plus", days: 30 },
          alice,
        )
      ).status,
    ).toBe(200);
    let r = await request("/auth/me", "GET", undefined, bob);
    expect(((await r.json()) as { user: { tier: string } }).user.tier).toBe(
      "premium_plus",
    );
    expect((await request("/analytics", "GET", undefined, bob)).status).toBe(
      200,
    );
    await db
      .prepare("UPDATE premium_grants SET expires_at=1 WHERE user_id=?")
      .bind(bob.id)
      .run();
    r = await request("/auth/me", "GET", undefined, bob);
    expect(((await r.json()) as { user: { tier: string } }).user.tier).toBe(
      "free",
    );
    await request(
      `/admin/premium/${bob.id}`,
      "POST",
      { tier: "elite", days: null },
      alice,
    );
    expect(
      (
        await request(
          `/admin/premium/${bob.id}`,
          "POST",
          { tier: "free", days: null },
          alice,
        )
      ).status,
    ).toBe(200);
    r = await request("/auth/me", "GET", undefined, bob);
    expect(((await r.json()) as { user: { tier: string } }).user.tier).toBe(
      "free",
    );
    expect(
      (
        await db
          .prepare(
            "SELECT count(*) n FROM admin_audit_logs WHERE action='premium'",
          )
          .first<{ n: number }>()
      )?.n,
    ).toBe(3);
  });
  it("restricts role assignment to Owner", async () => {
    expect(
      (
        await request(
          `/admin/users/${bob.id}/role`,
          "POST",
          { role: "owner" },
          moderator,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/admin/users/${moderator.id}/ban`,
          "POST",
          { days: 1, reason: "test restriction" },
          moderator,
        )
      ).status,
    ).toBe(403);
  });
  it("protects conversations and rejects non-members", async () => {
    const res = await request(
      "/conversations",
      "POST",
      { user_id: bob.id },
      alice,
    );
    expect(res.status).toBe(200);
    conversation = ((await res.json()) as { id: string }).id;
    expect(
      (
        await request(
          `/conversations/${conversation}/messages`,
          "POST",
          { content: "private hello" },
          alice,
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await request(
          `/conversations/${conversation}/messages`,
          "GET",
          undefined,
          moderator,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/conversations/${conversation}/messages`,
          "GET",
          undefined,
          bob,
        )
      ).status,
    ).toBe(200);
  });
  it("blocks feed access, follows and messages in both directions", async () => {
    expect(
      (await request(`/users/${alice.id}/block`, "PUT", {}, bob)).status,
    ).toBe(200);
    expect(
      (await request(`/posts/${postId}`, "GET", undefined, bob)).status,
    ).toBe(404);
    expect(
      (await request(`/users/${bob.id}/follow`, "PUT", {}, alice)).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/conversations/${conversation}/messages`,
          "POST",
          { content: "bypass block" },
          alice,
        )
      ).status,
    ).toBe(403);
    await request(`/users/${alice.id}/block`, "DELETE", {}, bob);
  });
  it("protects private posts and prevents public access to drafts", async () => {
    await db
      .prepare("UPDATE profiles SET private=1 WHERE user_id=?")
      .bind(bob.id)
      .run();
    const r = await request("/posts", "POST", { content: "secret" }, bob);
    const p = (await r.json()) as { id: string };
    expect((await request(`/posts/${p.id}`)).status).toBe(404);
    expect(
      (await request(`/posts/${p.id}`, "GET", undefined, alice)).status,
    ).toBe(404);
    expect(
      (await request(`/posts/${p.id}`, "GET", undefined, bob)).status,
    ).toBe(200);
    expect((await request("/drafts")).status).toBe(401);
    await db
      .prepare("UPDATE profiles SET private=0 WHERE user_id=?")
      .bind(bob.id)
      .run();
  });
  it("enforces cursor pagination and rejects arbitrary SQL cursors", async () => {
    for (let i = 0; i < 22; i++)
      await db
        .prepare(
          "INSERT INTO posts(id,user_id,content,created_at) VALUES(?,?,?,?)",
        )
        .bind(crypto.randomUUID(), alice.id, `page ${i}`, Date.now() + i)
        .run();
    const r = await request("/feed?mode=latest");
    const page = (await r.json()) as { items: { id: string }[]; next: string };
    expect(page.items).toHaveLength(20);
    expect(page.next).toBeTruthy();
    const r2 = await request(
      `/feed?mode=latest&cursor=${encodeURIComponent(page.next)}`,
    );
    const second = (await r2.json()) as { items: { id: string }[] };
    expect(
      second.items.some((p) => page.items.some((p1) => p1.id === p.id)),
    ).toBe(false);
    expect((await request("/feed?cursor=DROP-TABLE")).status).toBe(400);
  });
  it("validates uploads and checks media ownership and visibility", async () => {
    const data = Uint8Array.from(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const upload = new FormData();
    upload.set("file", new File([data], "one.png", { type: "image/png" }));
    const encoded = new Request("http://localhost/api/uploads", {
      method: "POST",
      body: upload,
    });
    const response = await mf.dispatchFetch(encoded.url, {
      method: "POST",
      headers: {
        Cookie: alice.cookie,
        "X-CSRF-Token": alice.csrf,
        Origin: "http://localhost",
        "Content-Type": encoded.headers.get("content-type")!,
      },
      body: new Uint8Array(await encoded.arrayBuffer()),
    });
    expect(response.status).toBe(201);
    const image = (await response.json()) as { id: string };
    expect(
      (await mf.dispatchFetch(`http://localhost/media/${image.id}`)).status,
    ).toBe(404);
    expect(
      (
        await mf.dispatchFetch(`http://localhost/media/${image.id}`, {
          headers: { Cookie: alice.cookie },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/posts",
          "POST",
          { content: "stolen image", media: [image.id] },
          bob,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/posts",
          "POST",
          { content: "own photo", media: [image.id] },
          alice,
        )
      ).status,
    ).toBe(201);
    const publicFile = await mf.dispatchFetch(
      `http://localhost/media/${image.id}`,
    );
    expect(publicFile.status).toBe(200);
    expect(publicFile.headers.get("Cache-Control")).toContain("no-store");
    await db
      .prepare("UPDATE profiles SET private=1 WHERE user_id=?")
      .bind(alice.id)
      .run();
    expect(
      (await mf.dispatchFetch(`http://localhost/media/${image.id}`)).status,
    ).toBe(404);
    await db
      .prepare("UPDATE profiles SET private=0 WHERE user_id=?")
      .bind(alice.id)
      .run();
    const malicious = new FormData();
    malicious.set(
      "file",
      new File(['<svg onload="alert(1)"/>'], "attack.svg", {
        type: "image/svg+xml",
      }),
    );
    const bad = new Request("http://localhost/api/uploads", {
      method: "POST",
      body: malicious,
    });
    expect(
      (
        await mf.dispatchFetch(bad.url, {
          method: "POST",
          headers: {
            Cookie: alice.cookie,
            "X-CSRF-Token": alice.csrf,
            "Content-Type": bad.headers.get("content-type")!,
          },
          body: new Uint8Array(await bad.arrayBuffer()),
        })
      ).status,
    ).toBe(400);
  });
  it("enforces bans while retaining a safe appeal path", async () => {
    expect(
      (
        await request(
          `/admin/users/${bob.id}/ban`,
          "POST",
          { days: 1, reason: "test moderation reason" },
          alice,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/posts", "POST", { content: "bypass" }, bob)).status,
    ).toBe(403);
    expect(
      (
        await request(
          "/appeals",
          "POST",
          { reason: "Please review this moderation decision" },
          bob,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/admin/users/${bob.id}/ban`,
          "POST",
          { days: 0, reason: "review complete" },
          alice,
        )
      ).status,
    ).toBe(200);
  });
  it("rate limits repeated failed logins", async () => {
    for (let i = 0; i < 15; i++)
      expect(
        (
          await request(
            "/auth/login",
            "POST",
            { email: "nobody@example.test", password: "wrong" },
            undefined,
            { "cf-connecting-ip": "198.51.100.77" },
          )
        ).status,
      ).toBe(401);
    expect(
      (
        await request(
          "/auth/login",
          "POST",
          { email: "nobody@example.test", password: "wrong" },
          undefined,
          { "cf-connecting-ip": "198.51.100.77" },
        )
      ).status,
    ).toBe(429);
  });
  it("deletes own posts and cascades reactions", async () => {
    expect(
      (await request(`/posts/${postId}`, "DELETE", {}, alice)).status,
    ).toBe(200);
    expect((await request(`/posts/${postId}`)).status).toBe(404);
    expect(
      (
        await db
          .prepare("SELECT count(*) n FROM likes WHERE post_id=?")
          .bind(postId)
          .first<{ n: number }>()
      )?.n,
    ).toBe(0);
  });
  it("never claims email recovery works without configured mail", async () => {
    expect(
      (await request("/auth/recover", "POST", { email: "alice@example.test" }))
        .status,
    ).toBe(503);
  });
  it("revokes sessions on password change and logs out", async () => {
    const login = await request("/auth/login", "POST", {
      email: "bob@example.test",
      password: "test-password-long-enough",
    });
    const data = (await login.json()) as { csrf: string };
    const other = {
      ...bob,
      cookie: login.headers.get("set-cookie")!.split(";")[0],
      csrf: data.csrf,
    };
    expect(
      (
        await request(
          "/auth/password",
          "POST",
          {
            current: "test-password-long-enough",
            password: "new-password-very-long",
          },
          bob,
        )
      ).status,
    ).toBe(200);
    const me = await request("/auth/me", "GET", undefined, other);
    expect(((await me.json()) as { user: null }).user).toBeNull();
    await request("/auth/logout", "POST", {}, bob);
    const loggedOut = await request("/auth/me", "GET", undefined, bob);
    expect(((await loggedOut.json()) as { user: null }).user).toBeNull();
  });
});
