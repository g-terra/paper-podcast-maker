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
2. **A voice engine.** **Kokoro** is built in and is the default: natural-sounding English voices that run inside the app, with no install needed. The first episode downloads the model once (about 90 MB, into `~/.paper-podcast-maker/models`). The other engines are optional:
   - **macOS `say`**: built in. Nicer voices can be added in System Settings > Accessibility > Spoken Content.
   - **Windows speech**: built in.
   - **Piper** (natural neural voices, any OS): `pipx install piper-tts`, then download voices (an `.onnx` file plus its `.onnx.json`) from [rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices) into `~/.paper-podcast-maker/piper-voices/`.
   - **eSpeak NG** (robotic, any OS): `brew install espeak-ng` or `apt install espeak-ng`.

Then, from the repo folder:

```sh
pnpm run setup    # installs, builds, links `ppm`, downloads the Kokoro voices, checks your AI CLIs
ppm open          # starts the app and opens it in your browser
```

On macOS you can double-click `Setup Paper Podcast.command` instead, which does both. Setup is safe to run again at any time: it prints a ✓/✗ list and says how to fix anything missing (for example `claude auth login` when Claude Code isn't signed in). If your shell says `command not found: ppm` right after setup, run `rehash` or open a new terminal tab.

`ppm open` and `ppm start` print the URL (http://127.0.0.1:8787 unless that port is taken, in which case it picks the next free one). The app shows which CLIs and voice engines it found. Papers, transcripts and audio are kept in `~/.paper-podcast-maker/` (change it with `PPM_DATA_DIR`).

### The `ppm` command

`ppm` is `bin/ppm.mjs`, a small launcher. Setup puts it on your PATH (macOS/Linux; `pnpm ppm link` does just that step). Then:

| Command                  | Does                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------- |
| `ppm setup`              | Installs, builds, gets the Kokoro voices and checks your AI CLIs. Safe to rerun.       |
| `ppm start`              | Starts the app in the background (builds it first if needed).                          |
| `ppm start --port 9000`  | Uses another port (or set `PPM_PORT`). Without it, 8787 or the next free port is used. |
| `ppm start --foreground` | Runs the server in this terminal instead.                                              |
| `ppm stop`               | Stops it.                                                                              |
| `ppm restart`            | Rebuilds and restarts, on the same port.                                               |
| `ppm status`             | Says whether it is running and on which port.                                          |
| `ppm open`               | Opens the app in your browser, starting it if needed.                                  |
| `ppm logs`               | Follows the server log (`~/.paper-podcast-maker/server.log`).                          |

Without linking, use `pnpm ppm <command>` (or `pnpm stop` / `pnpm status`) from the repo root.

### Open it on your phone or another computer (mDNS)

```sh
ppm start --mdns                      # or: pnpm start --mdns
```

This listens on your network as well as on `127.0.0.1`, and advertises the app over mDNS (Bonjour), so any device on the same Wi-Fi can open `http://paper-podcast.local:8787`. It also shows up as "Paper Podcast Maker" in Bonjour service browsers. Use `--mdns-name studio` to be `studio.local` instead. The env vars `PPM_MDNS=1` and `PPM_MDNS_NAME` do the same. `ppm restart` keeps the setting, and `ppm restart --no-mdns` turns it off.

The app has no login, so with mDNS on, **anyone on that network can use it** and run your AI CLI through it. Only turn it on for networks you trust. The first time, macOS may ask whether `node` can accept incoming connections: choose Allow.

Other devices resolve `.local` names out of the box on macOS, iOS, Windows 10/11 and most Linux desktops (via Avahi). Android support depends on the browser and version, so if the name doesn't resolve there, use the computer's IP address with the same port.

### How it works

1. The server extracts the paper's text (scanned PDFs without a text layer need OCR first).
2. It asks the CLI for a JSON script sized to your min/max length (about 150 spoken words per minute), and retries once if the length is off.
3. Each line is spoken with the host's voice, and the clips are joined into one WAV. Hosts left on "Auto voice" each get a different installed voice.

The CLI runs with no tools (Claude) or a read-only sandbox in an empty temp folder (Codex), and the server only listens on `127.0.0.1`.

## Repository layout

This is a [pnpm workspaces](https://pnpm.io/workspaces) monorepo.

| Package                 | Path              | What it is                                                                                                                  |
| ----------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `@paper-podcast/web`    | `apps/web`        | The UI: React + TypeScript + Tailwind CSS, built with Vite.                                                                 |
| `@paper-podcast/server` | `apps/server`     | The local backend (Fastify). Drives the Codex/Claude CLI and local TTS. Listens on `127.0.0.1` only (port 8787 by default). |
| `@paper-podcast/shared` | `packages/shared` | Types and Zod schemas (settings, transcript, API) used by both.                                                             |

In development the web app proxies `/api` to the local server, so the two run as one app.

## Development

Requirements: Node.js 22+ and pnpm (`corepack enable` gives you the pinned version).

```sh
pnpm install
pnpm dev          # web on http://localhost:5173, server on http://127.0.0.1:8787
```

`PPM_PORT=9000 pnpm dev` moves the dev server (and the web proxy) to another port.

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
