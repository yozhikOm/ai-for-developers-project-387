import { defineConfig } from 'vitest/config'

// Конфиг тестов backend-пакета. Корневой vitest.config.ts подхватывает
// его через projects: ['apps/*'].
export default defineConfig({
  test: {
    name: 'api',
    // Backend тестируется в node-окружении, без jsdom
    environment: 'node',
  },
})
