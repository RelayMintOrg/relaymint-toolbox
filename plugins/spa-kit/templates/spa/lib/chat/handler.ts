/**
 * The chat route's logic, written against the web-standard Request and
 * Response so it runs the same under Next and under a plain test runner.
 *
 * Order matters and is the point of this file: cheap refusals first (method,
 * rate, size, shape), the model last. A request that can be refused without
 * spending a token is refused without spending one.
 */
import type { ChatMessage } from "../../components/chat/types.ts";
import type { ChatEnv } from "./env.ts";
import { leaksInstructions, WITHHELD_REPLY } from "./prompt.ts";
import type { ChatProvider } from "./providers.ts";
import type { RateLimiter } from "./rate-limit.ts";

/** Most messages accepted in one request. The browser sends the tail of the conversation. */
const MAX_MESSAGES = 12;
/** Past assistant turns are the browser's copy, so they get a generous but finite cap. */
const MAX_ASSISTANT_CHARS = 4000;
const MAX_REPLY_CHARS = 2000;

export interface ChatDeps {
  env: ChatEnv;
  /** `null` when the assistant is not configured; the route answers 503. */
  provider: ChatProvider | null;
  limiter: RateLimiter;
  system: { text: string; secrets: readonly string[] };
}

type ErrorCode =
  | "method_not_allowed"
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_request"
  | "rate_limited"
  | "unavailable"
  | "upstream_error";

const MESSAGES: Record<ErrorCode, string> = {
  method_not_allowed: "Use POST.",
  unsupported_media_type: "Send the request as application/json.",
  payload_too_large: "The message is too long.",
  invalid_request: "The request is not valid.",
  rate_limited: "Too many requests. Try again shortly.",
  unavailable: "The assistant is not available.",
  upstream_error: "The assistant could not answer.",
};

function respond(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...extra,
    },
  });
}

/** Errors never echo the request or the provider's message: both can carry secrets or payloads. */
function fail(status: number, code: ErrorCode, extra: Record<string, string> = {}): Response {
  return respond(status, { error: { code, message: MESSAGES[code] } }, extra);
}

/** Reads at most `limit` bytes. Returns null as soon as the body is over it. */
async function readLimited(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

type Parsed = { ok: true; messages: ChatMessage[] } | { ok: false; response: Response };

function parseMessages(raw: string, env: ChatEnv): Parsed {
  const invalid: Parsed = { ok: false, response: fail(400, "invalid_request") };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return invalid;
  }
  const list = (data as { messages?: unknown } | null)?.messages;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_MESSAGES) return invalid;

  const messages: ChatMessage[] = [];
  for (const item of list as unknown[]) {
    if (typeof item !== "object" || item === null) return invalid;
    const { role, content } = item as { role?: unknown; content?: unknown };
    // A client may speak as the user or replay the assistant's turns. It may
    // never speak as the system: that role is ours alone.
    if ((role !== "user" && role !== "assistant") || typeof content !== "string") return invalid;

    const clean = content.replace(CONTROL_CHARS, "").trim();
    if (clean === "") return invalid;
    const cap = role === "user" ? env.maxInputChars : MAX_ASSISTANT_CHARS;
    if (clean.length > cap) return { ok: false, response: fail(413, "payload_too_large") };
    messages.push({ role, content: clean });
  }

  return messages[messages.length - 1]?.role === "user" ? { ok: true, messages } : invalid;
}

/**
 * What an operator needs to diagnose a failing provider, and nothing else: the
 * error's kind, the provider's HTTP status and whether it was a timeout. Never
 * the message (a provider can echo our request in it), the key, or any body.
 */
function describeFailure(err: unknown): string {
  const name = err instanceof Error ? err.name : "NonError";
  if (name === "TimeoutError" || name === "AbortError") return "timed out";
  const status = err instanceof Error ? /^provider answered HTTP (\d{3})$/.exec(err.message)?.[1] : undefined;
  return status ? `HTTP ${status}` : name;
}

function clientKey(request: Request, env: ChatEnv): string {
  const header = request.headers.get(env.clientIpHeader);
  if (!header) return "unknown";
  // The nearest proxy appends the address it saw, so the last entry is the one
  // a client cannot choose; earlier entries are whatever the client claimed.
  const last = header.split(",").pop()?.trim();
  return last ? last.slice(0, 64) : "unknown";
}

export function createChatHandler(deps: ChatDeps): (request: Request) => Promise<Response> {
  const { env, provider, limiter, system } = deps;

  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return fail(405, "method_not_allowed", { allow: "POST" });
    }

    // Counted before anything is read or parsed, so malformed floods are limited too.
    const hit = limiter.hit(clientKey(request, env));
    if (!hit.allowed) {
      return fail(429, "rate_limited", { "retry-after": String(hit.retryAfterSeconds) });
    }

    const type = request.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(type)) return fail(415, "unsupported_media_type");

    let raw: string | null;
    try {
      raw = await readLimited(request, env.maxBodyBytes);
    } catch {
      // The client went away mid-upload. Keep the answer inside the error contract.
      return fail(400, "invalid_request");
    }
    if (raw === null) return fail(413, "payload_too_large");

    const parsed = parseMessages(raw, env);
    if (!parsed.ok) return parsed.response;

    if (!provider) return fail(503, "unavailable");

    try {
      const reply = await provider.complete({
        system: system.text,
        messages: parsed.messages,
        maxOutputTokens: env.maxOutputTokens,
        signal: AbortSignal.timeout(env.timeoutMs),
      });
      const text = reply.replace(CONTROL_CHARS, "").trim().slice(0, MAX_REPLY_CHARS);
      if (text === "") return fail(502, "upstream_error");
      return respond(200, { reply: leaksInstructions(text, system.secrets) ? WITHHELD_REPLY : text });
    } catch (err) {
      console.error(`[chat] provider "${provider.name}" failed: ${describeFailure(err)}`);
      return fail(502, "upstream_error");
    }
  };
}
