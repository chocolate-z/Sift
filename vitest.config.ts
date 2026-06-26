import { defineConfig } from 'vitest/config'

// Root Vitest config for the Sift monorepo.
// Phase-1 technical verification only needs the two pure-TS algorithm packages,
// which run in a plain Node environment (no DOM, no network).
export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: ['default']
  }
})
