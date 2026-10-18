import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normaliseBrief, BRIEF_EXAMPLE } from "../bin/lib/brief.mjs";
import {
  BACKENDS,
  SKINS,
  DEFAULT_SKIN,
  CHAT_STRING_KEYS,
  normaliseChatbot,
  resolveChatStrings,
  renderChatConfigModule,
  chatContractInvariants,
  withChatInvariants,
} from "../bin/lib/chatbot.mjs";

const minimal = (extra = {}) => ({
  business: { name: "Acme", description: "Acme does a thing.", url: "https://acme.test" },
  brand: { color: "#0A5FFF" },
  hero: { headline: "One clear sentence." },
  ...extra,
});

// ------------------------------------------------------------------- schema

test("a brief without chatbot has no chatbot, and the key stays absent", () => {
  const brief = normaliseBrief(minimal());
  assert.equal("chatbot" in brief, false);
  assert.equal(normaliseChatbot(undefined), null);
  assert.equal(normaliseChatbot(null), null);
});

test("every backend and every skin is accepted", () => {
  for (const backend of Object.keys(BACKENDS)) {
    for (const skin of Object.keys(SKINS)) {
      const brief = normaliseBrief(minimal({ chatbot: { backend, skin } }));
      assert.deepEqual(brief.chatbot, { backend, skin });
    }
  }
});

test("there are at least four skins, each with a description to show in the interview", () => {
  assert.ok(Object.keys(SKINS).length >= 4);
  for (const [name, description] of Object.entries(SKINS)) {
    assert.ok(description.length > 20, `skin ${name} needs a real description`);
  }
  assert.deepEqual(Object.keys(BACKENDS).sort(), ["builtin", "relaymint"]);
});

test("a missing skin defaults, a missing backend is an error", () => {
  assert.equal(normaliseBrief(minimal({ chatbot: { backend: "builtin" } })).chatbot.skin, DEFAULT_SKIN);
  assert.throws(() => normaliseBrief(minimal({ chatbot: { skin: "glass" } })), /chatbot\.backend is required/);
});

test("an invalid backend is rejected with the allowed values and the offending one", () => {
  assert.throws(
    () => normaliseBrief(minimal({ chatbot: { backend: "openbot", skin: "glass" } })),
    (err) => {
      assert.match(err.message, /chatbot\.backend "openbot" is not valid/);
      assert.match(err.message, /"relaymint", "builtin"/);
      return true;
    },
  );
});

test("an invalid skin is rejected with the allowed values and the offending one", () => {
  assert.throws(
    () => normaliseBrief(minimal({ chatbot: { backend: "builtin", skin: "neon" } })),
    (err) => {
      assert.match(err.message, /chatbot\.skin "neon" is not valid/);
      for (const skin of Object.keys(SKINS)) assert.ok(err.message.includes(`"${skin}"`));
      return true;
    },
  );
});

test("all problems are reported in one message", () => {
  assert.throws(
    () => normaliseBrief(minimal({ chatbot: { backend: "x", skin: "y", skins: 1 } })),
    (err) => /backend/.test(err.message) && /skin "y"/.test(err.message) && /unknown key "skins"/.test(err.message),
  );
});

test("a chatbot that is not an object is rejected, not silently ignored", () => {
  for (const bad of ["builtin", true, 3, ["builtin"]]) {
    assert.throws(() => normaliseBrief(minimal({ chatbot: bad })), /invalid chatbot: expected an object/);
  }
});

test("string overrides are validated like everything else", () => {
  assert.throws(() => normaliseBrief(minimal({ chatbot: { backend: "builtin", strings: { nope: "x" } } })), /unknown key "nope"/);
  assert.throws(() => normaliseBrief(minimal({ chatbot: { backend: "builtin", strings: { send: "" } } })), /non-empty strings/);
  assert.throws(() => normaliseBrief(minimal({ chatbot: { backend: "builtin", strings: "x" } })), /must be an object/);
});

test("normalising an already normalised brief changes nothing", () => {
  const once = normaliseBrief(minimal({ chatbot: { backend: "builtin", skin: "bubble", strings: { send: "Go" } } }));
  const twice = normaliseBrief(structuredClone(once));
  assert.deepEqual(twice.chatbot, once.chatbot);
});

test("the shipped example brief shows the chatbot key and is valid", () => {
  assert.ok(BRIEF_EXAMPLE.chatbot);
  assert.ok(normaliseBrief(structuredClone(BRIEF_EXAMPLE)).chatbot);
});

// ------------------------------------------------------------------ strings

test("the first message says the visitor is talking to an AI, in every language", () => {
  const disclosure = { en: /\bAI assistant\b/, es: /asistente de IA/, fr: /assistant IA/, de: /KI-Assistent/, pt: /assistente de IA/ };
  for (const [language, pattern] of Object.entries(disclosure)) {
    const brief = normaliseBrief(minimal({ business: { ...minimal().business, locale: `${language}_XX` }, chatbot: { backend: "builtin" } }));
    const { greeting } = resolveChatStrings(brief);
    assert.match(greeting, pattern, `${language} greeting must disclose the AI`);
    assert.ok(greeting.includes("Acme"), "the business name is interpolated");
    assert.doesNotMatch(greeting, /\{name\}/);
  }
});

