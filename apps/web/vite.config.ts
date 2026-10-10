import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      // В dev-режиме API-запросы уходят на backend (apps/api, порт 3000)
      '/api': 'http://localhost:3000',
    },
  },
  test: {
    name: 'web',
    // Секция для Vitest: React-компоненты тестируем в jsdom
    environment: 'jsdom',
    // Пояс «браузера» в тестах намеренно не совпадает с поясом Owner (Москва) и лежит
    // западнее UTC: время и даты на экране должны считаться в поясе Owner
    env: { TZ: 'Pacific/Honolulu' },
    setupFiles: ['./src/setupTests.ts'],
  },
})
