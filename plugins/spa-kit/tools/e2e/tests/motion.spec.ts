import { test, expect } from "@playwright/test";
import { SKINS, openChat, chatBackend } from "./chat-helpers.ts";

/**
 * The motion contract.
 *
 * Two directions are asserted, because each catches a different regression:
 *  - with reduced motion requested, nothing may animate and no content may
 *    depend on an animation having run;
 *  - with motion allowed, something must actually animate, which is what stops
 *    an over-eager "disable everything" fix from silently killing the design.
 */
test.describe("motion contract", () => {
  test("reduced motion collapses every token duration to zero", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const durations = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return ["instant", "fast", "base", "slow", "cinematic"].map((name) => ({
        name,
        value: style.getPropertyValue(`--kit-dur-${name}`).trim(),
      }));
    });

    // Chromium serialises "0ms" as "0s", so compare the parsed value.
    const toMs = (value: string): number =>
      value.endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000;

    for (const { name, value } of durations) {
      expect(toMs(value), `--kit-dur-${name} is "${value}" under reduced motion`).toBe(0);
    }
  });

  test("content is fully visible without any animation running", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toBeVisible();

    const opacity = await heading.evaluate((el) => {
      let node: HTMLElement | null = el as HTMLElement;
      let min = 1;
      while (node) {
        min = Math.min(min, parseFloat(getComputedStyle(node).opacity));
        node = node.parentElement;
      }
      return min;
    });
    expect(opacity, "revealed content must not stay transparent under reduced motion").toBe(1);

    const running = await page.evaluate(
      () => document.getAnimations().filter((a) => a.playState === "running").length,
    );
    expect(running, "no animation may run under reduced motion").toBe(0);
  });

  test("motion is alive when the viewer allows it", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/");

    const base = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--kit-dur-base").trim(),
    );
    expect(base, "durations must not be zero when motion is allowed").not.toBe("0ms");
  });
});

/**
 * The chatbot honours the same two-way contract, in every skin: nothing moves
 * when the viewer asked for reduced motion, and something does move when they
 * did not (so "disable everything" cannot pass by accident).
 */
test.describe("chatbot motion contract", () => {
  test.skip(chatBackend() !== "builtin", "the project has no built-in chatbot");

  for (const skin of SKINS) {
    test(`${skin}: reduced motion stops every animation and transition`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const chat = await openChat(page, skin);

      const facts = await chat.root.evaluate((root) => {
        const panel = root.querySelector(".kit-chat__panel");
        const launcher = root.querySelector(".kit-chat__launcher");
        if (!panel || !launcher) return null;
        return {
          panelAnimation: getComputedStyle(panel).animationName,
          launcherTransition: getComputedStyle(launcher).transitionDuration,
          running: document.getAnimations().filter((a) => a.playState === "running").length,
        };
      });

      expect(facts, "panel and launcher must exist").not.toBeNull();
      expect(facts?.panelAnimation).toBe("none");
      expect(facts?.launcherTransition.split(",").every((d) => parseFloat(d) === 0)).toBe(true);
      expect(facts?.running, "no animation may run under reduced motion").toBe(0);
    });

    test(`${skin}: the panel animates in when motion is allowed, with a duration from the tokens`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const chat = await openChat(page, skin);

      const facts = await chat.root.evaluate((root) => {
        const panel = root.querySelector(".kit-chat__panel");
        const launcher = root.querySelector(".kit-chat__launcher");
        if (!panel || !launcher) return null;
        const tokens = getComputedStyle(document.documentElement);
        const toMs = (v: string): number => (v.endsWith("ms") ? parseFloat(v) : parseFloat(v) * 1000);
        return {
          name: getComputedStyle(panel).animationName,
          durationMs: toMs(getComputedStyle(panel).animationDuration),
          baseMs: toMs(tokens.getPropertyValue("--kit-dur-base").trim()),
          launcherMs: toMs(getComputedStyle(launcher).transitionDuration.split(",")[0] ?? "0s"),
          fastMs: toMs(tokens.getPropertyValue("--kit-dur-fast").trim()),
        };
      });

      expect(facts?.name).toBe("kit-chat-in");
      expect(facts?.durationMs).toBeGreaterThan(0);
      expect(facts?.durationMs, "the panel's duration is the base token, not a literal").toBe(facts?.baseMs);
      expect(facts?.launcherMs, "the launcher's transition is the fast token").toBe(facts?.fastMs);
    });

    test(`${skin}: nothing the visitor needs is hidden behind the animation`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      const chat = await openChat(page, skin);
      await expect(chat.log.locator("[data-chat-disclosure]")).toBeVisible();
      const opacity = await chat.dialog.evaluate((el) => parseFloat(getComputedStyle(el).opacity));
      expect(opacity).toBe(1);
    });
  }
});
