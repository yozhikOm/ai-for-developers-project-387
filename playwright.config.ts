import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// E2E-тесты в настоящем браузере на собранном приложении: `npm run e2e`.
// Сервер поднимается как в `npm start` — один процесс отдаёт API и статику frontend.

const PORT = 3200
// Пояс Owner задаём явно, чтобы на него не влиял локальный .env
const OWNER_TIMEZONE = 'Europe/Moscow'
// Пояс браузера намеренно не совпадает с поясом Owner и лежит западнее UTC:
// время на экранах должно считаться в поясе Owner, а не браузера
const BROWSER_TIMEZONE = 'America/Los_Angeles'

if (!existsSync(path.join(import.meta.dirname, 'apps/web/dist/index.html'))) {
  throw new Error('apps/web/dist не найден. Сначала соберите frontend: npm run build')
}

// Свежая БД на каждый запуск, data/ не трогаем. Конфиг читает и основной процесс,
// и воркеры (у них Playwright задаёт TEST_WORKER_INDEX): каталог создаёт основной,
// воркеры наследуют его путь через окружение. Убираем каталог при выходе
// основного процесса, когда сервер уже остановлен
if (process.env.TEST_WORKER_INDEX === undefined) {
  const freshDir = mkdtempSync(path.join(tmpdir(), 'call-calendar-e2e-'))
  process.env.E2E_DATABASE_DIR = freshDir
  process.on('exit', () => {
    try {
      rmSync(freshDir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 })
    } catch {
      // Не удалившийся временный каталог результат прогона не меняет
    }
  })
}
const databaseDir = process.env.E2E_DATABASE_DIR ?? ''

export default defineConfig({
  testDir: './e2e',
  // Один сквозной сценарий на общей БД: тесты не должны гоняться параллельно
  workers: 1,
  forbidOnly: !!process.env.CI,
  // HTML-отчёт (playwright-report/) CI сохраняет артефактом при падении
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'ru-RU',
    timezoneId: BROWSER_TIMEZONE,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // node напрямую, без npm-обёртки: Playwright останавливает именно процесс сервера
    command: 'node apps/api/src/index.ts',
    url: `http://127.0.0.1:${PORT}/api/health`,
    // Чужой уже запущенный сервер не подходит: нужна свежая БД
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_PATH: path.join(databaseDir, 'calendar.db'),
      OWNER_TIMEZONE,
    },
  },
})
