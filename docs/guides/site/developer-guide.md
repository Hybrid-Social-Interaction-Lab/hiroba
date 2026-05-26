# Developer Guide

> [!NOTE]
> This guide is a work in progress. The sections below are stubs to be filled in as the codebase evolves. The [Researcher Guide](/guides/researcher-guide) is currently the most complete reference.

This guide is for people **extending or modifying HIROBA's code**.

<div class="contents-grid">
  <a href="#repository-layout"><span class="cg-num">1</span><i data-lucide="folder-tree" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Repository layout</div><div class="cg-desc">File structure and entry points</div></div></a>
  <a href="#tech-stack"><span class="cg-num">2</span><i data-lucide="layers" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Tech stack</div><div class="cg-desc">Node, Zoom SDK, and dependencies</div></div></a>
  <a href="#local-development"><span class="cg-num">3</span><i data-lucide="terminal" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Local development</div><div class="cg-desc">Running and hot-reloading locally</div></div></a>
  <a href="#how-a-session-works-end-to-end"><span class="cg-num">4</span><i data-lucide="workflow" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Session flow</div><div class="cg-desc">End-to-end request lifecycle</div></div></a>
  <a href="#client-modules"><span class="cg-num">5</span><i data-lucide="package" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Client modules</div><div class="cg-desc">Frontend JS module breakdown</div></div></a>
  <a href="#websocket-sync-protocol"><span class="cg-num">6</span><i data-lucide="radio" class="cg-icon"></i><div class="cg-body"><div class="cg-title">WebSocket protocol</div><div class="cg-desc">Real-time sync message format</div></div></a>
  <a href="#adding-a-new-agent-behaviour"><span class="cg-num">7</span><i data-lucide="bot" class="cg-icon"></i><div class="cg-body"><div class="cg-title">New agent behaviour</div><div class="cg-desc">Extending agent response logic</div></div></a>
  <a href="#adding-a-new-tts-backend"><span class="cg-num">8</span><i data-lucide="mic" class="cg-icon"></i><div class="cg-body"><div class="cg-title">New TTS backend</div><div class="cg-desc">Plugging in a voice provider</div></div></a>
  <a href="#editing-these-guides"><span class="cg-num">9</span><i data-lucide="book-open" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Editing guides</div><div class="cg-desc">How this docs site is built</div></div></a>
</div>

## Repository layout

```
hiroba/
├── index.js                         — Express entry point
├── lib/
│   ├── api-clients.js               — OpenAI / Polly / SpeechGen client init
│   ├── logger.js                    — File + stdout logging
│   ├── session-manager.js           — In-memory session/room registry
│   ├── settings-manager.js          — File or DynamoDB-backed settings
│   ├── speech-service.js            — TTS dispatch (Polly / SpeechGen / browser)
│   ├── websocket-manager.js         — Real-time sync of host settings + WoZ events
│   └── routes/
│       ├── api-routes.js            — JSON REST endpoints
│       └── page-routes.js           — HTML page delivery (lobby, admin, guides)
├── public/
│   ├── index.html                   — Lobby + call view (single page)
│   ├── admin.html                   — Admin dashboard
│   ├── guides/                      — Generated guide HTML (do not edit by hand)
│   ├── js/                          — Client-side modules
│   ├── models/                      — FBX avatar assets
│   └── avatar_backgrounds/          — Condition background images
├── docs/guides/site/                — Markdown sources for these guides
├── scripts/build-guides.js          — Markdown → HTML compiler
├── deploy/
│   ├── docker/                      — Compose files + Dockerfile + Caddyfile
│   └── scripts/                     — Provisioning scripts (Sakura + AWS)
└── data/settings.json               — Persisted settings (conditions, prompts, behaviour)
```

## Tech stack

- **Runtime:** Node.js 18 (Alpine in Docker).
- **HTTP:** Express 4.
- **Realtime:** `ws` (WebSocket server attached to the same HTTP/HTTPS listeners as Express).
- **Video/audio:** Zoom Video SDK on the client side (browser SDK loaded from `source.zoom.us`).
- **3D avatars:** Three.js + `@pixiv/three-vrm` + FBXLoader. Animations come from Mixamo (see `docs/guides/MIXAMO_GUIDE.md`).
- **LLM:** OpenAI SDK (`openai` v4).
- **TTS:** AWS Polly via `@aws-sdk/client-polly`; SpeechGen via REST; browser `SpeechSynthesis` as fallback.
- **Persistence:** filesystem by default; DynamoDB / S3 optional via env vars.

## Local development

```bash
npm install
cp .env.example .env       # fill in ZOOM_VSDK_KEY / ZOOM_VSDK_SECRET at minimum
npm start                  # = build:guides + node index.js
```

Or with the dev container:

```bash
docker compose -f deploy/docker/docker-compose.dev.yml up
```

The dev compose mounts the repo into the container, so edits to `public/`, `lib/`, and `docs/guides/site/` are reflected without a rebuild. For markdown changes, re-run `npm run build:guides` from the host to recompile.

## How a session works (end-to-end)

> Stub — to be filled in. High-level flow:
>
> 1. Host hits `/api/sessions/create` → SessionManager registers the session in-memory.
> 2. Client requests a Zoom Video SDK JWT from `/api/sdk/jwt` (signed with `ZOOM_VSDK_SECRET`).
> 3. Client joins the Zoom session with the JWT; per-user audio streams are subscribed to.
> 4. Browser transcribes its own mic via the Web Speech API and broadcasts text over the WebSocket.
> 5. WebSocketManager fans transcripts out to all clients + persists to the session log.
> 6. Agent behaviour timers (silence detection, periodic speech) live client-side on the host and trigger `/api/generate` for LLM replies.
> 7. Replies are spoken via the configured TTS backend; lip-sync drives the avatar mouth blendshapes.

## Client modules

> Stub.

- `public/js/lobby.js` — pre-join screen.
- `public/js/session.js` — Zoom SDK join + call lifecycle.
- `public/js/avatar.js` — FBX avatar system (loading, animation, lip-sync).
- `public/js/agent-behavior.js` — silence/periodic timers and trigger logic.
- `public/js/sync.js` — WebSocket client for cross-participant settings + WoZ events.
- `public/js/conversation.js` — transcript log + CSV export.
- `public/js/participants.js` — host-side participant management.

## WebSocket sync protocol

> Stub — to be filled in. Message types currently include `SILENCE_THRESHOLD_UPDATE`, `PERIODIC_INTERVAL_UPDATE`, settings broadcasts, and WoZ events.

## Adding a new agent behaviour

> Stub — to be filled in.

## Adding a new TTS backend

> Stub — to be filled in. See `lib/speech-service.js` for the existing dispatch.

## Editing these guides

The pages you're reading are compiled at server startup by `scripts/build-guides.js`. To edit:

1. Edit the markdown in `docs/guides/site/*.md`.
2. Run `npm run build:guides` (or restart the server, which runs it automatically).
3. Reload the page.

In Docker dev mode, the source tree is volume-mounted — so step 2 from the host machine is enough; no container rebuild needed.

To add a new guide page:

1. Add the markdown file to `docs/guides/site/`.
2. Register it in the `PAGES` array at the top of `scripts/build-guides.js`.
3. Add the slug to `GUIDE_SLUGS` in `lib/routes/page-routes.js`.
4. Optionally add a footer link in `public/index.html`.

The template supports GitHub-style callouts (`[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!DANGER]`) and `[Screenshot: ...]` placeholders that render as visible "Screenshot needed" boxes.
