import { test } from "node:test";
import assert from "node:assert/strict";
import { vectorsFor } from "../tools/breaker/src/vectors.ts";
import { parseContract } from "../tools/breaker/src/contract.ts";
import { chatContractInvariants } from "../bin/lib/chatbot.mjs";

const page = { id: "p", claim: "c", route: "/pricing", expect: { status: 200, bodyIncludes: ["x"] } };

test("page invariants keep the page vectors, including the trailing-slash flip", () => {
  const names = vectorsFor(page).map((v) => v.name);
  assert.ok(names.includes("trailing-slash-flip"));
  assert.ok(!names.includes("declared-request"));
});

test("an invariant that declares a request gets the declared request, not page vectors", () => {
  const inv = chatContractInvariants("builtin").find((i) => i.request);
  assert.deepEqual(vectorsFor(inv).map((v) => v.name), ["declared-request", "crawler-user-agent"]);
});

test("an API route is never given the trailing-slash flip", () => {
  const api = { id: "a", claim: "c", route: "/api/chat", expect: { status: 405 } };
  assert.ok(!vectorsFor(api).some((v) => v.name === "trailing-slash-flip"));
});

test("the contract parser accepts every chat invariant", () => {
  const contract = { name: "chat", invariants: chatContractInvariants("builtin") };
  assert.equal(parseContract(JSON.stringify(contract)).invariants.length, contract.invariants.length);
});

test("the contract parser rejects a malformed request or pad", () => {
  const bad = (request) => JSON.stringify({ name: "n", invariants: [{ id: "i", claim: "c", route: "/", request, expect: { status: 200 } }] });
  assert.throws(() => parseContract(bad({ method: "post" })), /upper-case HTTP method/);
  assert.throws(() => parseContract(bad({ method: "POST", pad: { char: "ab", length: 5 } })), /request\.pad/);
  assert.throws(() => parseContract(bad({ method: "POST", pad: { char: "a", length: 99_999_999 } })), /request\.pad/);
  assert.doesNotThrow(() => parseContract(bad({ method: "POST", pad: { char: "a", length: 10 } })));
});
