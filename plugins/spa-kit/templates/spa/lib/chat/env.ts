/**
 * Runtime settings of the built-in chatbot, read from environment variables on
 * the server. Nothing here is ever sent to the browser: the variables carry no
 * `NEXT_PUBLIC_` prefix on purpose, so the bundler cannot inline them.
 */

export interface ChatEnv {
  /** Which provider answers. `undefined` means the assistant is not configured. */
  provider: string | undefined;
  baseUrl: string | undefined;
  apiKey: string | undefined;
  model: string | undefined;
  /** Characters allowed in one visitor message. */
  maxInputChars: number;
  /** Characters allowed in the whole request body. */
  maxBodyBytes: number;
  maxOutputTokens: number;
  timeoutMs: number;
  rateLimitMax: number;
  rateLimitWindowMs: number;
  /** Header that carries the client address, as set by the platform's proxy. */
  clientIpHeader: string;
  /** The `fake` provider is for verification only; production needs an explicit opt-in. */
  allowFake: boolean;
  production: boolean;
}

type Env = Record<string, string | undefined>;

function int(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function readChatEnv(env: Env): ChatEnv {
  return {
    provider: text(env["CHAT_PROVIDER"]),
    baseUrl: text(env["CHAT_BASE_URL"]),
    apiKey: text(env["CHAT_API_KEY"]),
    model: text(env["CHAT_MODEL"]),
    maxInputChars: int(env["CHAT_MAX_INPUT_CHARS"], 800, 20, 4000),
    // A body is at most a dozen messages; this bound exists to stop a huge
    // upload before it is read, not to size a conversation.
    maxBodyBytes: int(env["CHAT_MAX_BODY_BYTES"], 32_768, 1024, 262_144),
    maxOutputTokens: int(env["CHAT_MAX_OUTPUT_TOKENS"], 400, 16, 4000),
    timeoutMs: int(env["CHAT_TIMEOUT_MS"], 20_000, 1000, 120_000),
    rateLimitMax: int(env["CHAT_RATE_LIMIT_MAX"], 20, 1, 100_000),
    rateLimitWindowMs: int(env["CHAT_RATE_LIMIT_WINDOW_SECONDS"], 60, 1, 86_400) * 1000,
    clientIpHeader: (text(env["CHAT_CLIENT_IP_HEADER"]) ?? "x-forwarded-for").toLowerCase(),
    allowFake: env["CHAT_ALLOW_FAKE"] === "1",
    production: env["NODE_ENV"] === "production",
  };
}
