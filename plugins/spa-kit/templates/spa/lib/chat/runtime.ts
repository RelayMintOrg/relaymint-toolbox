/**
 * Wires the chat route to this site: its content, its chatbot configuration
 * and the environment. Kept apart from `handler.ts` so the logic there stays
 * free of anything that only resolves under the bundler.
 */
import { chatConfig } from "@/chat.config.ts";
import { content } from "@/content.ts";
import { site } from "@/lib/site.ts";
import { readChatEnv } from "./env.ts";
import { createChatHandler } from "./handler.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { createProvider } from "./providers.ts";
import { createRateLimiter } from "./rate-limit.ts";

type Handle = (request: Request) => Promise<Response>;

let cached: Handle | undefined;

/** Without the built-in backend the route does not exist, as far as a caller can tell. */
function notFound(): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify({ error: { code: "not_found", message: "Not found." } }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    }),
  );
}

function build(): Handle {
  if (chatConfig?.backend !== "builtin") return () => notFound();

  const env = readChatEnv(process.env);
  const result = createProvider(env);
  if (!result.ok) console.warn(`[chat] assistant disabled: ${result.reason}`);

  return createChatHandler({
    env,
    provider: result.ok ? result.provider : null,
    limiter: createRateLimiter({ max: env.rateLimitMax, windowMs: env.rateLimitWindowMs }),
    system: buildSystemPrompt(site, content),
  });
}

/** Built on first use, so the environment is read at run time and not frozen into the build. */
export function handleChatRequest(request: Request): Promise<Response> {
  cached ??= build();
  return cached(request);
}
