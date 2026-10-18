"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { chatConfig } from "@/chat.config.ts";

/**
 * Mounts the chatbot after the page has loaded.
 *
 * It renders nothing on the server and nothing on the first client render, so
 * the HTML a crawler receives is byte-for-byte what it was without a chatbot:
 * no launcher, no chat text, nothing the answers depend on. The widget's code
 * is a separate chunk that is fetched only once the browser is idle, and only
 * on a site whose brief has a chatbot.
 */

const BuiltinChat = dynamic(() => import("./chat-widget.tsx").then((m) => m.ChatWidget), { ssr: false });
const RelayMintEmbed = dynamic(() => import("./relaymint-embed.tsx").then((m) => m.RelayMintEmbed), { ssr: false });

/** The longest the chatbot waits for an idle moment before loading anyway. */
const IDLE_TIMEOUT_MS = 2000;

export function ChatMount() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!chatConfig) return;

    let handle: number | undefined;
    let timer: number | undefined;
    const start = (): void => {
      if (typeof window.requestIdleCallback === "function") {
        handle = window.requestIdleCallback(() => setReady(true), { timeout: IDLE_TIMEOUT_MS });
      } else {
        timer = window.setTimeout(() => setReady(true), IDLE_TIMEOUT_MS);
      }
    };

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      window.removeEventListener("load", start);
      if (handle !== undefined) window.cancelIdleCallback(handle);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, []);

  if (!chatConfig || !ready) return null;
  return chatConfig.backend === "builtin" ? <BuiltinChat config={chatConfig} /> : <RelayMintEmbed config={chatConfig} />;
}
