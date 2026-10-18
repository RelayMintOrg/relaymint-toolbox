[Español](README.es.md)

# RelayMint Toolbox

Claude Code plugins the [RelayMint](https://github.com/RelayMintOrg) team uses to build
software with AI agents, shared in the open. More tools will be added over time.

## Install

Requirements: Claude Code and Node.js 24.

In Claude Code:

```bash
/plugin marketplace add RelayMintOrg/relaymint-toolbox
/plugin install spa-kit@relaymint-toolbox
```

## Plugins

| Plugin | What it does |
|---|---|
| [**spa-kit**](plugins/spa-kit) | Builds a client website from a short interview: a standalone Next.js site that search engines **and** AI answer engines (GPTBot, ClaudeBot, PerplexityBot) can read, with a brand palette derived from one color and an optional chatbot in one of four UI skins. Then it verifies the site with three independent checks: a no-JavaScript crawler probe, a blind "breaker" that only sees the contract and the live URL, and a Playwright suite (visual regression, WCAG 2.2 accessibility, reduced motion, web vitals). Run `/spa-kit` to start. |

## License

[MIT](LICENSE)
