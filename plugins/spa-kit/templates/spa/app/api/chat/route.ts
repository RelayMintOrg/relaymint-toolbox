import { handleChatRequest } from "@/lib/chat/runtime.ts";

/**
 * The built-in chatbot's endpoint. All behaviour lives in `lib/chat/`; this
 * file only exposes it. Every method is routed to the same handler, which
 * refuses anything but POST with a 405, so the refusal is ours and not whatever
 * the framework would default to.
 *
 * Not cached and not statically optimised: each request is a conversation turn.
 */
export const dynamic = "force-dynamic";

export const GET = handleChatRequest;
export const POST = handleChatRequest;
export const PUT = handleChatRequest;
export const PATCH = handleChatRequest;
export const DELETE = handleChatRequest;
export const HEAD = handleChatRequest;
export const OPTIONS = handleChatRequest;
