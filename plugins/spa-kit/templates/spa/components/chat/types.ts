/**
 * Shapes shared by the chat components and the generated `chat.config.ts`.
 * Type-only, so importing it costs nothing at runtime.
 */

export type ChatBackend = "relaymint" | "builtin";
export type ChatSkin = "minimal" | "glass" | "bubble" | "terminal";

/** Interface strings, already in the site's language. */
export interface ChatStrings {
  launcher: string;
  title: string;
  close: string;
  logLabel: string;
  inputLabel: string;
  placeholder: string;
  send: string;
  assistantName: string;
  youName: string;
  typing: string;
  error: string;
  rateLimited: string;
  unavailable: string;
  tooLong: string;
  note: string;
  /** The first message. It must say the visitor is talking to an AI assistant. */
  greeting: string;
}

export interface ChatConfig {
  backend: ChatBackend;
  skin: ChatSkin;
  /** Brand accent as hex, for the RelayMint launcher, which paints in its own document. */
  accent: string;
  maxInputChars: number;
  strings: ChatStrings;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
