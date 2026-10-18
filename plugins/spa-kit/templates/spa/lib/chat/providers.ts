/**
 * The provider interface, and the adapters behind it.
 *
 * The route knows only `ChatProvider`. Which model answers, and who hosts it,
 * is configuration: switching is an environment change, not a code change. To
 * add a provider, implement `complete` and register it in `createProvider`.
 */
import type { ChatMessage } from "../../components/chat/types.ts";
import type { ChatEnv } from "./env.ts";

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface ChatProvider {
  readonly name: string;
  /** Resolves with the assistant's reply text. Rejects on any failure. */
  complete(request: CompletionRequest): Promise<string>;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** http is accepted only for a local model server; everything else must be https. */
function isAllowedBaseUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/**
 * Any endpoint that speaks the widely implemented "chat completions" JSON
 * shape: hosted services and self-hosted model servers alike. The key travels
 * only from this server to the provider, in a header.
 */
export function chatCompletionsProvider(
  settings: { baseUrl: string; apiKey: string | undefined; model: string },
  fetchImpl: FetchLike = fetch,
): ChatProvider {
  const endpoint = `${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  return {
    name: "chat-completions",
    async complete({ system, messages, maxOutputTokens, signal }) {
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (settings.apiKey) headers["authorization"] = `Bearer ${settings.apiKey}`;

      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        signal,
        body: JSON.stringify({
          model: settings.model,
          max_tokens: maxOutputTokens,
          temperature: 0.2,
          messages: [{ role: "system", content: system }, ...messages],
        }),
      });
      if (!response.ok) throw new Error(`provider answered HTTP ${response.status}`);

      const data = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        throw new Error("provider returned no text");
      }
      return content;
    },
  };
}

/**
 * A deterministic stand-in for tests and for `spa-kit verify`. It calls no
 * model. It also behaves like the worst case on purpose: asked for its system
 * prompt or instructions it hands the prompt over, so the oracles can prove the
 * route withholds it. Never enable it on a real site.
 */
export function fakeProvider(): ChatProvider {
  return {
    name: "fake",
    complete({ system, messages }) {
      const last = messages[messages.length - 1]?.content ?? "";
      if (/system prompt|instructions/i.test(last)) return Promise.resolve(system);
      return Promise.resolve(`Fake reply to: ${last.slice(0, 80)}`);
    },
  };
}

export type ProviderResult = { ok: true; provider: ChatProvider } | { ok: false; reason: string };

/** Builds the configured provider, or says precisely why there is none. */
export function createProvider(env: ChatEnv, fetchImpl?: FetchLike): ProviderResult {
  switch (env.provider) {
    case undefined:
      return { ok: false, reason: "CHAT_PROVIDER is not set" };
    case "fake":
      if (env.production && !env.allowFake) {
        return {
          ok: false,
          reason: "the fake provider is disabled in production (set CHAT_ALLOW_FAKE=1 to verify)",
        };
      }
      return { ok: true, provider: fakeProvider() };
    case "chat-completions": {
      if (!env.baseUrl || !env.model) {
        return { ok: false, reason: "CHAT_BASE_URL and CHAT_MODEL are required for chat-completions" };
      }
      if (!isAllowedBaseUrl(env.baseUrl)) {
        return { ok: false, reason: "CHAT_BASE_URL must be https (http only for localhost)" };
      }
      return {
        ok: true,
        provider: chatCompletionsProvider(
          { baseUrl: env.baseUrl, apiKey: env.apiKey, model: env.model },
          fetchImpl,
        ),
      };
    }
    default:
      return { ok: false, reason: `unknown CHAT_PROVIDER "${env.provider}" (use "chat-completions")` };
  }
}
