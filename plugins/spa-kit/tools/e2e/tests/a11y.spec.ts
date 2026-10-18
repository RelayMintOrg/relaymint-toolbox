import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { SKINS, ask, chatBackend, loadChat, openChat } from "./chat-helpers.ts";

test.describe("accessibility", () => {
  test("home has no critical or serious WCAG violations", async ({ page }) => {
    await page.goto("/");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    expect(
      blocking,
      blocking
        .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
        .join("\n"),
    ).toEqual([]);
  });

  test("keyboard focus is always visible", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");

    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      return { width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
    });

    expect(outline, "nothing received focus on first Tab").not.toBeNull();
    expect(outline?.style).not.toBe("none");
    expect(parseFloat(outline?.width ?? "0")).toBeGreaterThan(0);
  });
});

/**
 * The chatbot, in every skin. The built-in widget is one component whose skin is
 * only CSS, so these assert that every skin keeps the same accessible behaviour
 * and passes the same contrast checks, not merely that the default one does.
 */
test.describe("chatbot accessibility", () => {
  test.skip(chatBackend() !== "builtin", "the project has no built-in chatbot");

  for (const skin of SKINS) {
    test.describe(skin, () => {
      test("no critical or serious WCAG violations with the panel open and a reply shown", async ({ page }) => {
        const chat = await openChat(page, skin);
        await ask(chat, "Hello");

        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        const blocking = results.violations.filter(
          (v) => v.impact === "critical" || v.impact === "serious",
        );
        expect(
          blocking,
          blocking
            .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
            .join("\n"),
        ).toEqual([]);
      });

      test("the launcher is operable by keyboard and focus follows the panel", async ({ page }) => {
        const chat = await loadChat(page, skin);

        await chat.launcher.focus();
        await expect(chat.launcher).toHaveAttribute("aria-expanded", "false");
        await page.keyboard.press("Enter");
        await expect(chat.dialog).toBeVisible();
        await expect(chat.launcher).toHaveAttribute("aria-expanded", "true");
        await expect(chat.input, "opening moves focus into the panel").toBeFocused();

        await page.keyboard.press("Escape");
        await expect(chat.dialog).toBeHidden();
        await expect(chat.launcher, "closing returns focus to the launcher").toBeFocused();

        await page.keyboard.press("Space");
        await expect(chat.dialog).toBeVisible();
        await chat.root.locator(".kit-chat__close").click();
        await expect(chat.dialog).toBeHidden();
        await expect(chat.launcher).toBeFocused();
      });

      test("the dialog is named, and the conversation is a polite live region", async ({ page }) => {
        const chat = await openChat(page, skin);

        await expect(chat.dialog).toHaveAccessibleName(/.+/);
        await expect(chat.log).toHaveAttribute("aria-live", "polite");
        await expect(chat.log).toHaveAccessibleName(/.+/);
        await expect(chat.root.getByRole("status")).toBeAttached();
        await expect(chat.input).toHaveAccessibleName(/.+/);

        const before = await chat.root.locator('[data-role="assistant"]').count();
        await ask(chat, "Hello");
        // The reply lands inside the live region, which is what makes it announced.
        const inside = await chat.log.locator('[data-role="assistant"]').count();
        expect(inside).toBe(before + 1);
      });

      test("the first message discloses that the visitor is talking to an AI", async ({ page }) => {
        const chat = await openChat(page, skin);
        const first = chat.log.locator("[data-role]").first();
        await expect(first).toHaveAttribute("data-chat-disclosure", "");
        await expect(first).toHaveAttribute("data-role", "assistant");
        await expect(first).toContainText(/\b(AI|IA|KI)\b/);
      });

      test("every control has a visible focus indicator and a target of at least 24px", async ({ page }) => {
        const chat = await openChat(page, skin);
        await chat.input.fill("x");

        // Real keyboard travel, because :focus-visible is not set by scripted focus.
        // Order in the DOM: close, log, input, send, then the launcher.
        const seen = new Map<string, { outlineStyle: string; outlineWidth: number; width: number; height: number }>();
        const record = async (): Promise<void> => {
          const facts = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el || !el.closest("[data-chat-root]")) return null;
            const style = getComputedStyle(el);
            const box = el.getBoundingClientRect();
            return {
              name: [...el.classList].find((c) => c.startsWith("kit-chat__")) ?? el.tagName,
              outlineStyle: style.outlineStyle,
              outlineWidth: parseFloat(style.outlineWidth),
              width: box.width,
              height: box.height,
            };
          });
          if (facts) seen.set(facts.name, facts);
        };

        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Shift+Tab");
        await record(); // close
        for (let i = 0; i < 4; i++) {
          await page.keyboard.press("Tab");
          await record();
        }

        expect([...seen.keys()].sort()).toEqual(
          ["kit-chat__close", "kit-chat__input", "kit-chat__launcher", "kit-chat__log", "kit-chat__send"].sort(),
        );
        for (const [name, facts] of seen) {
          expect(facts.outlineStyle, `${name} outline`).not.toBe("none");
          expect(facts.outlineWidth, `${name} outline width`).toBeGreaterThan(0);
          if (name !== "kit-chat__log") {
            expect(facts.width, `${name} width`).toBeGreaterThanOrEqual(24);
            expect(facts.height, `${name} height`).toBeGreaterThanOrEqual(24);
          }
        }
      });
    });
  }
});
