# AGENTS.md

## Project

Electron desktop app scaffolded with Electron Forge's `vite-typescript` template, integrated with:

- React 19 (`src/main.tsx` renderer entry)
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- shadcn/ui (config in `components.json`, components in `src/components/ui`)

## Commands

- `npm start` — run the app in development (Electron + Vite dev server)
- `npm run package` — build an unpackaged app (`out/`)
- `npm run make` — build distributables
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint over `.ts`/`.tsx`
- `npx shadcn@latest add <component>` — add a shadcn/ui component

## Layout

- `src/main.ts` — Electron main process
- `src/preload.ts` — preload script
- `src/main.tsx` — React renderer entry
- `src/index.css` — Tailwind CSS + shadcn theme tokens (Tailwind v4 `@theme inline`)
- `src/App.tsx` — root component
- `src/ipc.ts` — shared IPC channel names + payload types (`NaodaiApi`)
- `src/preload.ts` — exposes `window.api` via `contextBridge` (typed `NaodaiApi`)
- `src/env.d.ts` — declares `window.api` for the renderer
- `src/lib/utils.ts` — `cn()` helper
- `src/components/ui/` — shadcn/ui components
- `vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.mts` — Vite configs

## Gotchas

- `vite.renderer.config.mts` is ESM (`.mts`) because Forge bundles the config as CJS by default and `@tailwindcss/vite` is ESM-only. Keep the renderer config as `.mts`.
- Path alias `@/*` → `src/*` is configured in both `vite.renderer.config.mts` and `tsconfig.json`.
- The host system's npm version check in Electron Forge can fail (`Could not check npm version "undefined"`) because npm resolves to an nvm shim. `~/.skip-forge-system-check` bypasses this.