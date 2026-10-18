import { test, expect } from "@playwright/test";
import { chatBackend } from "./chat-helpers.ts";

test.describe("smoke", () => {
  test("home renders its heading and emits no console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(err.message));

    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).toHaveTitle(/.+/);

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("structured data is present in the served document", async ({ page }) => {
    await page.goto("/");
    const blocks = page.locator('script[type="application/ld+json"]');
    await expect(blocks.first()).toBeAttached();

    const payloads = await blocks.allTextContents();
    for (const payload of payloads) {
      expect(() => JSON.parse(payload) as unknown).not.toThrow();
    }
  });

  test("the chatbot is absent from the server HTML and arrives after load", async ({ page, request }) => {
    test.skip(chatBackend() === null, "the project has no chatbot");

    // What a crawler receives: no launcher, no chat markup, no chat text.
    const html = await (await request.get("/")).text();
    expect(html).not.toContain("data-chat-root");
    expect(html).not.toContain("kit-chat");

    // What a browser gets once the page has loaded and gone idle.
    await page.goto("/");
    if (chatBackend() === "builtin") {
      await expect(page.locator("[data-chat-root] .kit-chat__launcher")).toBeVisible({ timeout: 10_000 });
    }
  });
});
