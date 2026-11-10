import { expect, test } from "@playwright/test";
test("desktop account, post, draft, profile and theme flow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const suffix = Date.now().toString().slice(-8);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Лента", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Присоединиться", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
  await page.getByLabel("Имя", { exact: true }).fill("Проверка M²");
  await page
    .getByLabel("Имя пользователя", { exact: true })
    .fill(`qa_${suffix}`);
  await page
    .getByLabel("Email", { exact: true })
    .fill(`qa_${suffix}@example.test`);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("browser-password-long");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Зарегистрироваться", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page
    .getByRole("textbox", { name: "Что нового?" })
    .fill(`Настоящий пост ${suffix} #проверка`);
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(
    page.getByText(`Настоящий пост ${suffix}`, { exact: false }).first(),
  ).toBeVisible();
  await page
    .getByRole("article")
    .filter({ hasText: `Настоящий пост ${suffix}` })
    .getByRole("button", { name: "Нравится", exact: true })
    .click();
  await expect(
    page
      .getByRole("article")
      .filter({ hasText: `Настоящий пост ${suffix}` })
      .getByRole("button", { name: "Нравится", exact: true }),
  ).toHaveClass(/selected/);
  await page.getByRole("button", { name: "Создать пост", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Что нового?" })
    .fill(`Черновик ${suffix}`);
  await page
    .getByRole("button", { name: "Сохранить черновик", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/drafts");
  await expect(
    page.getByText(`Черновик ${suffix}`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("textbox", { name: "Что нового?" }),
  ).toHaveValue(`Черновик ${suffix}`);
  await page.keyboard.press("Escape");
  await page.goto(`/@qa_${suffix}`);
  await page
    .getByRole("button", { name: "Редактировать профиль", exact: true })
    .click();
  await page
    .getByLabel("Биография", { exact: true })
    .fill("Русский текст и настоящие мысли.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();
  await expect(page.locator(".profile-bio")).toHaveText(
    "Русский текст и настоящие мысли.",
  );
  await page.goto("/settings");
  await page.getByRole("button", { name: "Светлая", exact: true }).click();
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Нет доступа", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
  const me = await page.request.get("/api/auth/me");
  const auth = (await me.json()) as { csrf: string };
  const removed = await page.request.delete("/api/auth/account", {
    headers: { "X-CSRF-Token": auth.csrf },
    data: { password: "browser-password-long" },
  });
  expect(removed.status()).toBe(200);
});
test("mobile layout, guest auth and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Создать пост" })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("PWA caches only public fallback assets and handles offline navigation", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const entries = await Promise.all(
      names.map(async (name) =>
        (await (await caches.open(name)).keys()).map(
          (request) => new URL(request.url).pathname,
        ),
      ),
    );
    return entries.flat();
  });
  expect(cached.sort()).toEqual(["/icon.svg", "/offline.html"]);
  await context.setOffline(true);
  await page.goto("/about");
  await expect(
    page.getByRole("heading", { name: "Ваше пространство подождёт." }),
  ).toBeVisible();
  await context.setOffline(false);
});
