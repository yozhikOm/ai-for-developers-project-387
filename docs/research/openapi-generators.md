# Генераторы OpenAPI, клиентского SDK и серверных артефактов

Исследование к issue [#14](https://github.com/yozhikOm/ai-for-developers-project-386/issues/14)
(карта [#6](https://github.com/yozhikOm/ai-for-developers-project-386/issues/6)).
Дата: 2026-10-02. Версии взяты из npm registry (`npm view <pkg> version time`),
поведение проверено по документации и исходникам, ключевые утверждения проверены
сквозным прогоном в одноразовом проекте (см. раздел «Проверка»).

## Рекомендация

| Слой | Инструмент | Что получаем |
| --- | --- | --- |
| Контракт → OpenAPI | `@typespec/compiler` + `@typespec/http` + `@typespec/openapi` + `@typespec/openapi3` 1.16.0 | `contract/generated/openapi.yaml` (OpenAPI 3.0.0) |
| OpenAPI → SDK для `apps/web` | `@hey-api/openapi-ts` 0.99.0, плагины `@hey-api/client-fetch` + `@hey-api/typescript` + `@hey-api/sdk` | типы + функции-запросы на `fetch`, рантайм клиента вшит в сгенерированный код, без зависимостей |
| OpenAPI → артефакты для `apps/api` | тот же `@hey-api/openapi-ts`, плагины `@hey-api/typescript` + `fastify` | `RouteHandlers` — типы обработчиков (`Params`/`Body`/`Querystring`/`Reply`) |
| Маршруты + проверка запросов | `fastify-openapi-glue` 4.11.5 (рантайм-зависимость `apps/api`) | при старте читает `openapi.yaml`, регистрирует маршруты и JSON Schema для Ajv Fastify |

Раскладка: `.tsp` — в каталоге `contract/` в корне (не workspace-пакет);
сгенерированный TS-код — внутри потребителей (`apps/web/src/api/generated/`,
`apps/api/src/generated/`), импорт относительными путями с `.ts`.

Одна команда в корневом `package.json`:

```json
"generate": "tsp compile contract && openapi-ts"
```

`openapi-ts` читает `openapi-ts.config.ts` в корне с двумя job'ами (клиент и
сервер). Для Node 24 обязателен `output.module.extension: '.ts'` (см. ниже).

Почему так:

- **Один генератор на обе стороны.** Hey API даёт и SDK, и типы обработчиков
  Fastify из одной спеки одним конфигом — меньше зависимостей и меньше расхождений.
- **Совместимо с type stripping без доработок.** `enum` по умолчанию не
  генерируется, типы импортируются через `import type`, расширение импортов
  настраивается на `.ts`. Проверено: `tsc` с `erasableSyntaxOnly` +
  `verbatimModuleSyntax` проходит, `node server.ts` запускается.
- **Маршруты и валидация из той же спеки.** `fastify-openapi-glue` — плагин для
  подхода design first, совместим с Fastify 5, не требует генерировать
  JSON Schema в TS.
- **Собственные JS-эмиттеры TypeSpec не годятся.** Серверный эмиттер помечен как
  «highly experimental», нацелен на `node:http`/Express, а не на Fastify. Оба
  эмиттера к тому же работают в обход OpenAPI, а задание требует генерировать
  SDK и артефакты из спецификации.

## 1. TypeSpec → OpenAPI 3

- Актуальные версии: `@typespec/compiler`, `@typespec/http`, `@typespec/openapi`,
  `@typespec/openapi3` — 1.16.0, все выпущены 2026-09-09 (npm registry).
  Лицензия MIT, репозиторий `microsoft/typespec`, `engines.node >=22.0.0`.
- `@typespec/openapi3` требует peer `@typespec/http` и `@typespec/openapi`;
  `sse`, `events`, `streams`, `versioning`, `json-schema`, `xml` объявлены
  опциональными (`peerDependenciesMeta`). Минимальный набор — четыре пакета выше.
- CLI — бинарь `tsp` из `@typespec/compiler`. Команда: `tsp compile <каталог>`,
  эмиттер задаётся флагом `--emit=@typespec/openapi3` или в `tspconfig.yaml`
  ([emitter usage](https://typespec.io/docs/emitters/openapi3/reference/emitter/)).
- Важные опции эмиттера (тот же источник):
  - `emitter-output-dir` (по умолчанию `{output-dir}/@typespec/openapi3`),
    `output-file` (по умолчанию `openapi.yaml` для одного сервиса без версий),
    `file-type` (`yaml` по умолчанию);
  - `openapi-versions`: `"3.0.0" | "3.1.0" | "3.2.0"`, **по умолчанию `["3.0.0"]`**;
  - `operation-id-strategy`: по умолчанию `parent-container`.
- Как формируется `operationId` ([`resolveOperationId`](https://github.com/microsoft/typespec/blob/main/packages/openapi/src/helpers.ts)):
  явный `@operationId` → `Interface_op` для операций в `interface` →
  имя операции для операций прямо в namespace сервиса → иначе `Namespace_op`.
  Это важно для связки с glue (см. п. 3, «Ловушка с operationId»).

Пример `contract/tspconfig.yaml` (проверен):

```yaml
emit:
  - "@typespec/openapi3"
options:
  "@typespec/openapi3":
    emitter-output-dir: "{project-root}/generated"
    output-file: "openapi.yaml"
```

### Собственные JS-эмиттеры TypeSpec

- `@typespec/http-server-js` 0.58.0-alpha.29 (2026-09-09). README: «This package
  is highly experimental and may be subject to breaking changes and bugs». Генерирует
  роутер для `node:http`, опция `express` добавляет Express-middleware; про Fastify
  ничего нет. Даты по умолчанию — `temporal-polyfill`
  ([README](https://github.com/microsoft/typespec/blob/main/packages/http-server-js/README.md)).
- `@typespec/http-client-js` 0.16.2 (2026-09-09). Генерирует отдельный пакет с
  `package.json` (опция `package-name`). Документация: «all client emitters are
  currently in **preview**»
  ([clients introduction](https://typespec.io/docs/emitters/clients/introduction/)).
- Вывод: для учебного проекта на Fastify — нет. Оба эмиттера минуют OpenAPI,
  серверный не знает Fastify.

## 2. Клиентский SDK

### `@hey-api/openapi-ts` (рекомендуется)

- 0.99.0 (2026-06-22), MIT, `hey-api/hey-api`, ~5.5k звёзд, пуши ежедневно.
  Пакет в стадии initial development (0.x): «Please pin an exact version»
  ([get-started](https://heyapi.dev/docs/openapi/typescript/get-started)). Минорные релизы
  выходят раз в 1–3 недели, к каждому breaking-релизу есть migration notes.
  `engines.node >=22.18.0`, peer `typescript >=5.5.3`.
- **enum:** плагин `@hey-api/typescript` по умолчанию `enums: false` —
  только union-типы; `'javascript'` даёт объект, `'typescript'` — TS `enum`
  ([плагин TypeScript](https://heyapi.dev/docs/openapi/typescript/plugins/typescript)).
  Проверено: `enum SlotStatus` из TypeSpec превратился в
  `export type SlotStatus = 'free' | 'busy'`.
- **Рантайм:** fetch-клиент используется по умолчанию. С v0.73.0 он вшит в
  `@hey-api/openapi-ts` (`npm view @hey-api/client-fetch deprecated` →
  «bundled directly inside @hey-api/openapi-ts»), поэтому в `apps/web` нет
  рантайм-зависимостей: код клиента генерируется в `client/` и `core/`.
- **Расширения импортов:** опция `output.module.extension` (`'.js' | '.ts'`).
  Если она не задана и в найденном tsconfig `module`/`moduleResolution` =
  `nodenext`/`node16`, генератор подставляет `.js`
  ([исходник](https://github.com/hey-api/hey-api/blob/main/packages/openapi-ts/src/config/output/config.ts)).
  Для Node type stripping `.js` не подходит: Node не переписывает `.js` → `.ts`.
  Поэтому `extension: '.ts'` нужно задать явно.
- React: свой плагин TanStack Query, но для старта хватает обычного SDK на fetch.
- Несколько job'ов в одном конфиге — массив конфигураций
  ([configuration → Multiple jobs](https://heyapi.dev/docs/openapi/typescript/configuration)).

### `openapi-typescript` + `openapi-fetch`

- 7.13.0 / 0.17.0, обе вышли 2026-02-11. Активность ниже (последний релиз
  8 месяцев назад). Peer `typescript: ^5.x`: при переходе на TS 6+ npm может
  выдать конфликт peer-зависимостей.
- enum: `--enum` по умолчанию `false` (генерируются string unions), есть ещё
  `--make-paths-enum` (тоже по умолчанию выключен)
  ([CLI](https://openapi-ts.dev/cli)).
- Результат — один файл типов (`paths`, `components`, `operations`).
  `openapi-fetch` — около 6 kB, зависит только от `openapi-typescript-helpers`
  ([docs](https://openapi-ts.dev/openapi-fetch/)).
- Сервер: кроме типов ничего нет. Типы Fastify-обработчиков пришлось бы
  связывать вручную (`paths['/x']['post']['requestBody']…`). Хороший запасной
  вариант, если плагин `fastify` у Hey API сломается.

### Orval

- 8.39.0 (2026-09-30), очень активен, но тянет ~20 пакетов `@orval/*` и peer'ы
  `typedoc`, `prettier`.
- enum: по умолчанию `const`-объект + тип. Документация прямо предупреждает:
  `enumGenerationType: 'enum'` не компилируется под `erasableSyntaxOnly`
  ([enums guide](https://orval.dev/docs/guides/enums)).
- `httpClient` по умолчанию `fetch`, умеет React Query. Генераторов для
  Fastify нет (есть `hono`). Учитывает `moduleResolution` и
  `allowImportingTsExtensions` из tsconfig.
- Вывод: подходит для клиента, но сервер всё равно пришлось бы закрывать
  другим инструментом, а зависимостей больше.

## 3. Сервер: Fastify 5

### Типы: плагин `fastify` в Hey API

- Статус в документации — **beta** ([Fastify plugin](https://heyapi.dev/docs/openapi/typescript/plugins/fastify)).
  Заявлена поддержка Fastify v5. Зависит только от `@hey-api/typescript`.
- Генерирует `fastify.gen.ts` с `export type RouteHandlers = { <op>: RouteHandler<{ Params, Body, Querystring, Headers, Reply }> }`.
  Импорты — `import type`, рантайм-кода нет.
- Официальный пример — связка с `fastify-openapi-glue` через `serviceHandlers`
  ([examples/openapi-ts-fastify](https://github.com/hey-api/hey-api/tree/main/examples/openapi-ts-fastify)).

### Маршруты и валидация: `fastify-openapi-glue`

- 4.11.5 (2026-09-18), MIT, `seriousme/fastify-openapi-glue`, последний пуш
  2026-10-01. ESM, `engines.node >=20`, devDependency `fastify ^5.12.5`.
  Зависимости: `fastify-plugin ^6`, `yaml`, `@seriousme/openapi-schema-validator`.
- Принимает `specification` (объект или путь к YAML/JSON) и `serviceHandlers`
  (объект, ключи — `operationId`) или `operationResolver(operationId, method, path)`.
  По спеке регистрирует маршруты Fastify и схемы `params/querystring/body/response`;
  проверку делает Ajv самого Fastify
  ([README](https://github.com/seriousme/fastify-openapi-glue#readme)).
- Ограничения из README: Ajv в Fastify по умолчанию работает с JSON Schema
  draft-07. Для конструкций draft-2020-12 из OpenAPI 3.1 нужно подключать
  `Ajv2020` ([schema2020.md](https://github.com/seriousme/fastify-openapi-glue/blob/master/docs/schema2020.md)).
  Отсюда совет оставить у TypeSpec `openapi-versions` по умолчанию (3.0.0).
  `servers[].url` игнорируется, префикс задаётся опцией `prefix`. Cookie не
  валидируются. По умолчанию Fastify приводит типы (`"1"` → `1`).

### Ловушка с operationId (проверено)

- Hey API именует ключи `RouteHandlers` так же, как функции SDK: `operationId`
  приводится к camelCase. TypeSpec `EventTypes_list` превращается в `eventTypesList`
  ([`operationToId`](https://github.com/hey-api/hey-api/blob/main/packages/shared/src/openApi/shared/utils/operation.ts)).
- glue ищет обработчик по `operationId` как есть: `if (operationId in serviceHandlers)`
  ([index.js](https://github.com/seriousme/fastify-openapi-glue/blob/master/index.js)).
- Если операции объявлены внутри `interface`, glue не находит обработчики:
  прогон дал `500 Operation EventTypes_list not implemented`.
- Решения (любое одно):
  1. операции без `interface` прямо в namespace сервиса или явный
     `@operationId("listEventTypes")` в camelCase — тогда имена совпадают
     (так в прогоне сработал `getHealth`);
  2. `operationResolver`, переводящий `EventTypes_list` → `eventTypesList`
     (проверено, все маршруты отвечают).

### Другие варианты для сервера

- `@fastify/type-provider-json-schema-to-ts` 5.0.0 (2024-12-23) и
  `json-schema-to-ts` 3.1.1 (2024-08-29) выводят типы из схем, объявленных в TS
  как `as const`. Нужно генерировать TS-константы схем (у Hey API есть плагин
  `@hey-api/schemas`) и регистрировать маршруты вручную, то есть маршруты не
  генерируются. Пакеты давно не обновлялись.
- `openapi-backend` 5.21.2 не зависит от фреймворка и подключается в Fastify
  как catch-all. Он дублирует роутинг и валидацию Fastify, поэтому лишний.

## 4. Совместимость с type stripping Node 24

По [документации Node 24](https://github.com/nodejs/node/blob/v24.x/doc/api/typescript.md)
(type stripping — Stability 2, Stable):

- `enum`, namespaces с рантайм-кодом и parameter properties требуют
  `--experimental-transform-types`.
- Расширения в импортах обязательны. `tsconfig` (`paths` и т. п.) Node не читает.
  Импорты типов без `type` ломаются в рантайме.
- **Node отказывается стрипать `.ts` внутри `node_modules`.** Проверено: из
  workspace-пакета через симлинк `node_modules/@app/contract` импорт
  работает только потому, что Node по умолчанию резолвит realpath. С
  `--preserve-symlinks` падает с `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`.

Что генерирует Hey API (проверено на 0.99.0): `enum` нет, namespaces и
parameter properties нет, `import type` / `export type` / inline `type` в
импортах на месте. С `module.extension: '.ts'` все относительные импорты
идут с `.ts`.

## 5. Раскладка и что коммитить

### Где лежит `.tsp`: каталог `contract/` в корне, а не workspace-пакет

Workspace-пакет (`packages/contract`, `workspaces: ["apps/*", "packages/*"]`)
обходится дороже:

- Dockerfile копирует в build-стадию манифесты поимённо
  (`COPY apps/api/package.json …`), туда добавится ещё один.
- Runtime-стадия копирует `node_modules` и `apps/api`. Симлинк
  `node_modules/@app/contract → ../../packages/contract` там окажется битым,
  если отдельно не скопировать `packages/contract`.
- Импорт `.ts` из пакета работает только благодаря резолву симлинков
  (см. п. 4).

С каталогом `contract/` (`main.tsp`, `tspconfig.yaml`, `generated/openapi.yaml`):

- `tsp` и `@hey-api/openapi-ts` — devDependencies корня, рядом с eslint/vitest;
  `fastify-openapi-glue` — dependency `apps/api`;
- TS-код генерируется прямо в потребителей и импортируется относительно:
  `apps/web/src/api/generated/`, `apps/api/src/generated/`;
- runtime-стадии Dockerfile нужна одна строка:
  `COPY contract/generated/openapi.yaml ./contract/generated/openapi.yaml`,
  потому что glue читает спеку при старте. Можно и без неё: опция Hey API
  `output.source: true` кладёт копию спеки `source.json` в каталог вывода
  (`apps/api/src/generated/`), и её покрывает существующий `COPY apps/api`.

Черновик `openapi-ts.config.ts` (проверен в прогоне, пути адаптированы):

```ts
import { defineConfig } from '@hey-api/openapi-ts'

export default defineConfig([
  {
    input: './contract/generated/openapi.yaml',
    output: { path: './apps/web/src/api/generated', module: { extension: '.ts' } },
    plugins: ['@hey-api/client-fetch', '@hey-api/typescript', '@hey-api/sdk'],
  },
  {
    input: './contract/generated/openapi.yaml',
    output: { path: './apps/api/src/generated', module: { extension: '.ts' } },
    plugins: ['@hey-api/typescript', 'fastify'],
  },
])
```

### Коммитить ли сгенерированное

Рекомендация: **коммитить** `openapi.yaml` и TS-артефакты, а в CI добавить
проверку дрейфа (`npm run generate && git diff --exit-code`).

- Плюсы: CI (`ci.yml`: lint → typecheck → test → build → smoke) и Docker
  (`npm ci` + `COPY . .`) работают без шага генерации. Ревьюер Хекслета видит
  OpenAPI в репозитории. Изменения контракта видны в diff PR. Проверка дрейфа
  ловит ручные правки сгенерированного.
- Минусы: шум в diff. Без проверки дрейфа артефакты могут разойтись с `.tsp`.
- Альтернатива: не коммитить, добавить `generated/` в `.gitignore` и запускать
  `generate` перед `typecheck`/`test`/`build`/`dev` (хуки `pre*` или явный шаг
  в CI и Dockerfile). Это больше точек, где генерацию можно забыть.

### Обязательные доработки при внедрении (найдено в прогоне)

- `apps/web/tsconfig.app.json`: `lib: ["ES2023", "DOM"]` → добавить
  `"DOM.Iterable"`, иначе `tsc` падает на `URLSearchParams.entries()` в
  сгенерированном `core/queryKeySerializer.gen.ts`.
- `eslint.config.mjs`: добавить `**/generated` в `globalIgnores`. Код
  генератора не обязан проходить правила проекта, правок руками он не допускает.
- Ответы 4xx/5xx, описанные в контракте, проходят через сериализацию Fastify по
  response-схеме. В прогоне ошибка валидации Fastify (`statusCode`, `error`,
  `message`) ушла клиенту как `{"message": "..."}`, потому что схема
  `ApiError` содержит только `message`. Формат ошибок нужно согласовать с
  контрактом.

## Проверка

Одноразовый проект в scratchpad (не в репозитории): Node 24.21.0, TypeScript 5.9.3,
точные версии `@typespec/*@1.16.0`, `@hey-api/openapi-ts@0.99.0`,
`fastify@5.12.5`, `fastify-openapi-glue@4.11.5`. Контракт: `enum`, модель с
`@minValue`, `interface` с `GET`/`GET {id}`/`POST` и `@error`-моделью, операция
прямо в namespace.

1. `tsp compile contract && openapi-ts` — OpenAPI 3.0.0 и оба job'а
   сгенерированы.
2. `tsc` с `module: nodenext`, `erasableSyntaxOnly`, `verbatimModuleSyntax`,
   `allowImportingTsExtensions` — без ошибок. С настройками как в
   `apps/web` (`bundler`, `noUnusedLocals`/`Parameters`) — без ошибок после
   добавления `DOM.Iterable`.
3. `node api/src/server.ts` (нативный type stripping, Fastify + glue +
   `RouteHandlers`): с `serviceHandlers` — 500 для операций из `interface`
   (ловушка с operationId). С `operationResolver` — 200/404/201, `POST` с
   `durationMinutes: 1` → 400 `body/durationMinutes must be >= 5`.
4. Размер в `node_modules`: `@typespec` ~9 MB, `@hey-api` ~5 MB,
   `@scalar` (зависимость openapi3) ~8 MB — всё это devDependencies. В рантайм
   попадает только `fastify-openapi-glue` (~126 KB) и его 3 зависимости.

## Открытые вопросы (решение человека)

1. Коммитить ли сгенерированные файлы (рекомендация — да, с проверкой дрейфа в CI).
2. Как именовать операции: `interface` + `operationResolver` или операции в
   namespace / явный `@operationId` в camelCase.
3. Версия OpenAPI: 3.0.0 по умолчанию (совместимо с draft-07 Ajv в Fastify) или
   3.1.0 (тогда `Ajv2020` в Fastify).
4. Готовы ли опираться на beta-плагин `fastify` и 0.x-версию Hey API с
   закреплённой точной версией. Запасной вариант для типов — `openapi-typescript`.
5. Где брать спеку в Docker-образе: строка `COPY` или `output.source`.
