"use client";

import { type FormEvent, type KeyboardEvent, type CSSProperties, useEffect, useId, useRef, useState } from "react";
import type { ChatConfig, ChatMessage } from "./types.ts";
import "./chat.css";

/**
 * The built-in chatbot's interface.
 *
 * One component, every skin: the skin is the `data-chat-skin` attribute on the
 * root and nothing in the markup depends on it, so every skin gets the same
 * keyboard behaviour, focus management and live-region announcements.
 *
 * What it guarantees, and the e2e suite checks per skin:
 *  - opening moves focus to the input; Escape or the close button closes the
 *    panel and returns focus to the launcher;
 *  - new messages are announced through an `aria-live` log;
 *  - the first message says the visitor is talking to an AI assistant;
 *  - it never reports an action as done: it has no way to take one.
 */

interface Entry extends ChatMessage {
  id: number;
  /** The opening message, which is local and never sent to the server. */
  greeting?: true;
  error?: true;
}

/** Turns of history sent with each question: enough for follow-ups, bounded for cost. */
const HISTORY_LIMIT = 10;

function Icon({ name }: { name: "chat" | "close" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {name === "chat" ? <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /> : <path d="M6 6l12 12M18 6 6 18" />}
    </svg>
  );
}

export function ChatWidget({ config }: { config: ChatConfig }) {
  const { strings } = config;
  const ids = { panel: useId(), title: useId(), input: useId() };

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([
    { id: 0, role: "assistant", content: strings.greeting, greeting: true },
  ]);

  const nextId = useRef(1);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const hasOpened = useRef(false);
  const inflight = useRef<AbortController | null>(null);

  // Focus follows the panel: into the input when it opens, back to the
  // launcher when it closes. The first render is neither, so it is skipped.
  useEffect(() => {
    if (open) {
      hasOpened.current = true;
      input.current?.focus();
    } else if (hasOpened.current) {
      launcher.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, pending, open]);

  useEffect(() => () => inflight.current?.abort(), []);

  function append(entry: Omit<Entry, "id">): void {
    setEntries((current) => [...current, { ...entry, id: nextId.current++ }]);
  }

  function failureText(status: number): string {
    if (status === 429) return strings.rateLimited;
    if (status === 413) return strings.tooLong;
    if (status === 404 || status === 503) return strings.unavailable;
    return strings.error;
  }

  async function send(text: string): Promise<void> {
    const history: ChatMessage[] = [
      ...entries.filter((e) => !e.greeting && !e.error).map(({ role, content }) => ({ role, content })),
      { role: "user" as const, content: text },
    ].slice(-HISTORY_LIMIT);

    append({ role: "user", content: text });
    setDraft("");
    setPending(true);

    const controller = new AbortController();
    inflight.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
        signal: controller.signal,
      });
      if (!response.ok) {
        append({ role: "assistant", content: failureText(response.status), error: true });
        return;
      }
      const data = (await response.json()) as { reply?: unknown };
      if (typeof data.reply !== "string") {
        append({ role: "assistant", content: strings.error, error: true });
        return;
      }
      append({ role: "assistant", content: data.reply });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      append({ role: "assistant", content: strings.error, error: true });
    } finally {
      if (inflight.current === controller) inflight.current = null;
      setPending(false);
      input.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const text = draft.trim();
    if (text === "" || pending) return;
    void send(text);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
    }
  }

  return (
    <div className="kit-chat" data-chat-root="" data-chat-skin={config.skin} data-open={open} onKeyDown={onKeyDown}>
      {open && (
        <section
          id={ids.panel}
          className="kit-chat__panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby={ids.title}
        >
          <header className="kit-chat__header">
            <h2 id={ids.title} className="kit-chat__title">
              {strings.title}
            </h2>
            <button type="button" className="kit-chat__close" aria-label={strings.close} onClick={() => setOpen(false)}>
              <Icon name="close" />
            </button>
          </header>

          <div
            ref={log}
            className="kit-chat__log"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={strings.logLabel}
            tabIndex={0}
          >
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="kit-chat__msg"
                data-role={entry.role}
                {...(entry.error ? { "data-error": "" } : {})}
                {...(entry.greeting ? { "data-chat-disclosure": "" } : {})}
              >
                <span className="kit-chat__who">{entry.role === "user" ? strings.youName : strings.assistantName}</span>
                <p className="kit-chat__bubble">{entry.content}</p>
              </div>
            ))}
          </div>

          <p className="kit-chat__status" role="status">
            {pending && (
              <>
                <span className="kit-chat__dots" aria-hidden="true">
                  {[0, 1, 2].map((i) => (
                    <i key={i} style={{ "--i": i } as CSSProperties} />
                  ))}
                </span>
                <span>{strings.typing}</span>
              </>
            )}
          </p>

          <form className="kit-chat__form" onSubmit={onSubmit}>
            <label htmlFor={ids.input} className="kit-chat__sr">
              {strings.inputLabel}
            </label>
            <input
              ref={input}
              id={ids.input}
              className="kit-chat__input"
              type="text"
              value={draft}
              maxLength={config.maxInputChars}
              placeholder={strings.placeholder}
              autoComplete="off"
              enterKeyHint="send"
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className="kit-chat__send" disabled={pending || draft.trim() === ""}>
              {strings.send}
            </button>
          </form>

          <p className="kit-chat__note">{strings.note}</p>
        </section>
      )}

      <button
        ref={launcher}
        type="button"
        className="kit-chat__launcher"
        aria-haspopup="dialog"
        aria-expanded={open}
        {...(open ? { "aria-controls": ids.panel } : {})}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="chat" />
        <span className="kit-chat__launcher-label">{strings.launcher}</span>
      </button>
    </div>
  );
}
