# 😴 NapForge — Power Nap Alarm with Wake-Up Challenges

A zero-dependency web app for taking the perfect power nap. The catch: when the
alarm rings, **you must beat a mini-game to silence it** — so you actually wake
up instead of fumbling for snooze with your eyes closed.

## Quick start

No build step, no dependencies. Either open the file directly:

```
open power-nap-app/index.html
```

or serve it (recommended, from the repo root):

```
python3 -m http.server 8000
# then visit http://localhost:8000/power-nap-app/
```

Use the **Test alarm** button during a nap to try the challenges immediately
without waiting for the timer.

## Nap presets

| Preset | Length | Why |
|---|---|---|
| ⚡ Micro Nap | 10 min | Quick alertness boost with zero sleep inertia |
| 🔋 Power Nap | 20 min | The classic — energy without grogginess |
| 🚀 NASA Nap | 26 min | Duration from NASA's fatigue studies on pilots |
| 🌙 Full Cycle | 90 min | One complete sleep cycle, wake between cycles |
| Custom | 1–180 min | Whatever you need |

## Wake-up challenges

Pick one, or choose **🎲 Surprise me** for a random game each alarm:

- **🧮 Math Quiz** — solve a series of arithmetic problems; wrong answers don't count
- **🧠 Memory Sequence** — Simon-style: watch the pads light up, repeat the growing pattern
- **⌨️ Typing Test** — type a phrase exactly (paste is blocked, capitalization counts)
- **🎯 Bubble Pop** — pop fast-disappearing bubbles; on higher difficulties gray decoys subtract progress

Three difficulty levels scale problem complexity, sequence length, phrase
length, and bubble speed.

## Advanced features

- **Escalating alarm** — synthesized siren ramps from quiet to full volume over ~30 s
- **Snooze with consequences** — limited snoozes (configurable, default 2), and each snooze raises the challenge difficulty by one level
- **Ambient sleep sounds** — white noise, brown noise, or rain, synthesized live with the Web Audio API (no audio files, works offline)
- **Vibration** — pulses during the alarm on supported mobile devices
- **Screen wake lock** — keeps the screen on during the nap so the alarm can't be killed by the lock screen (browsers that support the Wake Lock API)
- **Nap statistics** — naps completed, total minutes, average time-to-dismiss, snooze count, and a 🔥 day streak, persisted in `localStorage`
- **Nap history** — your last naps with duration, challenge beaten, and snoozes used
- **Extend (+5 min)** mid-nap, cancel anytime
- **Dark / light theme**, fully responsive layout for phones
- **Leave-guard** — warns before closing the tab mid-nap (a closed tab can't ring)

## Project layout

```
power-nap-app/
├── index.html        # all screens & modals
├── css/style.css     # theming (dark/light), animations, responsive layout
└── js/
    ├── audio.js      # Web Audio synthesis: alarm siren, ambient loops, UI blips
    ├── challenges.js # the four wake-up mini-games
    ├── stats.js      # localStorage persistence & aggregates
    └── app.js        # timer, screens, snooze logic, settings, wiring
```

## Notes & limitations

- Keep the tab open during the nap — browsers can't fire reliable audio from a closed tab.
- The first user interaction (starting the nap) unlocks the AudioContext, satisfying browser autoplay policies.
- Vibration and Wake Lock degrade gracefully where unsupported.
