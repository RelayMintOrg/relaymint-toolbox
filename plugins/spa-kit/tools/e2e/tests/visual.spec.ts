import { test, expect } from "@playwright/test";
import { SKINS, ask, chatBackend, openChat } from "./chat-helpers.ts";

/**
 * Visual regression.
 *
 * Determinism comes from four things, all of which must hold or the baseline
 * will flap: motion frozen, fonts loaded, dynamic content masked, and a fixed
 * viewport/scale (set in playwright.config.ts).
 */
test.describe("visual", () => {
  test.beforeEach(async ({ page }) => {
    // Collapses every token-driven duration to 0ms (see tokens.css).
    await page.addInitScript(() => {
      document.documentElement.dataset["motion"] = "frozen";
    });
  });

  test("home matches its baseline", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await expect(page).toHaveScreenshot("home.png", {
      fullPage: true,
      // Anything whose pixels are not a function of the markup gets masked.
      mask: [page.locator("[data-visual-volatile]")],
    });
  });
});

/**
 * One baseline per skin: the open panel with the greeting and one exchange.
 * The fake provider's reply is deterministic, so the pixels are a function of
 * the markup and the tokens, which is what a skin is.
 */
test.describe("chatbot visual", () => {
  test.skip(chatBackend() !== "builtin", "the project has no built-in chatbot");

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.documentElement.dataset["motion"] = "frozen";
    });
  });

  for (const skin of SKINS) {
    test(`${skin} matches its baseline`, async ({ page }) => {
      const chat = await openChat(page, skin);
      await ask(chat, "Hello");
      // The GPU backdrop is not reproducible, and a frosted skin blurs whatever is
      // behind it. Remove it for this capture (rather than masking, which would
      // paint over the whole panel) so the pixels depend on the skin alone.
      await page.addStyleTag({ content: "[data-visual-volatile] { display: none !important; }" });
      await page.evaluate(() => document.fonts.ready);
      // The caret blinks; the field is empty after sending, but focus stays on it.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      await expect(chat.root).toHaveScreenshot(`chat-${skin}.png`);
    });
  }
});
