import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The skins every chatbot ships with. A skin is CSS only, selected by the
 * `data-chat-skin` attribute, so one build can be exercised in all of them by
 * switching the attribute: the markup, scripts and behaviour are identical.
 * `tests/skins.test.mjs` fails if this list and the kit's skin registry differ.
 */
export const SKINS = ["minimal", "glass", "bubble", "terminal"] as const;
export type Skin = (typeof SKINS)[number];

/**
 * Which chatbot the project under test has. Read from its brief, which is the
 * source of truth, so a project without a chatbot skips these tests rather than
 * waiting for a launcher that will never come. Unknown means skipped.
 */
export function chatBackend(): "builtin" | "relaymint" | null {
  const dir = process.env["KIT_PROJECT_DIR"];
  if (!dir) return null;
  try {
    const brief = JSON.parse(readFileSync(join(dir, "brief.json"), "utf8")) as {
      chatbot?: { backend?: string };
    };
    const backend = brief.chatbot?.backend;
    return backend === "builtin" || backend === "relaymint" ? backend : null;
  } catch {
    return null;
  }
}

export interface Chat {
  root: Locator;
  launcher: Locator;
  dialog: Locator;
  input: Locator;
  log: Locator;
}

/** Loads the home page and waits for the deferred launcher, in the given skin. */
export async function loadChat(page: Page, skin: Skin): Promise<Chat> {
  await page.goto("/");
  const root = page.locator("[data-chat-root]");
  // The launcher mounts after load and an idle moment, never before.
  await expect(root).toBeAttached({ timeout: 10_000 });
  await root.evaluate((el, value) => el.setAttribute("data-chat-skin", value), skin);
  return {
    root,
    launcher: root.locator(".kit-chat__launcher"),
    dialog: root.getByRole("dialog"),
    input: root.locator(".kit-chat__input"),
    log: root.getByRole("log"),
  };
}

export async function openChat(page: Page, skin: Skin): Promise<Chat> {
  const chat = await loadChat(page, skin);
  await chat.launcher.click();
  await expect(chat.dialog).toBeVisible();
  return chat;
}

/** Sends one message and waits for the assistant to answer it. */
export async function ask(chat: Chat, text: string): Promise<void> {
  const before = await chat.root.locator('[data-role="assistant"]').count();
  await chat.input.fill(text);
  await chat.input.press("Enter");
  await expect(chat.root.locator('[data-role="assistant"]')).toHaveCount(before + 1);
  await expect(chat.root.locator("[data-error]")).toHaveCount(0);
}
