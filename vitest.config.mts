import { defineConfig } from 'vitest/config'

/* Tests run in edge-runtime because convex-test mimics the Convex
   runtime, which is V8-isolate-shaped, not Node-shaped. */
export default defineConfig({
  test: {
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
    include: [
      'services/convex/**/*.test.ts',
      'frontend/src/**/*.test.js',
      'common/**/*.test.js',
      /* build-config guards live at the root beside the config they cover */
      '*.test.mjs',
    ],
  },
})
