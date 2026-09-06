import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    /*
     * A live spawn is a `.live.ts` and is not in the suite. It costs money and needs the
     * harness installed and logged in, so it is run by hand when the flags change, and what
     * it produces is a recording the ordinary tests then run against.
     */
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/**/*.live.ts'],
  },
})
