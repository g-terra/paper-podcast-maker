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

Working end to end: upload a PDF, pick your settings, and the app writes a script with your local Claude or Codex CLI, voices it with a local text-to-speech engine, and gives you a WAV you can play or download. You can edit the transcript and re-record.

## Quick start

You need Node.js 22+, pnpm (`corepack enable`), and:

1. **A script writer**, at least one of:
   - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`), signed in.
   - [Codex CLI](https://github.com/openai/codex) (`codex`), signed in.
2. **A voice engine**, at least one of:
   - **macOS `say`**: built in. Nicer voices can be added in System Settings > Accessibility > Spoken Content.
   - **Windows speech**: built in.
   - **Piper** (natural neural voices, any OS): `pipx install piper-tts`, then download voices (an `.onnx` file plus its `.onnx.json`) from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) into `~/.paper-podcast-maker/piper-voices/`.
   - **eSpeak NG** (robotic, any OS): `brew install espeak-ng` or `apt install espeak-ng`.

Then start it with the `ppm` command:

```sh
bin/ppm install   # once: makes `ppm` available in any terminal
ppm open          # installs, builds and starts the app in the background, then opens it
```

Or just double-click **Start Paper Podcast.command** (macOS) or **Start Paper Podcast.cmd** (Windows).

| Command                  | Does                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `ppm start [--port N]`   | Starts the app in the background on port 8787, or the next free port if that one is busy. Rebuilds first if the code changed. |
| `ppm open [--port N]`    | Opens the app in your browser, starting it if needed.                                                                         |
| `ppm stop [--port N]`    | Stops it. With `--port`, it also stops a copy started with `pnpm start`.                                                      |
| `ppm restart [--port N]` | Stops it and starts it again.                                                                                                 |
| `ppm status`             | Shows whether it is running, and where.                                                                                       |
| `ppm logs`               | Follows the server log.                                                                                                       |
| `ppm update`             | Runs `git pull` and installs dependencies.                                                                                    |

Without installing the command, use `pnpm ppm <command>` or `node bin/ppm.mjs <command>`. To run in the foreground instead: `pnpm build && pnpm start --port 9000` (or `PPM_PORT=9000 pnpm start`).

The app shows which CLIs and voice engines it found. Papers, transcripts, audio and logs are kept in `~/.paper-podcast-maker/` (change it with `PPM_DATA_DIR`).

### How it works

1. The server extracts the paper's text (scanned PDFs without a text layer need OCR first).
2. It asks the CLI for a JSON script sized to your min/max length (about 150 spoken words per minute), and retries once if the length is off.
3. Each line is spoken with the host's voice, and the clips are joined into one WAV. Hosts left on "Auto voice" each get a different installed voice.

The CLI runs with no tools (Claude) or a read-only sandbox in an empty temp folder (Codex), and the server only listens on `127.0.0.1`.

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

Server settings: `PPM_HOST`, `PPM_PORT`, `PPM_DATA_DIR`, `PPM_PIPER_VOICES_DIR`, `PPM_AI_TIMEOUT_MS` (default 15 minutes). The web dev server reads `PPM_SERVER_URL` to know where to proxy.

## License

MIT, see [LICENSE](LICENSE).