test("the greeting never claims an action, and says it cannot take one", () => {
  const { greeting } = resolveChatStrings(normaliseBrief(minimal({ chatbot: { backend: "builtin" } })));
  assert.match(greeting, /can't book, send or save anything/);
});

test("every language defines every string key", () => {
  for (const locale of ["en", "es", "fr", "de", "pt"]) {
    const brief = normaliseBrief(minimal({ business: { ...minimal().business, locale }, chatbot: { backend: "builtin" } }));
    const strings = resolveChatStrings(brief);
    for (const key of CHAT_STRING_KEYS) assert.ok(strings[key], `${locale} is missing ${key}`);
  }
});

test("overrides win and unknown locales fall back to English", () => {
  const brief = normaliseBrief(
    minimal({ business: { ...minimal().business, locale: "eu_ES" }, chatbot: { backend: "builtin", strings: { send: "Go" } } }),
  );
  const strings = resolveChatStrings(brief);
  assert.equal(strings.send, "Go");
  assert.equal(strings.placeholder, "Ask a question");
});

// ------------------------------------------------------------------- config

test("the generated config is null without a chatbot", () => {
  const ts = renderChatConfigModule(normaliseBrief(minimal()), "#112233");
  assert.match(ts, /export const chatConfig: ChatConfig \| null = null;/);
});

test("the generated config carries backend, skin and a derived accent, and is valid JSON inside", () => {
  const brief = normaliseBrief(minimal({ chatbot: { backend: "relaymint", skin: "terminal" } }));
  const ts = renderChatConfigModule(brief, "#112233");
  const marker = "export const chatConfig: ChatConfig | null = ";
  const payload = JSON.parse(ts.slice(ts.indexOf(marker) + marker.length, ts.lastIndexOf("}") + 1));
  assert.equal(payload.backend, "relaymint");
  assert.equal(payload.skin, "terminal");
  assert.equal(payload.accent, "#112233");
  assert.ok(payload.maxInputChars > 0);
  assert.ok(payload.strings.greeting.includes("Acme"));
});

test("a skin change rewrites the config and nothing else of the chatbot", () => {
  const a = renderChatConfigModule(normaliseBrief(minimal({ chatbot: { backend: "builtin", skin: "glass" } })), "#112233");
  const b = renderChatConfigModule(normaliseBrief(minimal({ chatbot: { backend: "builtin", skin: "bubble" } })), "#112233");
  assert.equal(a.replace('"glass"', '"bubble"'), b);
});

// ----------------------------------------------------------------- contract

test("the builtin backend is covered by the chat invariants the issue names", () => {
  const ids = chatContractInvariants("builtin").map((i) => i.id);
  for (const needed of [
    "chat.rejects-oversized-body",
    "chat.rejects-oversized-message",
    "chat.rejects-get",
    "chat.rejects-put",
    "chat.rejects-unknown-method",
    "chat.rejects-malformed-json",
    "chat.injection-does-not-leak-prompt",
    "chat.rejects-client-system-role",
  ]) {
    assert.ok(ids.includes(needed), `missing ${needed}`);
  }
  assert.equal(new Set(ids).size, ids.length, "invariant ids are unique");
});

test("every chat invariant can be falsified and uses a valid request", () => {
  for (const inv of chatContractInvariants("builtin")) {
    assert.ok(Object.keys(inv.expect).length > 0, inv.id);
    if (inv.request) assert.match(inv.request.method, /^[A-Z]+$/, inv.id);
  }
});

test("the relaymint backend asserts there is no chat endpoint, and no backend asserts nothing", () => {
  assert.deepEqual(chatContractInvariants("relaymint").map((i) => i.expect.status), [404]);
  assert.deepEqual(chatContractInvariants(undefined), []);
});

test("withChatInvariants replaces chat entries, keeps the project's own, and is idempotent", () => {
  const base = { name: "n", invariants: [{ id: "home", claim: "c", route: "/", expect: { status: 200 } }] };
  const builtin = withChatInvariants(base, "builtin");
  assert.equal(builtin.invariants[0].id, "home");
  assert.deepEqual(withChatInvariants(builtin, "builtin"), builtin);
  const removed = withChatInvariants(builtin, undefined);
  assert.deepEqual(removed.invariants.map((i) => i.id), ["home"]);
  const switched = withChatInvariants(builtin, "relaymint");
  assert.deepEqual(switched.invariants.map((i) => i.id), ["home", "chat.route-disabled"]);
});

test("the checked-in chat contract example is what the generator produces", () => {
  const example = JSON.parse(readFileSync(new URL("../tools/breaker/contract.chat.example.json", import.meta.url), "utf8"));
  assert.deepEqual(example.invariants, chatContractInvariants("builtin"));
});

test("the injection invariant names strings the template's prompt really contains", () => {
  const prompt = readFileSync(new URL("../templates/spa/lib/chat/prompt.ts", import.meta.url), "utf8");
  const injection = chatContractInvariants("builtin").find((i) => i.id === "chat.injection-does-not-leak-prompt");
  for (const needle of injection.expect.bodyExcludes) {
    assert.ok(prompt.includes(needle), `the prompt does not contain "${needle}", so the invariant would pass vacuously`);
  }
});
