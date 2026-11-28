// Live AI evaluation only (npm run eval:ai). Uses real Gemini, so it is kept out of `npm test`.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['eval/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
