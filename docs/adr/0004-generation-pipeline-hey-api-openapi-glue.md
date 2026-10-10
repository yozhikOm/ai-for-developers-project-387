# Генерация из TypeSpec: Hey API для типов и SDK, fastify-openapi-glue для маршрутов

Контракт (ADR 0003) лежит в каталоге `contract/` в корне, не в workspace-пакете:
Node не стрипает `.ts` внутри `node_modules`, а симлинк workspace-пакета ломается
в Docker. `npm run generate` = `tsp compile contract && openapi-ts`: TypeSpec
выдаёт OpenAPI 3.0.0 (совместим с Ajv draft-07 в Fastify без `Ajv2020`),
`@hey-api/openapi-ts` одним конфигом генерирует fetch-SDK в
`apps/web/src/api/generated/` и типы обработчиков Fastify (`RouteHandlers`,
beta-плагин `fastify`) в `apps/api/src/generated/` вместе с копией спеки
(`output.source`). Маршруты и проверку запросов в рантайме регистрирует
`fastify-openapi-glue` по этой копии, поэтому `apps/api` и Docker-образ не
зависят от файлов вне `apps/api`. Исследование и сквозной прогон —
[`docs/research/openapi-generators.md`](../research/openapi-generators.md).

## Considered Options

- **JS-эмиттеры TypeSpec** (`http-server-js`, `http-client-js`): серверный
  «highly experimental» и не знает Fastify, оба работают в обход OpenAPI.
- **`openapi-typescript` + `openapi-fetch`**: только типы, обработчики Fastify
  пришлось бы типизировать вручную. Остаётся запасным вариантом, если сломается
  beta-плагин `fastify` Hey API.
- **Orval**: генераторов для Fastify нет, зависимостей больше.
- **Не коммитить сгенерированное**: генерацию пришлось бы встраивать перед
  каждым `typecheck`/`test`/`build`/`dev`, в CI и в Dockerfile.

## Consequences

- У каждой операции явный `@operationId` в camelCase вида `<глагол><Сущность>`
  (`listEventTypes`, `createBooking`): glue ищет обработчик по `operationId`
  как есть, а Hey API переводит его в camelCase, и только так имена совпадают
  без кода-переводчика.
- Сервис объявлен с `@route("/api")`: пути в OpenAPI равны реальным URL, префикс
  не настраивается ни в glue, ни в SDK. `/api/health` тоже описан в контракте
  (`getHealth`).
- Все 4xx/5xx отвечают одной моделью `ApiError { code, message }`: Fastify
  сериализует ответ по схеме из контракта. Ошибки валидации и неизвестные
  маршруты `/api` приводятся к ней через `setErrorHandler`. Клиент различает
  причины по `code`.
- Сгенерированное коммитится; CI проверяет дрейф
  `npm run generate && git diff --exit-code`. `npm run check` генерацию не
  запускает.
- `@hey-api/openapi-ts` закреплён точной версией (0.x, `0.99.0`).
- При внедрении: `module.extension: '.ts'` в конфиге Hey API, `DOM.Iterable` в
  `lib` у `apps/web`, `**/generated` в игнор ESLint.
