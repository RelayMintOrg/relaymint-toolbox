"use client";

import { useEffect } from "react";
import type { ChatConfig } from "./types.ts";
import "./chat.css";

const SCRIPT_ID = "relaymint-widget-loader";

/**
 * The RelayMint backend: injects RelayMint's one-line embed and carries the
 * chosen skin over to the parts of it this site can reach.
 *
 * The conversation itself runs in RelayMint's own frame, where answers, booking
 * and leads are handled; its interior is configured in RelayMint, not here. The
 * skin therefore styles the launcher and the frame's outer box (see the last
 * section of `chat.css`), and the brand accent is passed to the embed derived
 * from the site's palette.
 *
 * Both variables are public by design and inlined at build time, so a change
 * needs a rebuild:
 *   NEXT_PUBLIC_RELAYMINT_WIDGET_ORIGIN   https origin serving /widget.js
 *   NEXT_PUBLIC_RELAYMINT_WIDGET_KEY      the business's public widget key
 */

/** Only https origins (or a local one for development) may supply a script we inject. */
function safeOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    return url.protocol === "https:" || local ? url.origin : null;
  } catch {
    return null;
  }
}

export function RelayMintEmbed({ config }: { config: ChatConfig }) {
  const origin = safeOrigin(process.env.NEXT_PUBLIC_RELAYMINT_WIDGET_ORIGIN?.trim() ?? "");
  const publicKey = process.env.NEXT_PUBLIC_RELAYMINT_WIDGET_KEY?.trim() ?? "";
  const { skin, accent } = config;
  const label = config.strings.launcher;

  useEffect(() => {
    if (!origin || !publicKey) {
      console.warn(
        "[chat] RelayMint widget not loaded: set NEXT_PUBLIC_RELAYMINT_WIDGET_ORIGIN (https) and NEXT_PUBLIC_RELAYMINT_WIDGET_KEY, then rebuild.",
      );
      return;
    }

    document.documentElement.dataset["chatSkin"] = skin;
    if (document.getElementById(SCRIPT_ID)) return;

    // Built by hand: RelayMint's loader reads its settings from the data
    // attributes of the script element that loaded it.
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `${origin}/widget.js`;
    script.async = true;
    script.dataset["relaymint"] = publicKey;
    script.dataset["position"] = "bottom-right";
    script.dataset["color"] = accent;
    script.dataset["label"] = label;
    script.onerror = () => {
      script.remove();
      console.warn(`[chat] RelayMint widget failed to load from ${script.src}`);
    };
    document.body.appendChild(script);
  }, [origin, publicKey, skin, accent, label]);

  return null;
}
