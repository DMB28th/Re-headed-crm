import { defineConfig } from "vitest/config";

/**
 * `postgres-store.test.ts` boots a real Postgres in WASM (PGlite) in a fresh
 * `beforeEach`, so every test here pays a database start-up, and the FIRST one
 * additionally pays the one-off WASM module compile plus the whole SCHEMA —
 * which grew with the staging-model migration (docs/studio-staging-model.md).
 *
 * Locally that first test lands around 450ms, but on a cold CI runner it has
 * exceeded vitest's 5s default and failed the build on a docs-only PR. The work
 * is legitimate, not a hang, so the timeout is the thing that was wrong.
 * Raised well clear of the boundary rather than nudged just past it: a flaky
 * threshold that fails one run in ten teaches people to re-run CI instead of
 * reading it.
 */
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
