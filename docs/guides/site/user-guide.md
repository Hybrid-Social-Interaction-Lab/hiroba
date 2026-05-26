# User Guide

<div class="guide-meta">For <strong>participants</strong> joining a session. Running an experiment? See the <a href="/guides/researcher-guide">Researcher Guide</a>.</div>

<div class="contents-grid">
  <a href="#what-hiroba-is"><span class="cg-num">1</span><i data-lucide="info" class="cg-icon"></i><div class="cg-body"><div class="cg-title">What HIROBA is</div><div class="cg-desc">Overview and what you'll need</div></div></a>
  <a href="#joining-a-session"><span class="cg-num">2</span><i data-lucide="log-in" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Joining a session</div><div class="cg-desc">Lobby, password, and camera setup</div></div></a>
  <a href="#the-call-screen"><span class="cg-num">3</span><i data-lucide="monitor" class="cg-icon"></i><div class="cg-body"><div class="cg-title">The call screen</div><div class="cg-desc">Video grid, controls, and agents</div></div></a>
  <a href="#how-the-ai-agents-work"><span class="cg-num">4</span><i data-lucide="bot" class="cg-icon"></i><div class="cg-body"><div class="cg-title">How AI agents work</div><div class="cg-desc">Transcription, replies, and voices</div></div></a>
  <a href="#practical-tips"><span class="cg-num">5</span><i data-lucide="lightbulb" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Practical tips</div><div class="cg-desc">Getting the best experience</div></div></a>
  <a href="#troubleshooting"><span class="cg-num">6</span><i data-lucide="triangle-alert" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Troubleshooting</div><div class="cg-desc">Common issues and fixes</div></div></a>
  <a href="#leaving"><span class="cg-num">7</span><i data-lucide="log-out" class="cg-icon"></i><div class="cg-body"><div class="cg-title">Leaving</div><div class="cg-desc">How to end your session</div></div></a>
</div>

## What HIROBA is

HIROBA is a video conferencing room with one or more **AI agents** in it. The agents appear as 3D animated characters next to the human participants' video tiles, listen to the conversation through real-time transcription, and reply with synthesized speech. A session is created by a host (the researcher running the study), and you join by selecting that session from the lobby and entering a password if one was set.

You will need:

- A modern browser (Chrome, Edge, or Safari — recent versions)
- A working microphone and webcam
- Permission to grant camera + mic access to the site

> [!NOTE]
> HIROBA only works on `https://` URLs (or `http://localhost` in dev). If the browser does not show a camera/mic permission prompt, the page is probably being served over plain `http://` from a non-localhost address — let the host know.

## Joining a session

<div class="section-steps">
  <div class="ss-step"><span class="ss-num">1</span><span class="ss-label">Open the URL your host shared</span></div>
  <div class="ss-sep"><i data-lucide="arrow-right"></i></div>
  <div class="ss-step"><span class="ss-num">2</span><span class="ss-label">Pick the session from the dropdown</span></div>
  <div class="ss-sep"><i data-lucide="arrow-right"></i></div>
  <div class="ss-step"><span class="ss-num">3</span><span class="ss-label">Enter password if required</span></div>
  <div class="ss-sep"><i data-lucide="arrow-right"></i></div>
  <div class="ss-step"><span class="ss-num">4</span><span class="ss-label">Allow camera & mic, click Join</span></div>
</div>

When you open the HIROBA URL the host shared with you, you arrive at the **lobby**.

[Screenshot: the lobby landing page, showing the two side-by-side panels titled "Create Session" and "Join Session", with the HIROBA logo at the top and the footer links along the bottom.]

The lobby has two panels. As a participant, you almost always want the **Join Session** panel on the right.

### Join Session panel

1. **Select Session** — open the dropdown and pick the session name your host gave you. The list only shows sessions that have already been created by a host. If you don't see the session, the host hasn't started it yet, or new joins are temporarily disabled.
2. **Password** — if the session is locked, type the password here. If it is an open session, the field will say "This session is open — no password required" and you can leave it blank.
3. **Display Name** *(optional)* — this is the name shown above your video tile to everyone else in the room. If you leave it blank, you'll appear as a generic participant name.
4. Click **Join Session**.

The first time you join, the browser will prompt for camera and microphone permissions. **You must accept both** for the session to work properly.

