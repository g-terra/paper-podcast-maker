# paper-podcast-maker

Turn academic papers into podcast episodes, entirely on your own machine.

paper-podcast-maker is a local tool with a UI that takes an academic paper, uses a locally run AI model (the Codex CLI or the Claude CLI) to write a conversational podcast transcript from it, and then renders that transcript to audio with local text-to-speech.

## Planned features

- **Paper in, podcast out**: load a paper (PDF) and get a transcript plus an audio episode.
- **Local AI**: the transcript is written by a model you already run locally, Codex or Claude, through its CLI.
- **Configurable length**: set a minimum and maximum talk time for the episode.
- **Voices**: define the hosts, their voices, and their roles in the conversation.
- **More settings**: tone, depth, audience level, and similar options.
- **Runs locally**: no hosted backend; your papers stay on your machine.

## Status

Early stage. The monorepo is scaffolded: the UI shows episode settings and which AI CLIs the local server can find. Transcript generation and audio are not wired up yet.

## Repository layout

This is a [pnpm workspaces](https://pnpm.io/workspaces) monorepo.

| Package                 | Path              | What it is                                                                                                |
| ----------------------- | ----------------- | --------------------------------------------------------------------------------------------------------- |
| `@paper-podcast/web`    | `apps/web`        | The UI: React + TypeScript + Tailwind CSS, built with Vite.                                               |
| `@paper-podcast/server` | `apps/server`     | The local backend (Fastify). Drives the Codex/Claude CLI and local TTS. Listens on `127.0.0.1:8787` only. |
| `@paper-podcast/shared` | `packages/shared` | Types and Zod schemas (settings, transcript, API) used by both.                                           |

In development the web app proxies `/api` to the local server, so the two run as one app.

## Development

Requirements: Node.js 22+ and pnpm (`corepack enable` gives you the pinned version).

```sh
pnpm install
pnpm dev          # web on http://localhost:5173, server on http://127.0.0.1:8787
```

Other scripts, run from the repo root:

| Script           | Does                               |
| ---------------- | ---------------------------------- |
| `pnpm build`     | Builds the web app and the server. |
| `pnpm test`      | Runs Vitest in every package.      |
| `pnpm lint`      | ESLint over the whole repo.        |
| `pnpm typecheck` | `tsc` in every package.            |
| `pnpm format`    | Prettier.                          |
| `pnpm check`     | Everything CI runs.                |

The server reads `PPM_HOST` and `PPM_PORT`; the web dev server reads `PPM_SERVER_URL` to know where to proxy.

## License

MIT, see [LICENSE](LICENSE).
