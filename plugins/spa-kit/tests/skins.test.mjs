/**
 * The chat skins are product design, but their rules are mechanical, so they
 * are tested mechanically: every skin exists, every skin is made of design
 * tokens only, and the e2e suite covers every skin the kit offers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { SKINS, BACKENDS } from "../bin/lib/chatbot.mjs";

const root = new URL("../", import.meta.url);
const chatDir = new URL("templates/spa/components/chat/", root);
const skinsDir = new URL("skins/", chatDir);
const read = (url) => readFileSync(url, "utf8");

const skinFiles = readdirSync(skinsDir).filter((f) => f.endsWith(".css"));
const cssFiles = [new URL("chat.css", chatDir), ...skinFiles.map((f) => new URL(f, skinsDir))];

test("the registry and the skin stylesheets agree exactly", () => {
  assert.deepEqual(skinFiles.map((f) => f.replace(/\.css$/, "")).sort(), Object.keys(SKINS).sort());
  const chatCss = read(new URL("chat.css", chatDir));
  for (const name of Object.keys(SKINS)) {
    assert.ok(chatCss.includes(`@import "./skins/${name}.css"`), `chat.css must import the ${name} skin`);
  }
});

test("each skin scopes itself to its own attribute value and never restyles another", () => {
  for (const name of Object.keys(SKINS)) {
    const css = read(new URL(`${name}.css`, skinsDir));
    assert.ok(css.includes(`[data-chat-skin="${name}"]`), `${name}.css must be scoped`);
    for (const other of Object.keys(SKINS).filter((n) => n !== name)) {
      assert.ok(!css.includes(`data-chat-skin="${other}"`), `${name}.css mentions ${other}`);
    }
  }
});

test("the TypeScript skin union is the registry", () => {
  const types = read(new URL("types.ts", chatDir));
  const union = types.match(/export type ChatSkin = ([^;]+);/)[1];
  const names = [...union.matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(names.sort(), Object.keys(SKINS).sort());
  const backends = types.match(/export type ChatBackend = ([^;]+);/)[1];
  assert.deepEqual([...backends.matchAll(/"([a-z]+)"/g)].map((m) => m[1]).sort(), Object.keys(BACKENDS).sort());
});

test("the e2e suite covers every skin the kit offers", () => {
  const helpers = read(new URL("tools/e2e/tests/chat-helpers.ts", root));
  const listed = [...helpers.match(/export const SKINS = \[([^\]]+)\]/)[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(listed.sort(), Object.keys(SKINS).sort());
  for (const spec of ["a11y", "motion", "visual"]) {
    const text = read(new URL(`tools/e2e/tests/${spec}.spec.ts`, root));
    assert.match(text, /for \(const skin of SKINS\)/, `${spec}.spec.ts must iterate over every skin`);
  }
});

// ---------------------------------------------------------------- tokens only

/** Strips comments, so the rules below judge code and not prose. */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|light-dark)\(/i;
const HEX_COLOUR = /#[0-9a-f]{3,8}\b/i;
const NAMED_COLOUR = /(?<![\w-])(?:white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|navy|teal|aqua|lime|maroon|olive|fuchsia|cyan|magenta|brown|gold|tomato|coral)(?![\w-])/i;
const LITERAL_TIME = /(?<![\w.-])\d*\.?\d+(?:ms|s)\b/;
const LITERAL_EASING = /\b(?:cubic-bezier|steps|linear)\(|(?<![\w-])(?:ease|ease-in|ease-out|ease-in-out|step-start|step-end)(?![\w-])/i;

test("no stylesheet contains a literal colour, duration or easing", () => {
  for (const url of cssFiles) {
    const css = stripComments(read(url));
    const name = url.pathname.split("/").slice(-2).join("/");
    assert.doesNotMatch(css, COLOUR_FUNCTION, `${name}: colour function`);
    assert.doesNotMatch(css, HEX_COLOUR, `${name}: hex colour`);
    assert.doesNotMatch(css.replace(/\bcolor-mix\(in oklch,/g, "").replace(/url\([^)]*\)/g, ""), NAMED_COLOUR, `${name}: named colour`);
    assert.doesNotMatch(css, LITERAL_TIME, `${name}: literal duration`);
    assert.doesNotMatch(css, LITERAL_EASING, `${name}: literal easing`);
  }
});

test("every time and easing a stylesheet uses is a token", () => {
  for (const url of cssFiles) {
    const css = stripComments(read(url));
    const name = url.pathname.split("/").slice(-2).join("/");
    for (const [, value] of css.matchAll(/\b(?:animation(?:-duration|-delay)?|transition(?:-duration|-delay)?)\s*:\s*([^;]+);/g)) {
      if (/^(?:none|inherit|initial|unset)$/.test(value.trim())) continue;
      assert.match(value, /var\(--kit-(?:dur|ease)-/, `${name}: "${value.trim()}" uses no motion token`);
    }
  }
});

test("every colour is a design token reference or a mix of them", () => {
  const properties = /(?:^|[;{\s])(?:color|background(?:-color)?|border(?:-[a-z]+)*-color|border(?!-radius)(?:-[a-z]+)?|outline(?:-color)?|caret-color|fill|stroke)\s*:\s*([^;]+);/g;
  for (const url of cssFiles) {
    const css = stripComments(read(url));
    const name = url.pathname.split("/").slice(-2).join("/");
    for (const [, value] of css.matchAll(properties)) {
      const v = value.trim();
      // Keywords and geometry are fine; a colour must come from a variable.
      const stripped = v
        .replace(/var\([^)]*\)/g, "")
        .replace(/color-mix\(in oklch,\s*,?\s*\d*%?\s*,?\s*\d*%?\s*,?\s*transparent\)/g, "")
        .replace(/color-mix\([^)]*\)/g, "")
        .replace(/(?<![\w-])(?:!important|solid|none|transparent|currentColor|inherit|\d*\.?\d+(?:px|rem|em|ch|%)?)(?![\w-])/g, "")
        .replace(/[\s,()]/g, "");
      assert.equal(stripped, "", `${name}: "${v}" has something that is not a token`);
    }
  }
});

test("the components contain no literal motion values either", () => {
  for (const f of readdirSync(chatDir).filter((n) => n.endsWith(".tsx"))) {
    const code = read(new URL(f, chatDir));
    assert.doesNotMatch(code, /transition(?:Duration)?\s*:/, `${f}: inline transition`);
    assert.doesNotMatch(code, /animation(?:Duration)?\s*:/, `${f}: inline animation`);
    assert.doesNotMatch(code, /#[0-9a-f]{6}\b/i, `${f}: literal colour`);
    assert.doesNotMatch(code, /cubic-bezier/, `${f}: literal easing`);
  }
});

test("the lint would catch what it claims to (self-check of the patterns)", () => {
  assert.match("color: #fff;", HEX_COLOUR);
  assert.match("background: rgb(0 0 0);", COLOUR_FUNCTION);
  assert.match("background: oklch(10% 0 0);", COLOUR_FUNCTION);
  assert.match("transition: opacity 200ms;", LITERAL_TIME);
  assert.match("animation-duration: .4s;", LITERAL_TIME);
  assert.match("transition: all var(--x) ease-in-out;", LITERAL_EASING);
  assert.match("animation-timing-function: step-end;", LITERAL_EASING);
  assert.match("color: white;", NAMED_COLOUR);
  assert.doesNotMatch("transition: color var(--kit-dur-fast) var(--kit-ease-glide);", LITERAL_TIME);
  assert.doesNotMatch("background: color-mix(in oklch, var(--kit-abyss) 90%, transparent);", COLOUR_FUNCTION);
});

test("a skin never sets a colour on text inside a surface it does not define", () => {
  // Text may only use the contrast-checked text tokens, never an accent.
  for (const url of cssFiles) {
    const css = stripComments(read(url));
    const name = url.pathname.split("/").slice(-2).join("/");
    for (const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const color = body.match(/(?:^|[;\s])color\s*:\s*([^;]+);/)?.[1]?.trim();
      if (!color || !/__bubble|__title|__input|__send|__who|__note|__status|__log/.test(selector)) continue;
      // Prompt markers are decorative glyphs with empty alternative text, not text.
      if (/::(?:before|after)/.test(selector)) continue;
      assert.match(
        color,
        /var\(--(?:chat-fg(?:-secondary|-muted)?|kit-text-(?:primary|secondary|muted)|kit-critical)\)/,
        `${name}: "${selector.trim()}" sets text colour to ${color}`,
      );
    }
  }
});
