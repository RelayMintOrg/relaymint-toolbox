---
name: spa-kit
description: Interview the user about a client, fill in a spa-kit brief, generate the SPA and verify it end to end. Use when the user wants a new client website, says "nuevo cliente", "nueva web", "genera una SPA", or types /spa-kit. Also use to update an existing generated site from its brief.
---

# spa-kit — guided site generation

Turn a conversation into a generated, verified client site. The user should not
have to know the brief schema, the flags, or the oracles.

## Finding the CLI

Resolve it once, at the start, and reuse it. Two contexts, one line:

```bash
SPA_KIT="${CLAUDE_PLUGIN_ROOT:+node ${CLAUDE_PLUGIN_ROOT}/bin/spa-kit.mjs}"
SPA_KIT="${SPA_KIT:-spa-kit}"
$SPA_KIT --help
```

`CLAUDE_PLUGIN_ROOT` is set when this runs as an installed plugin. When it is
not — the skill copied into `~/.claude/skills`, with the CLI on the PATH via
`npm link` — the bare `spa-kit` command is the fallback. If neither resolves, say
so and stop; do not guess a path.

Then, before the first generation on a machine:

```bash
$SPA_KIT doctor --fix
```

It checks Node, the kit's dependencies and Playwright's browsers and installs
what is missing. Do this once, quietly, rather than letting a later step fail for
a missing dependency.

## Principles

**Propose, do not interrogate.** Ask for what only the user can know, then draft
everything else and ask them to correct it. A fifteen-question form is a failure
of this skill.

**Never invent facts about a real business.** Prices, certifications, response
times, headcount, awards, years in business, client names — if the user did not
say it, do not write it. Prefer a true general sentence over a specific
invention. When a section clearly needs a fact you do not have, ask for that one
fact or leave the section out.

**Interview in the user's language. Write the site in the site's language.**
These are often different.

**Do not hand over a red build.** Finish on `PASSED`, or state precisely what
failed and why you could not fix it.

## Step 1 — Ask the essentials

One open question, in the user's language:

> ¿Quién es el cliente, a qué se dedica exactamente, y cuál es su dominio?

From the answer derive: business name, sector, a factual description, and the
URL. If the domain is missing, ask only for that.

## Step 2 — Close the open decisions

One `AskUserQuestion` call, up to four questions. Always offer a recommendation
first. Typical set:

- **Idioma del sitio** — es_ES / en_US / other (infer the likely default from
  the client and put it first).
- **Color de marca** — if they have a hex, they will say so; otherwise offer
  three concrete hexes that suit the sector, each labelled with the colour name,
  plus "tengo el color exacto".
- **Modo** — oscuro (recommended for tech, industrial, premium) or claro
  (recommended for healthcare, legal, education, retail).
- **Secciones** — `multiSelect`, proposing four plausible sections for that
  sector (e.g. for a clinic: servicios, tiempos de respuesta, precios,
  equipo médico).

## Step 2b — Chatbot (backend and skin)

A second `AskUserQuestion` call, because it is an independent decision and the
first call is already full. Ask it in the user's language.

**Question 1 — ¿Quiere un chatbot en la web?** Recommend the option that fits what
the user said about the client; "No" is the default when they did not mention it.

- **No** — the site has no chatbot (omit `chatbot` from the brief).
- **Widget de RelayMint** (`relaymint`) — the site embeds the RelayMint chat
  widget with the business's public widget key. Answers, booking and leads are
  handled by RelayMint. Recommend it when the client needs appointments or lead
  capture.
- **Chatbot integrado, código abierto** (`builtin`) — lives in the site; a server
  route calls an LLM through a provider-agnostic interface (configured by env
  vars) and answers only from the site's own content. It cannot book, send or save
  anything. Recommend it when the client only needs questions answered.

**Question 2, only if they want one — ¿Qué apariencia?** Always show all four
with their description; the skin is independent of the backend, so every skin
works with either:

