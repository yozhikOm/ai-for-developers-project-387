# Календарь звонков (продолжение)


[![hexlet-check](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/yozhikOm/ai-for-developers-project-387/actions)

Интегрируйте работу агентов в GitHub проект

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Демо

Приложение задеплоено на Render: https://ai-for-developers-project-387-by33.onrender.com/

Это деплой проекта 386, из которого перенесён код этого репозитория.

Бесплатный тариф Render: после ~15 минут без запросов сервис засыпает, и первый
запрос после этого идёт около минуты. Диск эфемерный: при рестарте и редеплое
SQLite-база сбрасывается и заново засевается стартовыми типами событий.

## Стек

- Node.js 24, TypeScript, npm workspaces
- Backend: Fastify 5 (нативный запуск TypeScript без компиляции)
- Frontend: React 19, Vite
- Тесты: Vitest (+ React Testing Library), smoke test, e2e на Playwright (Chromium)
- Линт: ESLint 10 (flat config)
- CI: GitHub Actions; Docker (multi-stage)

## Установка

Требования: Node.js 24+ (см. `.nvmrc`), npm 11.

```bash
git clone https://github.com/yozhikOm/ai-for-developers-project-387.git
cd ai-for-developers-project-387
npm install
```

Переменные окружения — по необходимости: скопируйте `.env.example` в `.env`
(порт, имя и часовой пояс владельца календаря, путь к файлу SQLite; у всех есть
значения по умолчанию). Новая БД создаётся при первом запуске с двумя типами
событий для примера.

## Использование

```bash
# Dev-режим (два терминала)
npm run dev:api        # backend: http://localhost:3000
npm run dev:web        # frontend: http://localhost:5173 (прокси /api → 3000)

# Prod-режим (один процесс, порт 3000)
npm run build
npm start

# Контракт API (contract/) → OpenAPI, SDK для frontend, артефакты для backend
npm run generate

# Проверки
npm run check          # lint + typecheck + тесты
npm run smoke          # smoke test запущенного приложения (после npm run build)
npm run e2e            # сквозной сценарий в браузере (после npm run build;
                       # один раз: npx playwright install chromium)

# Docker
npm run docker:build   # сборка образа call-calendar
npm run docker:run     # запуск на http://localhost:3000, данные — в volume call-calendar-data

# Другой порт внутри контейнера задаётся переменной PORT
docker run --rm -e PORT=8080 -p 8080:8080 call-calendar
```

## Воркфлоу GitHub Actions

Агентные воркфлоу запускают [opencode](https://github.com/anomalyco/opencode)
(`anomalyco/opencode/github`), ключ провайдера — секрет `OPENCODE_API_KEY`.
Еженедельные аудиты можно запустить и вручную (`workflow_dispatch`).

| Воркфлоу | Событие | Модель | Назначение | Где смотреть |
| --- | --- | --- | --- | --- |
| [CI](.github/workflows/ci.yml) | `push`, `pull_request` | — | Дрейф генерации, lint, typecheck, тесты, build, smoke, e2e; сборка и smoke Docker-образа | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/ci.yml), чеки коммита и PR |
| [Release Please](.github/workflows/release-please.yml) | `push` в `main` | — | Release-PR (версия + `CHANGELOG.md`); при его мерже — тег и GitHub Release | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/release-please.yml), PR от release-please, Releases |
| [hexlet-check](.github/workflows/hexlet-check.yml) | `push` в любую ветку или тег | — | Автотесты Хекслета (файл не изменять) | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/hexlet-check.yml), бейдж в начале README |
| [opencode](.github/workflows/opencode.yml) | Комментарий в issue или PR с `/oc` / `/opencode` | `opencode/kimi-k3` | Агент выполняет запрос из комментария (коммиты — по Conventional Commits) | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/opencode.yml), ответ в треде issue/PR |
| [OpenCode PR Review](.github/workflows/opencode-review.yml) | `pull_request`: opened, synchronize, reopened, ready_for_review (кроме PR от ботов) | `opencode/kimi-k3` | Ревью PR: баги, рискованные изменения, читаемость | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/opencode-review.yml), комментарии в PR |
| [Issue Triage](.github/workflows/opencode-triage.yml) | `issues`: opened (аккаунту автора ≥ 30 дней) | `opencode/big-pickle` | Комментарий со ссылками на документацию и подсказками, если решение очевидно | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/opencode-triage.yml), комментарий в issue |
| [Weekly Code Audit](.github/workflows/opencode-code-audit.yml) | cron: пн 09:00 UTC | `opencode/big-pickle` | Сбор TODO / FIXME / HACK, сводка по приоритетам в одной issue | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/opencode-code-audit.yml), Issues |
| [Weekly Lighthouse Audit](.github/workflows/opencode-lighthouse.yml) | cron: вт 09:00 UTC | `opencode/kimi-k3` | Lighthouse по `LIGHTHOUSE_URL`, сравнение LCP / CLS / INP с `docs/performance-baseline.md`, issue при деградации | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/opencode-lighthouse.yml), Issues |
| [Weekly Documentation Audit](.github/workflows/opencode-documentation-audit.yml) | cron: чт 09:00 UTC | `opencode/big-pickle` | Сверка README и `docs/` с кодом: PR с правками и issue с тем, что требует человека | [Actions](https://github.com/yozhikOm/ai-for-developers-project-387/actions/workflows/opencode-documentation-audit.yml), PR и Issues |

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.
