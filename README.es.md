[English](README.md)

# RelayMint Toolbox

Plugins de Claude Code que el equipo de [RelayMint](https://github.com/RelayMintOrg) usa para
construir software con agentes de IA, compartidos en abierto. Iremos añadiendo más
herramientas.

## Instalación

Requisitos: Claude Code y Node.js 24.

En Claude Code:

```bash
/plugin marketplace add RelayMintOrg/relaymint-toolbox
/plugin install spa-kit@relaymint-toolbox
```

## Plugins

| Plugin | Qué hace |
|---|---|
| [**spa-kit**](plugins/spa-kit) | Crea la web de un cliente a partir de una entrevista breve: un sitio Next.js independiente que pueden leer los buscadores **y** los motores de respuesta de IA (GPTBot, ClaudeBot, PerplexityBot), con una paleta de marca derivada de un solo color. Después verifica el sitio con tres comprobaciones independientes: una sonda de rastreo sin JavaScript, un "breaker" ciego que solo ve el contrato y la URL en vivo, y una batería de Playwright (regresión visual, accesibilidad WCAG 2.2, movimiento reducido y web vitals). Empieza con `/spa-kit`. |

## Licencia

[MIT](LICENSE)
