---
name: Repo environment quirks
description: Non-obvious environment gotchas for the Fincai repo (icon libs, dev-server restart behavior).
---

- **`react-icons` is not resolvable in this repo.** Despite the design guideline to use `react-icons/si` for company/brand logos, the package is not installed/resolvable here (`require('react-icons/si')` → "Cannot find module"). Use `lucide-react` icons instead (e.g. `Sparkles`, `Gem`, `KeyRound`).
  **Why:** importing from `react-icons/*` causes a build break.
  **How to apply:** any time you'd reach for a brand logo from `react-icons`, fall back to a `lucide-react` icon.

- **The dev server (`tsx server/index.ts`) does not watch files.** After editing server code/routes, explicitly restart the "Start application" workflow before smoke-testing. Otherwise newly added API routes can return the SPA `index.html` (stale server still running) instead of JSON, which looks like a routing/order bug but is just a stale process.
  **Why:** the automatic post-edit restart can fire mid-edit and miss the final change.
  **How to apply:** restart the workflow, then curl/e2e test the API routes.

- **Frontend unit/integration tests use Vitest + RTL (jsdom); pin `vitest@^3`.** `vitest@4` bundles rolldown-vite whose oxc transform conflicts with `@vitejs/plugin-react` (babel) and fails to parse JSX ("Unexpected JSX expression"). v3 (esbuild) works. Config lives in `vitest.config.ts` (root) + `client/src/test/setup.ts` (jest-dom + polyfills: matchMedia, ResizeObserver, scrollIntoView, pointer-capture — Radix/sidebar need them). Run via the `test` validation command (`npx vitest run`).
  **Why:** there is no test framework in `package.json` (forbidden to edit scripts), so tests are wired through the validation skill, not an npm script.
  **How to apply:** mock `@/contexts/AuthContext` (anonymous) and give react-query a controlled `queryFn` so tests are network-free; control wouter routes with `wouter/memory-location`. NOTE: `tsconfig` excludes only `**/*.test.ts`, NOT `.test.tsx`, so test files ARE type-checked by `tsc` — keep them type-clean (e.g. import `ReactNode`, don't use the `React.` namespace).
