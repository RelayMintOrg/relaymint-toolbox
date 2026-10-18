/**
 * The CLI end to end for the chatbot, without installing anything: generate into
 * a temp directory, change the skin, and read back what changed on disk.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = new URL("../bin/spa-kit.mjs", import.meta.url).pathname;
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/self-test-brief.json", import.meta.url), "utf8"));

let work;
before(() => {
  work = mkdtempSync(join(tmpdir(), "spa-kit-cli-chatbot-"));
});
after(() => rmSync(work, { recursive: true, force: true }));

const run = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
const read = (dir, file) => readFileSync(join(dir, file), "utf8");
const readJson = (dir, file) => JSON.parse(read(dir, file));
const brief = (name, chatbot) => {
  const path = join(work, `${name}.json`);
  const { chatbot: _drop, ...rest } = FIXTURE;
  writeFileSync(path, JSON.stringify(chatbot ? { ...rest, chatbot } : rest));
  return path;
};

test("a brief without a chatbot generates a site with no chat and an untouched contract", () => {
  const dir = join(work, "none");
  const res = run("new", dir, `--brief=${brief("none")}`, "--install=false");
  assert.equal(res.status, 0, res.stderr);
  assert.match(read(dir, "chat.config.ts"), /chatConfig: ChatConfig \| null = null;/);
  assert.equal("chatbot" in readJson(dir, "brief.json"), false);
  assert.deepEqual(
    readJson(dir, "contract.json").invariants.map((i) => i.id),
    ["home.server-rendered", "robots.allows-ai-crawlers", "sitemap.served", "llms-txt.served"],
  );
});

test("a builtin chatbot is configured and its route is added to the contract", () => {
  const dir = join(work, "builtin");
  const res = run("new", dir, `--brief=${brief("builtin", { backend: "builtin", skin: "glass" })}`, "--install=false");
  assert.equal(res.status, 0, res.stderr);
  assert.match(read(dir, "chat.config.ts"), /"skin": "glass"/);
  const ids = readJson(dir, "contract.json").invariants.map((i) => i.id);
  assert.ok(ids.includes("chat.rejects-oversized-body"));
  assert.ok(ids.includes("home.server-rendered"), "the project's own invariants stay");
});

test("apply --skin changes the skin in the brief and the config, and nothing else of the chatbot", () => {
  const dir = join(work, "reskin");
  assert.equal(run("new", dir, `--brief=${brief("reskin", { backend: "builtin", skin: "glass" })}`, "--install=false").status, 0);
  const before = readJson(dir, "contract.json");

  const res = run("apply", dir, "--skin=terminal");
  assert.equal(res.status, 0, res.stderr);
  assert.match(res.stdout, /chat\s+builtin · terminal/);
  assert.match(read(dir, "chat.config.ts"), /"skin": "terminal"/);
  assert.equal(readJson(dir, "brief.json").chatbot.skin, "terminal");
  assert.equal(readJson(dir, "brief.json").chatbot.backend, "builtin");
  assert.deepEqual(readJson(dir, "contract.json"), before, "the contract does not depend on the skin");
});

test("apply with an invalid skin fails with a usable message and changes nothing", () => {
  const dir = join(work, "invalid");
  assert.equal(run("new", dir, `--brief=${brief("invalid", { backend: "builtin", skin: "glass" })}`, "--install=false").status, 0);
  const res = run("apply", dir, "--skin=neon");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /chatbot\.skin "neon" is not valid \(one of "minimal", "glass", "bubble", "terminal"\)/);
  assert.equal(readJson(dir, "brief.json").chatbot.skin, "glass");
});

test("switching the backend swaps the chat invariants", () => {
  const dir = join(work, "switch");
  assert.equal(run("new", dir, `--brief=${brief("switch", { backend: "builtin", skin: "minimal" })}`, "--install=false").status, 0);
  assert.equal(run("apply", dir, "--backend=relaymint").status, 0);
  const ids = readJson(dir, "contract.json").invariants.map((i) => i.id);
  assert.ok(ids.includes("chat.route-disabled"));
  assert.ok(!ids.includes("chat.rejects-oversized-body"));
});

test("apply --skin on a brief with no chatbot explains how to add one", () => {
  const dir = join(work, "nochat-skin");
  assert.equal(run("new", dir, `--brief=${brief("nochat-skin")}`, "--install=false").status, 0);
  const res = run("apply", dir, "--skin=glass");
  assert.equal(res.status, 2);
  assert.match(res.stderr, /no chatbot/);
});

test("new accepts --chatbot and --skin for a flag-built site", () => {
  const dir = join(work, "flags");
  const res = run("new", dir, "--name=Acme", "--url=https://acme.test", "--chatbot=relaymint", "--skin=bubble", "--install=false");
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(readJson(dir, "brief.json").chatbot, { backend: "relaymint", skin: "bubble" });
});
