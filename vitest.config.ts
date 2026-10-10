import { defineConfig } from 'vitest/config'

// Единая точка запуска тестов монорепозитория: `npm test` из корня.
// Каждый пакет описывает своё окружение в собственном конфиге
// (apps/api/vitest.config.ts, apps/web/vite.config.ts).
export default defineConfig({
  test: {
    projects: ['apps/*'],
  },
})