- **minimal** — flat and quiet: hairline border, small corners, no shadow.
  Disappears into the page.
- **glass** — frosted panel: translucent surface with a backdrop blur and a rim of
  emitted light.
- **bubble** — friendly messenger: a round launcher, a large rounded panel and
  speech-bubble messages.
- **terminal** — monospace console: square corners, prompt markers and a block
  cursor.

Suggest one that suits the brand and mode (for example `minimal` for legal or
healthcare, `glass` for premium or tech, `bubble` for retail or hospitality,
`terminal` for developer tools) and put it first. Both answers go into the brief
as `chatbot: { "backend": "...", "skin": "..." }`. Do not invent a skin name: the
CLI rejects anything but the four above and says which are valid.

## Step 3 — Draft the brief

Write the full brief yourself:

- `hero.headline`: one sentence, concrete, no slogan-speak. It becomes the only
  `<h1>`.
- `hero.subhead`: what they do and for whom, in one or two sentences.
- Each section `body`: **180–320 characters of specific prose.** Vague copy
  fails the SEO probe's prose threshold and, more importantly, gives answer
  engines nothing worth quoting.
- `nav`: one item per section, anchors matching the section ids.
- `footer.note`: `© <name>` plus anything the user mentioned (city, registry).

- `chatbot`: only if they chose one in step 2b.

Then show the user a compact summary — headline, the section titles, brand
colour, language, and the chatbot (backend and skin) if any — and ask for
corrections before generating. Not the raw JSON
unless they ask.

## Step 4 — Generate

Default location `~/Projects/clients/<slug>`; confirm it if the user has not
said where. Then:

```bash
$SPA_KIT new ~/Projects/clients/<slug> --brief=<path-to-your-brief>.json
$SPA_KIT verify ~/Projects/clients/<slug>
```

Write the brief file yourself with the Write tool — do not make the user do it.
Keep the brief inside the generated project (`spa-kit new` copies it to
`brief.json` there).

If the site already exists, edit its `brief.json` and run `apply <dir>` followed
by `verify <dir>` instead. To change only the chatbot's look later:
`$SPA_KIT apply <dir> --skin=<minimal|glass|bubble|terminal>`, then `verify`.

## Step 5 — Fix and report

If `verify` fails, read the failing oracle's output and fix the cause:

| Failure | Usual cause |
| ------- | ----------- |
| `seo` prose/minVisibleText | section bodies too short — lengthen them in the brief, re-`apply` |
| `seo` html-lang | `business.locale` does not match the language the content is written in |
| `contrast targets MISSED` | brand colour too dark or too light for the chosen mode — try the other mode, or adjust the hex with the user |
| `e2e` a11y | usually a hand-edit in `app/`, not the brief |
| `e2e` chatbot (a11y, motion, visual) | a hand-edit in `components/chat/`; a skin must stay on tokens |
| `breaker` `chat.*` | a hand-edit in `lib/chat/` or `app/api/chat/` that weakened a refusal |

Report at the end, briefly: the path, the dev command and port, the verify
verdict, and the brand colour with its contrast ratios. If the site has a chatbot,
also say what the user must configure before it works in production, and that
verification used a fake provider and no real model:

- `relaymint`: `NEXT_PUBLIC_RELAYMINT_WIDGET_ORIGIN` and
  `NEXT_PUBLIC_RELAYMINT_WIDGET_KEY` (public, inlined at build time).
- `builtin`: `CHAT_PROVIDER`, `CHAT_BASE_URL`, `CHAT_MODEL` and `CHAT_API_KEY` on
  the server only, never in the repository. Without them the widget says the
  assistant is unavailable.

Full list in `docs/chatbot.md`. Then offer the two
obvious next steps — editing content in `app/page.tsx`, or deploying.

## What this skill does not do

Pages beyond the home page, real photography, logos, forms or integrations.
Those are ordinary work in the generated project, under the rules in its
`CLAUDE.md`.
