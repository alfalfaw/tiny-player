# Tiny Player

> [中文版本](./README.zh.md)

A minimal local video player built with **Vue 3 + Vite**. All playback happens entirely in your browser — video files are never uploaded to any server.

## Features

- **Local Playback**: Drag & drop video files onto the player, or click to select files — play them directly in the browser.
- **Play Queue**: Drop multiple files to auto-play in sequence, with Previous / Next navigation.
- **Play History**: Automatically records played videos; revisit and resume from the "History" tab after a page refresh.
- **Progress Persistence**: Playback position, volume, and playback speed are auto-saved and restored via `localStorage`.
- **Player Controls**: Draggable progress bar, volume slider, speed selector (0.5x–2x), and fullscreen toggle.
- **Keyboard Shortcuts**: Control everything without touching the mouse.
- **Dark Theme**: Clean dark UI with a toggleable sidebar for a focused viewing experience.

## Tech Stack

- Vue 3 (Composition API + `<script setup>`)
- Pinia + `pinia-plugin-persistedstate` (state management & persistence)
- Vite 8
- vue-router (included, routes not yet configured)

## Quick Start

Requirements: **Node.js** `^20.19.0 || >=22.12.0`, package manager **pnpm**.

```sh
pnpm install        # Install dependencies
pnpm dev            # Start dev server (HMR)
pnpm build          # Build for production → dist/
pnpm preview        # Preview production build locally
```

> If you prefer npm / yarn, replace `pnpm` with `npm` or `yarn` accordingly.

## Usage

1. Open the app, drag a video file onto the central player area, or click the area to pick a file.
2. Drag files to the right sidebar to add them to the play queue. The sidebar has **Queue** and **History** tabs.
3. Playback progress, volume, speed, and history are automatically saved to `localStorage` — they persist across page refreshes and browser restarts.
   > Note: Only playback records and progress are persisted. The actual video files are not saved; files in history must be re-dragged to play again.

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Space` / `k` | Play / Pause |
| `←` / `→` | Rewind / Fast-forward 5s |
| `↑` / `↓` | Volume + / - |
| `f` | Toggle fullscreen |
| `m` | Mute / Unmute |

## Project Structure

```
tiny-player/
├── index.html             # Entry HTML
├── vite.config.js         # Vite config (@ alias → src/)
├── public/               # Static assets (favicon, etc.)
└── src/
    ├── main.js           # App entry, mounts Pinia & persistence
    ├── App.vue           # Root component, layout & drag/playback logic
    ├── components/
    │   ├── VideoPlayer.vue   # Video player with custom controls
    │   └── PlayHistory.vue   # Play queue & history sidebar
    ├── stores/
    │   └── player.js         # Pinia player store (with persistence)
    └── router/
        └── index.js         # vue-router instance
```

## Configuration

The build base path is set in `vite.config.js` via the `base` option. In production it defaults to `/tiny-player/`.

See the [Vite Configuration Reference](https://vite.dev/config/) for more options.

## Recommended Development Setup

- [VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) extension (disable Vetur if installed).
- Install [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd) in your browser for a better debugging experience.
