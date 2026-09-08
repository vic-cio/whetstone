import { defineConfig } from 'vitest/config'

export default defineConfig({
  /*
   * `src/main/` imports `electron` at module scope, so a rule that lives there could not be
   * loaded by a test at all. `tests/electron.ts` is an inert stand-in, which is enough:
   * everything a test needs to steer is already an environment variable the app honours.
   */
  resolve: { alias: { electron: new URL('./tests/electron.ts', import.meta.url).pathname } },
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
