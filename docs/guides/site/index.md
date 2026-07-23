# HIROBA Documentation

Welcome to the HIROBA guides. HIROBA (広場 — "open square") is an AI-powered video conferencing platform built for studying hybrid human–AI social interaction. It combines real-time video, 3D AI avatars, speech synthesis, and a Wizard-of-Oz control surface inside one Zoom Video SDK–backed room.

These pages are aimed at three audiences. Pick the one that matches what you are trying to do.

## User Guide

For **participants** joining a HIROBA session.

- Joining a session from the lobby
- Using your mic, camera, and the in-call toolbar
- What the AI agents in the room do and how they decide to respond
- Leaving and rejoining

→ [Open the User Guide](/guides/user-guide)

## Researcher Guide

For **session hosts, study runners, and lab admins** — the people designing experiments, configuring agents, and running sessions.

- Deploying HIROBA (Sakura VPS or AWS EC2 with Caddy + Let's Encrypt)
- Configuring conditions, agents, prompts, and avatars from the admin panel
- Running a session as host: the Session Host Panel, agent behaviour controls, the Wizard-of-Oz tab, participant management
- Collecting conversation data and exporting logs

→ [Open the Researcher Guide](/guides/researcher-guide)

## Developer Guide

For people **extending or modifying HIROBA's code**. Architecture notes, code layout, the WebSocket sync protocol, the settings backend, and how to add new agent behaviours.

→ [Open the Developer Guide](/guides/developer-guide)

---

## Quick links

- [Project on GitHub](https://github.com/Hybrid-Social-Interaction-Lab/hiroba)
- [Hybrid Social Interaction Lab](https://www.hybrid-social-interaction-lab.com/) — University of Tsukuba

> [!NOTE]
> HIROBA requires a secure context (`https://` or `localhost`) for the camera and microphone to work — that is a browser-level requirement of `getUserMedia`, not something HIROBA imposes. In production deployments, Caddy provisions Let's Encrypt certificates automatically.