[Screenshot: the browser's permission prompt showing the Allow / Block buttons for camera and microphone.]

### What if my host gave me an invite link?

If the host sent you a URL with a session and password already embedded (something like `https://hiroba.example.com/?session=...&password=...`), opening that link drops you straight into the call after you type a display name and accept camera/mic. No need to use the dropdown.

## The call screen

Once you've joined, the lobby disappears and you see the call view.

[Screenshot: the in-call view showing two or more video tiles arranged in a grid — at least one AI agent tile (a 3D character against a soft background) and your own video tile in the corner with a blue border. The bottom toolbar is visible.]

The layout has three regions:

- **Video grid** (centre/top): every participant — human and AI — gets a tile. AI tiles render a 3D avatar against a chosen background; human tiles show webcam video. Your own video has a blue outline.
- **Call toolbar** (bottom): mic, camera, settings, and leave controls.
- **Session host panel** (left, sliding panel): only the host sees this — as a participant you can usually ignore it. You may see a "view-only" version if your host has opened it for you.

### The toolbar

<div class="icon-grid">
  <div class="ig-item"><div class="ig-icon"><i data-lucide="settings"></i></div><div class="ig-label">Settings</div><div class="ig-desc">Open / close side panel</div></div>
  <div class="ig-item"><div class="ig-icon"><i data-lucide="mic"></i></div><div class="ig-label">Mute <kbd>M</kbd></div><div class="ig-desc">Toggle microphone</div></div>
  <div class="ig-item"><div class="ig-icon"><i data-lucide="video"></i></div><div class="ig-label">Video <kbd>V</kbd></div><div class="ig-desc">Toggle webcam</div></div>
  <div class="ig-item ig-item--danger"><div class="ig-icon"><i data-lucide="phone-off"></i></div><div class="ig-label">Leave</div><div class="ig-desc">Return to lobby</div></div>
</div>

The session name appears in the middle of the toolbar so you can confirm which session you're in.

### Who is speaking

When someone — human or AI — is talking, their tile gets a bright green pulsing outline. This includes the AI agents, so you can see which agent is responding when there are several.

### Subtitles

If subtitles are enabled by the host, a translucent black bar appears near the bottom of the video area, showing the current speaker's name and what was just said.

[Screenshot: the live subtitle bar, with a small grey label above ("Alex") and the transcribed line below.]

## How the AI agents work

The AI agents are not on a fixed script — they listen to the live transcript and reply when a reply seems wanted. There are three triggers:

<div class="trigger-grid">
  <div class="tg-item"><div class="tg-head"><i data-lucide="at-sign"></i> Direct address</div><div class="tg-body">Say an agent's name (e.g. <em>"Alex, what do you think?"</em>) and it replies immediately.</div></div>
  <div class="tg-item"><div class="tg-head"><i data-lucide="timer"></i> Silence detection</div><div class="tg-body">If nobody speaks for a configured interval (often 5–30 s), an agent jumps in to keep the conversation going.</div></div>
  <div class="tg-item"><div class="tg-head"><i data-lucide="clock"></i> Periodic prompts</div><div class="tg-body">On a longer timer (often 1–10 min), an agent volunteers a thought to introduce a new topic.</div></div>
</div>

The host can tune these timers in real time during the session, and may also speak *as* an agent through a Wizard-of-Oz interface — meaning some agent responses are written or chosen by a human in the background, not the language model. From your perspective it looks the same either way.

> [!TIP]
> If you'd like an agent to respond to something specific, just say its name. The agent names are usually visible as labels at the bottom of each AI tile.

## Practical tips

<div class="tips-grid">
  <div class="tip-item"><div class="tip-icon"><i data-lucide="headphones"></i></div><div class="tip-body"><strong>Use headphones</strong> — agent voices bleeding into your mic cause echo loops where the agent "talks to itself".</div></div>
  <div class="tip-item"><div class="tip-icon"><i data-lucide="message-square"></i></div><div class="tip-body"><strong>Speak in complete sentences</strong> — short fragments reduce transcription accuracy and the agent may miss your meaning.</div></div>
  <div class="tip-item"><div class="tip-icon"><i data-lucide="pause-circle"></i></div><div class="tip-body"><strong>Pause after finishing a thought</strong> — silence detection only fires during true silence; if everyone keeps talking the agent won't interject.</div></div>
  <div class="tip-item"><div class="tip-icon"><i data-lucide="flask-conical"></i></div><div class="tip-body"><strong>The condition name is for the host</strong> — it controls which agents are present. You don't need to know the details.</div></div>
</div>

## Troubleshooting

**The Join button does nothing / I see "Cannot join — joining is disabled".**
The host has paused new joins (a control on the host's panel). Ask them to re-enable it.

**No audio / my mic doesn't seem to work.**
Check the mic button on the toolbar — make sure it's not muted (no slash through the icon). Then check your OS-level mic settings. The browser's site-settings panel (usually a little camera/mic icon in the address bar) lets you re-grant permission if you blocked it the first time.

**The 3D agents look black or aren't loading.**
Refresh the page. The 3D models load over the network on first join and occasionally a request fails; a reload fixes it.

**I got disconnected.**
Just rejoin from the lobby. Your conversation history doesn't follow you — the session log is owned by the host — but you can re-enter the same session.

**I see "view-only" badges next to controls on the host panel.**
That's expected — you are not the host. The settings are visible so you understand what's running, but you can't change them.

## Leaving

Click the red **Leave** button on the toolbar. You'll be returned to the lobby and your tile will disappear from everyone else's view. The session itself stays open for the remaining participants until the host ends it.
